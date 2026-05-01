import { useState, useEffect, useCallback } from 'react';
import { pb, getFileURL, withAuthRefresh } from '../lib/pb';
import type { ChatMessage, AuthUser } from '../types';

function expandChatMessage(raw: Record<string, any>): ChatMessage {
  const userObj = raw.expand?.user;
  return {
    ...raw,
    userName: userObj?.name || '',
    userPhoto: userObj?.avatar ? getFileURL(userObj, userObj.avatar) : '',
  } as ChatMessage;
}

export function useChat(user: AuthUser | null, userLocation: [number, number] | null) {
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatRadius, setChatRadius] = useState(20);
  const [showChat, setShowChat] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    (async () => {
      try {
        // Initial load
        const records = await pb.collection('chat_messages').getList(1, 200, {
          sort: '-created',
          expand: 'user',
        });
        if (!cancelled) {
          setChatMessages(records.items.map(expandChatMessage));
        }

        // Realtime subscription
        unsubscribe = await pb.collection('chat_messages').subscribe('*', (e) => {
          if (cancelled) return;
          if (e.action === 'delete') {
            setChatMessages(prev => prev.filter(m => m.id !== e.record.id));
          } else {
            const expanded = expandChatMessage(e.record);
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
        console.error("Chat subscription error", err);
      }
    })();

    return () => {
      cancelled = true;
      if (unsubscribe) {
        pb.collection('chat_messages').unsubscribe('*').catch(() => {});
      }
    };
  }, []);

  const handleSendMessage = useCallback(async (text: string) => {
    if (!user || !userLocation || !text.trim()) return;
    try {
      await withAuthRefresh(() => pb.collection('chat_messages').create({
        user: user.uid,
        text,
        lat: userLocation[0],
        lng: userLocation[1],
      }));
    } catch (err) {
      console.error("Send message error", err);
    }
  }, [user, userLocation]);

  const filteredMessages = chatMessages;

  return {
    chatMessages,
    filteredMessages,
    chatRadius,
    setChatRadius,
    showChat,
    setShowChat,
    handleSendMessage,
  };
}
