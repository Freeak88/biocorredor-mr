// GeoQuery hook — migrated to PocketBase
// NOTE: PocketBase doesn't have native geohash queries like Firestore.
// For geographic queries, use PocketBase filter expressions with lat/lng ranges
// or implement a server-side geohash filter via a custom route/hook.
// This file is kept as a placeholder. The main sightings are loaded via useSightings.

import { useState, useEffect, useRef, useCallback } from 'react';
import { pb } from '../lib/pb';
import { encodeGeohash, isPointInBounds, viewportChangePercent } from '../utils/geohash';
import type { Sighting } from '../types';

export interface ViewportBounds {
  northEast: { lat: number; lng: number };
  southWest: { lat: number; lng: number };
}

interface GeoQueryState {
  sightings: Sighting[];
  loading: boolean;
  error: Error | null;
}

const CACHE_THRESHOLD = 0.20;

/**
 * useGeoQuery — PocketBase geographic query hook with viewport-based caching.
 *
 * Loads one page of sightings inside viewport bounds. For larger datasets,
 * consider a PocketBase custom endpoint with server-side geohash filtering.
 */
export function useGeoQuery(
  bounds: ViewportBounds | null,
  options: {
    limit?: number;
    minPrecision?: number;
  } = {}
): GeoQueryState {
  const [state, setState] = useState<GeoQueryState>({
    sightings: [],
    loading: false,
    error: null,
  });

  const cachedBoundsRef = useRef<ViewportBounds | null>(null);
  const cachedSightingsRef = useRef<Sighting[]>([]);

  useEffect(() => {
    if (!bounds) {
      setState({ sightings: [], loading: false, error: null });
      cachedBoundsRef.current = null;
      cachedSightingsRef.current = [];
      return;
    }

    // Check cache
    if (cachedBoundsRef.current) {
      const change = viewportChangePercent(cachedBoundsRef.current, bounds);
      if (change < CACHE_THRESHOLD && cachedSightingsRef.current.length > 0) {
        const filtered = cachedSightingsRef.current.filter(s =>
          isPointInBounds(s.lat, s.lng, bounds)
        );
        setState({ sightings: filtered, loading: false, error: null });
        return;
      }
    }

    setState(prev => ({ ...prev, loading: true }));

    const south = bounds.southWest.lat;
    const north = bounds.northEast.lat;
    const west = bounds.southWest.lng;
    const east = bounds.northEast.lng;
    const lngFilter = west <= east
      ? `lng >= ${west} && lng <= ${east}`
      : `(lng >= ${west} || lng <= ${east})`;

    pb.collection('sightings').getList(1, options.limit || 500, {
      sort: '-created',
      filter: `lat >= ${south} && lat <= ${north} && ${lngFilter}`,
      expand: 'user',
    }).then(records => {
      const sightings = records.items.map(r => ({
        ...r,
        mushroomName: r.mushroom_name,
        userName: (r as any).expand?.user?.name || '',
      })) as unknown as Sighting[];

      cachedSightingsRef.current = sightings;
      cachedBoundsRef.current = bounds;

      const filtered = sightings.filter(s => isPointInBounds(s.lat, s.lng, bounds));
      setState({ sightings: filtered, loading: false, error: null });
    }).catch(err => {
      setState({ sightings: [], loading: false, error: err as Error });
    });
  }, [bounds]);

  return state;
}

export function getMapBounds(map: any): ViewportBounds | null {
  if (!map) return null;
  const b = map.getBounds();
  if (!b) return null;
  return {
    northEast: { lat: b.getNorthEast().lat, lng: b.getNorthEast().lng },
    southWest: { lat: b.getSouthWest().lat, lng: b.getSouthWest().lng },
  };
}

export function distanceToSighting(
  userLat: number,
  userLng: number,
  sighting: Sighting
): number {
  const R = 6371;
  const dLat = (sighting.lat - userLat) * Math.PI / 180;
  const dLon = (sighting.lng - userLng) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(userLat * Math.PI / 180) * Math.cos(sighting.lat * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
