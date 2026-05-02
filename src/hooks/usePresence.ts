import { useState, useEffect, useCallback } from 'react';
import { pb, getFileURL } from '../lib/pb';
import { logError, logInfo } from '../lib/logger';
import type { UserProfile, AuthUser } from '../types';

function toUserProfile(record: Record<string, any>): UserProfile {
  return {
    ...record,
    photoURL: record.avatar ? getFileURL(record, record.avatar) : undefined,
  } as UserProfile;
}

export function usePresence(user: AuthUser | null) {
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [onlineUsers, setOnlineUsers] = useState<UserProfile[]>([]);
  const [currentUserProfile, setCurrentUserProfile] = useState<UserProfile | null>(null);
  const [mapCentered, setMapCentered] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [locationWatchId, setLocationWatchId] = useState<number | null>(null);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  useEffect(() => {
    if (!user) {
      setCurrentUserProfile(null);
      setUserLocation(null);
      return;
    }

    const userId = user.uid;

    // Sync profile name/email
    pb.collection('users').update(userId, {
      name: user.displayName,
      last_seen: new Date().toISOString(),
    }).catch(err => logError('presence.profile-sync', 'No se pudo sincronizar el perfil', err, { userId }));

    // Subscribe to own profile changes
    let profileUnsub: (() => void) | undefined;
    let cancelled = false;

    (async () => {
      try {
        // Fetch initial profile
        const profile = await pb.collection('users').getOne(userId);
        if (!cancelled) setCurrentUserProfile(toUserProfile(profile));

        profileUnsub = await pb.collection('users').subscribe(userId, (e) => {
          if (!cancelled) {
            setCurrentUserProfile(toUserProfile(e.record));
          }
        });
      } catch (err) {
        console.error("Profile subscription error", err);
      }
    })();

    return () => {
      cancelled = true;
      if (profileUnsub) pb.collection('users').unsubscribe(userId).catch(() => {});
    };
  }, [user]);

  useEffect(() => {
    return () => {
      if (locationWatchId !== null) {
        navigator.geolocation.clearWatch(locationWatchId);
      }
    };
  }, [locationWatchId]);

  const requestUserLocation = useCallback(() => {
    if (!user) return;
    if (!('geolocation' in navigator)) {
      logInfo('presence.location', 'Geolocalización no disponible en este navegador');
      alert('La geolocalización no está disponible en este navegador.');
      return;
    }

    if (locationWatchId !== null) {
      setMapCentered(false);
      return;
    }

    const userId = user.uid;
    const watchId = navigator.geolocation.watchPosition(
      async (pos) => {
        const loc: [number, number] = [pos.coords.latitude, pos.coords.longitude];
        setUserLocation(loc);
        try {
          await pb.collection('users').update(userId, {
            last_lat: loc[0],
            last_lng: loc[1],
            last_seen: new Date().toISOString(),
          });
        } catch (err) {
          logError('presence.location-update', 'No se pudo guardar la ubicación del usuario', err, { userId });
        }
      },
      (err) => {
        logError('presence.location', 'El navegador rechazó o falló al obtener ubicación', err, {
          code: err.code,
          message: err.message,
        });
        alert('No se pudo obtener tu ubicación. Revisá permisos del navegador e intentá de nuevo.');
      },
      { enableHighAccuracy: true }
    );

    setLocationWatchId(watchId);
  }, [locationWatchId, user]);

  useEffect(() => {
    let cancelled = false;
    let usersUnsub: (() => void) | undefined;

    (async () => {
      try {
        // Initial load of online users (active in last 5 minutes)
        const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
        const filter = `last_seen >= "${fiveMinAgo}" && id != "${user?.uid || ''}"`;
        const result = await pb.collection('users').getFullList({ filter });
        if (!cancelled) {
          setOnlineUsers(result.filter(u => u.last_lat != null && u.last_lng != null).map(toUserProfile));
        }

        // Realtime subscription
        usersUnsub = await pb.collection('users').subscribe('*', (e) => {
          if (cancelled) return;
          const profile = toUserProfile(e.record);
          // Refresh the full list on any change
          pb.collection('users').getFullList({
            filter: `last_seen >= "${new Date(Date.now() - 5 * 60 * 1000).toISOString()}" && id != "${user?.uid || ''}"`,
          }).then(users => {
            if (!cancelled) {
              setOnlineUsers(users.filter(u => u.last_lat != null && u.last_lng != null).map(toUserProfile));
            }
          }).catch(err => logError('presence.online-users-refresh', 'No se pudo refrescar usuarios online', err));
        });
      } catch (err) {
        logError('presence.online-users', 'No se pudo cargar o suscribir usuarios online', err);
      }
    })();

    return () => {
      cancelled = true;
      if (usersUnsub) pb.collection('users').unsubscribe('*').catch(() => {});
    };
  }, [user]);

  const handleInstallClick = useCallback(async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
    }
  }, [deferredPrompt]);

  const getDistance = useCallback((lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }, []);

  return {
    userLocation,
    onlineUsers,
    currentUserProfile,
    mapCentered,
    setMapCentered,
    requestUserLocation,
    deferredPrompt,
    handleInstallClick,
    getDistance,
  };
}
