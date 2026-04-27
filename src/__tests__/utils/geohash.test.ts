import { vi, describe, it, expect } from 'vitest';
import {
  encodeGeohash,
  decodeGeohash,
  haversineDistance,
  geohashPrecisionForRadius,
  getGeohashRanges,
  isPointInBounds,
  viewportChangePercent,
} from '../../utils/geohash';

describe('Geohash Utilities', () => {
  // ─── encodeGeohash ──────────────────────────────────────────

  describe('encodeGeohash', () => {
    it('should return a string of correct length', () => {
      expect(encodeGeohash(-34.6037, -58.3816, 9).length).toBe(9);
      expect(encodeGeohash(-34.6037, -58.3816, 5).length).toBe(5);
      expect(encodeGeohash(0, 0, 1).length).toBe(1);
    });

    it('should only contain valid base32 characters', () => {
      const hash = encodeGeohash(-34.6037, -58.3816, 9);
      expect(/^[0-9bcdefghjkmnpqrstuvwxyz]+$/.test(hash)).toBe(true);
    });

    it('should be deterministic for the same input', () => {
      const a = encodeGeohash(48.8566, 2.3522, 9);
      const b = encodeGeohash(48.8566, 2.3522, 9);
      expect(a).toBe(b);
    });

    it('should produce different hashes for distant coordinates', () => {
      const ba = encodeGeohash(-34.6037, -58.3816, 9);
      const nyc = encodeGeohash(40.7128, -74.0060, 9);
      expect(ba).not.toBe(nyc);
    });

    it('should produce similar prefixes for nearby coordinates', () => {
      const a = encodeGeohash(-34.6037, -58.3816, 9);
      const b = encodeGeohash(-34.6038, -58.3817, 9);
      expect(a.substring(0, 6)).toBe(b.substring(0, 6));
    });

    it('should handle edge coordinates (poles)', () => {
      expect(() => encodeGeohash(90, 180, 5)).not.toThrow();
      expect(() => encodeGeohash(-90, -180, 5)).not.toThrow();
    });

    it('should handle origin', () => {
      const hash = encodeGeohash(0, 0, 5);
      expect(hash).toBe('s0000'); // Known geohash for (0,0)
    });

    it('should default to precision 9', () => {
      const hash = encodeGeohash(51.5074, -0.1278);
      expect(hash.length).toBe(9);
    });
  });

  // ─── decodeGeohash ──────────────────────────────────────────

  describe('decodeGeohash', () => {
    it('should return lat/lng within valid ranges', () => {
      const { lat, lng } = decodeGeohash('6gkzmg');
      expect(lat).toBeGreaterThanOrEqual(-90);
      expect(lat).toBeLessThanOrEqual(90);
      expect(lng).toBeGreaterThanOrEqual(-180);
      expect(lng).toBeLessThanOrEqual(180);
    });

    it('should throw on invalid characters', () => {
      expect(() => decodeGeohash('invalid!')).toThrow('Invalid geohash character');
    });

    it('should approximately round-trip encode → decode', () => {
      const originalLat = -34.6037;
      const originalLng = -58.3816;
      const precision = 8;
      const hash = encodeGeohash(originalLat, originalLng, precision);
      const decoded = decodeGeohash(hash);

      // Precision 8 ≈ 19m x 19m, so error should be < 0.001 degrees
      expect(Math.abs(decoded.lat - originalLat)).toBeLessThan(0.01);
      expect(Math.abs(decoded.lng - originalLng)).toBeLessThan(0.01);
    });

    it('should handle single character geohash', () => {
      const { lat, lng } = decodeGeohash('s');
      expect(lat).toBeGreaterThan(-90);
      expect(lat).toBeLessThan(90);
      expect(lng).toBeGreaterThan(-180);
      expect(lng).toBeLessThan(180);
    });
  });

  // ─── haversineDistance ──────────────────────────────────────

  describe('haversineDistance', () => {
    it('should return 0 for identical coordinates', () => {
      const dist = haversineDistance(-34.6037, -58.3816, -34.6037, -58.3816);
      expect(dist).toBe(0);
    });

    it('should calculate Buenos Aires intra-city distance correctly', () => {
      const dist = haversineDistance(-34.6037, -58.3816, -34.61, -58.39);
      expect(dist).toBeGreaterThan(0);
      expect(dist).toBeLessThan(2);
    });

    it('should calculate Buenos Aires → São Paulo (~1670 km)', () => {
      const dist = haversineDistance(-34.6037, -58.3816, -23.5505, -46.6333);
      expect(dist).toBeGreaterThan(1600);
      expect(dist).toBeLessThan(1800);
    });

    it('should calculate a large distance (BA → NYC)', () => {
      const dist = haversineDistance(-34.6037, -58.3816, 40.7128, -74.0060);
      expect(dist).toBeGreaterThan(8000);
      expect(dist).toBeLessThan(9000);
    });

    it('should be symmetric', () => {
      const d1 = haversineDistance(-34.6037, -58.3816, 40.7128, -74.0060);
      const d2 = haversineDistance(40.7128, -74.0060, -34.6037, -58.3816);
      expect(Math.abs(d1 - d2)).toBeLessThan(0.001);
    });
  });

  // ─── geohashPrecisionForRadius ──────────────────────────────

  describe('geohashPrecisionForRadius', () => {
    it('should return precision 1 for very large radii', () => {
      expect(geohashPrecisionForRadius(5000)).toBe(1);
    });

    it('should return precision 9 for very small radii', () => {
      expect(geohashPrecisionForRadius(0.005)).toBe(9);
    });

    it('should return decreasing precision for increasing radius', () => {
      const p5 = geohashPrecisionForRadius(5);
      const p50 = geohashPrecisionForRadius(50);
      const p500 = geohashPrecisionForRadius(500);
      expect(p5).toBeGreaterThan(p50);
      expect(p50).toBeGreaterThan(p500);
    });

    it('should return valid precision range (1-9)', () => {
      for (const r of [0.001, 0.1, 1, 10, 100, 1000, 5000]) {
        const p = geohashPrecisionForRadius(r);
        expect(p).toBeGreaterThanOrEqual(1);
        expect(p).toBeLessThanOrEqual(9);
      }
    });
  });

  // ─── getGeohashRanges ──────────────────────────────────────

  describe('getGeohashRanges', () => {
    it('should return at least one range', () => {
      const ranges = getGeohashRanges({
        northEast: { lat: -34.5, lng: -58.3 },
        southWest: { lat: -34.7, lng: -58.5 },
      });
      expect(ranges.length).toBeGreaterThanOrEqual(1);
      ranges.forEach(r => {
        expect(r.start).toBeDefined();
        expect(r.end).toBeDefined();
        expect(typeof r.start).toBe('string');
        expect(typeof r.end).toBe('string');
      });
    });

    it('should produce start <= end for each range', () => {
      const ranges = getGeohashRanges({
        northEast: { lat: -34.55, lng: -58.35 },
        southWest: { lat: -34.65, lng: -58.45 },
      });
      ranges.forEach(r => {
        expect(r.start.localeCompare(r.end)).toBeLessThanOrEqual(0);
      });
    });

    it('should handle small viewport (single range)', () => {
      const ranges = getGeohashRanges({
        northEast: { lat: -34.603, lng: -58.381 },
        southWest: { lat: -34.605, lng: -58.383 },
      });
      expect(ranges.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ─── isPointInBounds ───────────────────────────────────────

  describe('isPointInBounds', () => {
    const bounds = {
      northEast: { lat: -34.5, lng: -58.3 },
      southWest: { lat: -34.7, lng: -58.5 },
    };

    it('should return true for point inside bounds', () => {
      expect(isPointInBounds(-34.6, -58.4, bounds)).toBe(true);
    });

    it('should return false for point outside bounds (lat too high)', () => {
      expect(isPointInBounds(-34.4, -58.4, bounds)).toBe(false);
    });

    it('should return false for point outside bounds (lng too low)', () => {
      expect(isPointInBounds(-34.6, -58.6, bounds)).toBe(false);
    });

    it('should return true for point on edge', () => {
      expect(isPointInBounds(-34.5, -58.3, bounds)).toBe(true);
      expect(isPointInBounds(-34.7, -58.5, bounds)).toBe(true);
    });
  });

  // ─── viewportChangePercent ─────────────────────────────────

  describe('viewportChangePercent', () => {
    it('should return 0 for identical bounds', () => {
      const bounds = {
        northEast: { lat: -34.5, lng: -58.3 },
        southWest: { lat: -34.7, lng: -58.5 },
      };
      expect(viewportChangePercent(bounds, bounds)).toBe(0);
    });

    it('should return 1 when old area is 0', () => {
      const zeroBounds = {
        northEast: { lat: 0, lng: 0 },
        southWest: { lat: 0, lng: 0 },
      };
      const newBounds = {
        northEast: { lat: 1, lng: 1 },
        southWest: { lat: 0, lng: 0 },
      };
      expect(viewportChangePercent(zeroBounds, newBounds)).toBe(1);
    });

    it('should return positive value for different bounds', () => {
      const old = {
        northEast: { lat: -34.5, lng: -58.3 },
        southWest: { lat: -34.7, lng: -58.5 },
      };
      const newB = {
        northEast: { lat: -34.4, lng: -58.2 },
        southWest: { lat: -34.8, lng: -58.6 },
      };
      const change = viewportChangePercent(old, newB);
      expect(change).toBeGreaterThan(0);
      expect(change).toBeLessThanOrEqual(1);
    });
  });
});
