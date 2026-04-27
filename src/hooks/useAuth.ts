import { useState, useEffect, useCallback } from 'react';
import { pb } from '../lib/pb';
import type { UserProfile } from '../types';

export interface AuthUser {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string | null;
  isAnonymous: false;
}

function toAuthUser(record: Record<string, any> | null): AuthUser | null {
  if (!record) return null;
  return {
    uid: record.id,
    email: record.email || '',
    displayName: record.name || record.email?.split('@')[0] || `Explorador_${record.id.slice(0, 5)}`,
    photoURL: record.avatar ? pb.files.getURL(record, record.avatar) : null,
    isAnonymous: false,
  };
}

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const isAdmin = pb.authStore.record?.role === 'admin';
  const isAnonymous = false; // PocketBase has no anonymous auth

  useEffect(() => {
    // Restore session from authStore
    const current = pb.authStore.record;
    if (pb.authStore.isValid && current) {
      setUser(toAuthUser(current));
    }
    setLoading(false);

    // Listen for auth changes (login / logout / token refresh)
    const unsubscribe = pb.authStore.onChange((_token: string, record: Record<string, any> | null) => {
      setUser(toAuthUser(record));
      setLoading(false);
    });

    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, []);

  const handleLogin = useCallback(async () => {
    try {
      await pb.collection('users').authWithOAuth2({ provider: 'google' });
    } catch (error) {
      console.error("Google OAuth login failed", error);
    }
  }, []);

  const handleEmailLogin = useCallback(async (email: string, password: string) => {
    try {
      await pb.collection('users').authWithPassword(email, password);
    } catch (error) {
      console.error("Email login failed", error);
      throw error;
    }
  }, []);

  const handleRegister = useCallback(async (email: string, password: string, name: string) => {
    try {
      await pb.collection('users').create({
        email,
        password,
        passwordConfirm: password,
        name,
        role: 'user',
        points: 0,
        merits: [],
      });
      // Auto-login after registration
      await pb.collection('users').authWithPassword(email, password);
    } catch (error) {
      console.error("Registration failed", error);
      throw error;
    }
  }, []);

  const handleLogout = useCallback(async () => {
    pb.authStore.clear();
  }, []);

  return {
    user,
    loading,
    isAdmin,
    isAnonymous,
    handleLogin,
    handleEmailLogin,
    handleRegister,
    handleLogout,
    setLoading,
  };
}
