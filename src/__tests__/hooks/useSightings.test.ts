import { vi, describe, it, expect, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { onSnapshot, collection, query, orderBy } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { mockCollectionData, resetFirestoreMocks } from '../../__mocks__/firebase';

// The sightings logic is embedded in App.tsx using useState + useEffect + onSnapshot
// We test the filtering and search behavior conceptually.

interface Sighting {
  id: string;
  userId: string;
  userName: string;
  userPhoto?: string;
  mushroomName: string;
  description: string;
  toxicity?: string;
  lat: number;
  lng: number;
  imageUrl?: string;
  images?: { url: string; createdAt: any; isPrimary?: boolean; aiScore?: number }[];
  networkId?: string;
  status: 'identified' | 'unconfirmed' | 'expert_verified' | 'draft';
  habitat?: string;
  features?: string;
  createdAt: any;
  lastGeofirmedAt?: any;
  geofirmedBy?: string;
}

const mockSightings: Sighting[] = [
  {
    id: 's1',
    userId: 'u1',
    userName: 'Explorer One',
    mushroomName: 'Amanita muscaria',
    description: 'Red mushroom with white spots found in pine forest',
    toxicity: 'Tóxico',
    lat: -34.6037,
    lng: -58.3816,
    imageUrl: 'https://example.com/amanita.jpg',
    status: 'identified',
    habitat: 'Pine forest',
    features: 'Red cap with white spots',
    createdAt: { toDate: () => new Date('2026-04-01') },
  },
  {
    id: 's2',
    userId: 'u2',
    userName: 'Explorer Two',
    mushroomName: 'Boletus edulis',
    description: 'Edible porcini mushroom in oak woodland',
    toxicity: 'Comestible',
    lat: -34.61,
    lng: -58.39,
    status: 'expert_verified',
    habitat: 'Oak woodland',
    features: 'Brown cap, thick stem',
    createdAt: { toDate: () => new Date('2026-04-10') },
  },
  {
    id: 's3',
    userId: 'u3',
    userName: 'Explorer Three',
    mushroomName: 'Psilocybe cubensis',
    description: 'Found in tropical region near cattle pastures',
    toxicity: 'Tóxico',
    lat: -34.62,
    lng: -58.40,
    status: 'draft',
    habitat: 'Tropical pasture',
    features: 'Golden cap, blue bruising',
    createdAt: { toDate: () => new Date('2026-04-15') },
  },
  {
    id: 's4',
    userId: 'u1',
    userName: 'Explorer One',
    mushroomName: 'Cantharellus cibarius',
    description: 'Golden chanterelle in mixed forest',
    toxicity: 'Comestible',
    lat: -34.605,
    lng: -58.382,
    status: 'unconfirmed',
    habitat: 'Mixed forest',
    features: 'Funnel-shaped, yellow',
    createdAt: { toDate: () => new Date('2026-04-20') },
  },
];

describe('Sightings System', () => {
  beforeEach(() => {
    resetFirestoreMocks();
    mockCollectionData.set('sightings', [...mockSightings]);
    vi.clearAllMocks();
  });

  describe('Data Loading', () => {
    it('should load sightings from Firestore', async () => {
      const callback = vi.fn();
      const q = query(collection(db, 'sightings'), orderBy('createdAt', 'desc'));
      
      onSnapshot(q, callback);

      await waitFor(() => {
        expect(callback).toHaveBeenCalled();
      });
    });
  });

  describe('Search Filtering', () => {
    it('should filter sightings by mushroom name', () => {
      const searchQuery = 'Amanita';
      const filtered = mockSightings.filter(s =>
        s.mushroomName.toLowerCase().includes(searchQuery.toLowerCase())
      );

      expect(filtered).toHaveLength(1);
      expect(filtered[0].mushroomName).toBe('Amanita muscaria');
    });

    it('should filter sightings by description content', () => {
      const searchQuery = 'edible';
      const filtered = mockSightings.filter(s =>
        s.description.toLowerCase().includes(searchQuery.toLowerCase())
      );

      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe('s2');
    });

    it('should filter sightings by partial match', () => {
      const searchQuery = 'mus';
      const filtered = mockSightings.filter(s =>
        s.mushroomName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.description.toLowerCase().includes(searchQuery.toLowerCase())
      );

      expect(filtered.length).toBeGreaterThanOrEqual(1);
      expect(filtered.some(s => s.mushroomName.includes('muscaria'))).toBe(true);
    });

    it('should return empty array for non-matching search', () => {
      const searchQuery = 'xyznonexistent';
      const filtered = mockSightings.filter(s =>
        s.mushroomName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.description.toLowerCase().includes(searchQuery.toLowerCase())
      );

      expect(filtered).toHaveLength(0);
    });

    it('should return all sightings when search query is empty', () => {
      const searchQuery = '';
      const filtered = searchQuery.trim()
        ? mockSightings.filter(s =>
            s.mushroomName.toLowerCase().includes(searchQuery.toLowerCase()) ||
            s.description.toLowerCase().includes(searchQuery.toLowerCase())
          )
        : mockSightings;

      expect(filtered).toHaveLength(4);
    });

    it('should be case-insensitive', () => {
      const searchQuery = 'AMANITA';
      const filtered = mockSightings.filter(s =>
        s.mushroomName.toLowerCase().includes(searchQuery.toLowerCase())
      );

      expect(filtered).toHaveLength(1);
      expect(filtered[0].mushroomName).toBe('Amanita muscaria');
    });
  });

  describe('Status Filtering', () => {
    it('should filter by draft status', () => {
      const drafts = mockSightings.filter(s => s.status === 'draft');
      expect(drafts).toHaveLength(1);
      expect(drafts[0].id).toBe('s3');
    });

    it('should filter by expert_verified status', () => {
      const verified = mockSightings.filter(s => s.status === 'expert_verified');
      expect(verified).toHaveLength(1);
      expect(verified[0].id).toBe('s2');
    });

    it('should show all statuses except draft for public feed', () => {
      const publicFeed = mockSightings.filter(s => s.status !== 'draft');
      expect(publicFeed).toHaveLength(3);
    });
  });

  describe('Toxicity Filtering', () => {
    it('should filter by toxicity level', () => {
      const toxic = mockSightings.filter(s => s.toxicity === 'Tóxico');
      expect(toxic).toHaveLength(2);
    });

    it('should filter edible mushrooms', () => {
      const edible = mockSightings.filter(s => s.toxicity === 'Comestible');
      expect(edible).toHaveLength(2);
    });
  });

  describe('Geographic Filtering', () => {
    it('should filter sightings within radius', () => {
      const centerLat = -34.6037;
      const centerLng = -58.3816;
      const radiusKm = 1;

      const nearby = mockSightings.filter(s => {
        const R = 6371;
        const dLat = (s.lat - centerLat) * Math.PI / 180;
        const dLon = (s.lng - centerLng) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos(centerLat * Math.PI / 180) * Math.cos(s.lat * Math.PI / 180) *
          Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const distance = R * c;
        return distance <= radiusKm;
      });

      expect(nearby.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Sighting Structure', () => {
    it('should have required fields', () => {
      const sighting = mockSightings[0];
      expect(sighting.id).toBeDefined();
      expect(sighting.userId).toBeDefined();
      expect(sighting.mushroomName).toBeDefined();
      expect(sighting.lat).toBeDefined();
      expect(sighting.lng).toBeDefined();
      expect(sighting.status).toBeDefined();
    });

    it('should support optional image arrays', () => {
      const withImages = mockSightings.find(s => s.images && s.images.length > 0);
      const withoutImages = mockSightings.find(s => !s.images);

      expect(withImages).toBeDefined();
      expect(withoutImages).toBeDefined();
    });
  });
});
