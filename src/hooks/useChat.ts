import { useState, useEffect, useCallback } from 'react';
import { pb, getFileURL, sortByDateDesc, withAuthRefresh } from '../lib/pb';
import { logError } from '../lib/logger';
import type { ChatMessage, AuthUser } from '../types';

const CHAT_RADIUS_OPTIONS = [1, 5, 20, 100, 0] as const;

function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function expandChatMessage(raw: Record<string, any>, fallbackUser?: AuthUser | null): ChatMessage {
  const userObj = raw.expand?.user;
  const userId = typeof raw.user === 'string' ? raw.user : raw.user?.id;
  const isFallbackUser = fallbackUser && userId === fallbackUser.uid;
  return {
    ...raw,
    userId,
    userName: userObj?.name || (isFallbackUser ? fallbackUser.displayName : '') || 'Explorador',
    userPhoto: userObj?.avatar ? getFileURL(userObj, userObj.avatar) : '',
  } as ChatMessage;
}

export function useChat(user: AuthUser | null, userLocation: [number, number] | null) {
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatRadius, setChatRadius] = useState(0);
  const [chatError, setChatError] = useState('');
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [showChat, setShowChat] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    (async () => {
      try {
        // Initial load
        const records = await pb.collection('chat_messages').getList(1, 200, {
          expand: 'user',
        });
        if (!cancelled) {
          setChatMessages(sortByDateDesc(records.items).map(record => expandChatMessage(record, user)));
        }

        // Realtime subscription
        unsubscribe = await pb.collection('chat_messages').subscribe('*', (e) => {
          if (cancelled) return;
          if (e.action === 'delete') {
            setChatMessages(prev => prev.filter(m => m.id !== e.record.id));
          } else {
            const expanded = expandChatMessage(e.record, user);
            setChatMessages(prev => {
              const idx = prev.findIndex(m => m.id === e.record.id);
              if (idx >= 0) {
                const next = [...prev];
                next[idx] = expanded;
                return next;
              }
              return [expanded, ...prev];
            });
          }
        });
      } catch (err) {
        logError('chat.load', 'No se pudo cargar o suscribir el chat', err);
      }
    })();

    return () => {
      cancelled = true;
      if (unsubscribe) {
        pb.collection('chat_messages').unsubscribe('*').catch(() => {});
      }
    };
  }, [user]);

  const handleSendMessage = useCallback(async (text: string): Promise<boolean> => {
    const trimmed = text.trim();
    if (!trimmed) return false;
    if (!user) {
      setChatError('Necesitás iniciar sesión para escribir.');
      return false;
    }
    if (!userLocation) {
      setChatError('Activá tu ubicación para enviar mensajes cercanos.');
      return false;
    }
    try {
      setChatError('');
      setIsSendingMessage(true);
      const created = await withAuthRefresh(() => pb.collection('chat_messages').create({
        user: user.uid,
        text: trimmed,
        lat: userLocation[0],
        lng: userLocation[1],
      }));
      const expanded = expandChatMessage(created, user);
      setChatMessages(prev => {
        if (prev.some(m => m.id === expanded.id)) return prev;
        return [expanded, ...prev];
      });
      return true;
    } catch (err) {
      setChatError('No se pudo enviar el mensaje. Probá de nuevo.');
      logError('chat.send', 'No se pudo enviar el mensaje', err, {
        hasLocation: Boolean(userLocation),
        userId: user.uid,
      });
      return false;
    } finally {
      setIsSendingMessage(false);
    }
  }, [user, userLocation]);

  const filteredMessages = chatMessages.filter(message => {
    if (chatRadius === 0) return true;
    if (!userLocation) return false;
    if (typeof message.lat !== 'number' || typeof message.lng !== 'number') return false;
    return distanceKm(userLocation[0], userLocation[1], message.lat, message.lng) <= chatRadius;
  });

  return {
    chatMessages,
    filteredMessages,
    chatRadius,
    setChatRadius,
    chatRadiusOptions: CHAT_RADIUS_OPTIONS,
    chatError,
    isSendingMessage,
    showChat,
    setShowChat,
    handleSendMessage,
  };
}
