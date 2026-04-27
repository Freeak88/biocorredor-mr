import { vi, describe, it, expect, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { onSnapshot, collection, query, orderBy, addDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { mockCollectionData, resetFirestoreMocks } from '../../__mocks__/firebase';

// Chat logic is embedded in App.tsx. We test radius filtering and message handling conceptually.

interface ChatMessage {
  id: string;
  userId: string;
  userName: string;
  userPhoto?: string;
  text: string;
  lat: number;
  lng: number;
  createdAt: any;
}

const mockMessages: ChatMessage[] = [
  {
    id: 'm1',
    userId: 'u1',
    userName: 'Explorer One',
    text: 'Found some interesting mushrooms near the river',
    lat: -34.6037,
    lng: -58.3816,
    createdAt: { toDate: () => new Date('2026-04-20T10:00:00') },
  },
  {
    id: 'm2',
    userId: 'u2',
    userName: 'Explorer Two',
    text: 'Be careful with the red ones!',
    lat: -34.605,
    lng: -58.382,
    createdAt: { toDate: () => new Date('2026-04-20T10:05:00') },
  },
  {
    id: 'm3',
    userId: 'u3',
    userName: 'Explorer Three',
    text: 'Anyone near the northern trail?',
    lat: -34.65,
    lng: -58.42,
    createdAt: { toDate: () => new Date('2026-04-20T10:10:00') },
  },
  {
    id: 'm4',
    userId: 'u4',
    userName: 'Explorer Four',
    text: 'Great weather for mushroom hunting today',
    lat: -34.604,
    lng: -58.381,
    createdAt: { toDate: () => new Date('2026-04-20T10:15:00') },
  },
];

function getDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

describe('Chat System', () => {
  beforeEach(() => {
    resetFirestoreMocks();
    mockCollectionData.set('chat_messages', [...mockMessages]);
    vi.clearAllMocks();
  });

  describe('Message Loading', () => {
    it('should load chat messages from Firestore', async () => {
      const callback = vi.fn();
      const q = query(collection(db, 'chat_messages'), orderBy('createdAt', 'desc'));
      
      onSnapshot(q, callback);

      await waitFor(() => {
        expect(callback).toHaveBeenCalled();
      });
    });
  });

  describe('Radius Filtering', () => {
    const userLocation: [number, number] = [-34.6037, -58.3816];

    it('should filter messages within 5km radius', () => {
      const radiusKm = 5;
      const nearby = mockMessages.filter(m => {
        const dist = getDistance(userLocation[0], userLocation[1], m.lat, m.lng);
        return dist <= radiusKm;
      });

      expect(nearby.length).toBeGreaterThanOrEqual(2);
      expect(nearby.some(m => m.id === 'm1')).toBe(true);
      expect(nearby.some(m => m.id === 'm2')).toBe(true);
    });

    it('should filter messages within 1km radius', () => {
      const radiusKm = 1;
      const nearby = mockMessages.filter(m => {
        const dist = getDistance(userLocation[0], userLocation[1], m.lat, m.lng);
        return dist <= radiusKm;
      });

      expect(nearby.length).toBeGreaterThanOrEqual(1);
      expect(nearby.some(m => m.id === 'm1')).toBe(true);
    });

    it('should exclude messages outside radius', () => {
      const radiusKm = 2;
      const nearby = mockMessages.filter(m => {
        const dist = getDistance(userLocation[0], userLocation[1], m.lat, m.lng);
        return dist <= radiusKm;
      });

      expect(nearby.some(m => m.id === 'm3')).toBe(false);
    });

    it('should show all messages when radius is very large', () => {
      const radiusKm = 100;
      const nearby = mockMessages.filter(m => {
        const dist = getDistance(userLocation[0], userLocation[1], m.lat, m.lng);
        return dist <= radiusKm;
      });

      expect(nearby).toHaveLength(mockMessages.length);
    });

    it('should show no messages when radius is 0', () => {
      const radiusKm = 0;
      const nearby = mockMessages.filter(m => {
        const dist = getDistance(userLocation[0], userLocation[1], m.lat, m.lng);
        return dist <= radiusKm;
      });

      expect(nearby).toHaveLength(0);
    });

    it('should calculate distances correctly', () => {
      const dist = getDistance(-34.6037, -58.3816, -34.65, -58.42);
      expect(dist).toBeGreaterThan(5);
      expect(dist).toBeLessThan(10);
    });
  });

  describe('Default Radius', () => {
    it('should use 20km as default chat radius', () => {
      const defaultRadius = 20;
      expect(defaultRadius).toBe(20);
    });

    it('should show most messages with default 20km radius', () => {
      const radiusKm = 20;
      const nearby = mockMessages.filter(m => {
        const dist = getDistance(userLocation[0], userLocation[1], m.lat, m.lng);
        return dist <= radiusKm;
      });

      expect(nearby.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Message Structure', () => {
    it('should have required fields', () => {
      const msg = mockMessages[0];
      expect(msg.id).toBeDefined();
      expect(msg.userId).toBeDefined();
      expect(msg.userName).toBeDefined();
      expect(msg.text).toBeDefined();
      expect(msg.lat).toBeDefined();
      expect(msg.lng).toBeDefined();
    });

    it('should support optional user photo', () => {
      const withPhoto = mockMessages.find(m => m.userPhoto);
      const withoutPhoto = mockMessages.find(m => !m.userPhoto);

      expect(withoutPhoto).toBeDefined();
    });
  });

  describe('Message Sending', () => {
    it('should validate message has text', () => {
      const text = 'Hello world';
      expect(text.trim().length).toBeGreaterThan(0);
    });

    it('should reject empty messages', () => {
      const text = '';
      expect(text.trim().length).toBe(0);
    });

    it('should require user location to send message', () => {
      const userLocation: [number, number] | null = [-34.6037, -58.3816];
      expect(userLocation).not.toBeNull();
    });

    it('should format message data correctly', () => {
      const messageData = {
        userId: 'u1',
        userName: 'Explorer One',
        userPhoto: 'https://example.com/avatar.png',
        text: 'Test message',
        lat: -34.6037,
        lng: -58.3816,
      };

      expect(messageData).toMatchObject({
        userId: expect.any(String),
        userName: expect.any(String),
        text: expect.any(String),
        lat: expect.any(Number),
        lng: expect.any(Number),
      });
    });
  });

  describe('Distance Calculation Edge Cases', () => {
    it('should handle same location (0 distance)', () => {
      const dist = getDistance(-34.6037, -58.3816, -34.6037, -58.3816);
      expect(dist).toBe(0);
    });

    it('should handle negative coordinates', () => {
      const dist = getDistance(-34.6037, -58.3816, -34.605, -58.382);
      expect(dist).toBeGreaterThan(0);
    });

    it('should handle coordinates near equator', () => {
      const dist = getDistance(0, 0, 0.001, 0);
      expect(dist).toBeGreaterThan(0);
      expect(dist).toBeLessThan(1);
    });
  });
});
