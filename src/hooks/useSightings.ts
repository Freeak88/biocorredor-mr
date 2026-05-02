import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { pb, getFileURL, sortByDateDesc } from '../lib/pb';
import { logError } from '../lib/logger';
import { isPointInBounds, viewportChangePercent } from '../utils/geohash';
import { listSightingsInViewport } from '../services/sightingsService';
import type { ViewportBounds } from './useGeoQuery';
import type { Sighting } from '../types';

function expandSighting(raw: Record<string, any>): Sighting {
  const userObj = raw.expand?.user;
  const isGbif = raw.status === 'gbif_import';
  const isMo = raw.network_id?.startsWith('mo_');
  const gbifId = raw.network_id?.startsWith('gbif_') ? raw.network_id.replace('gbif_', '') : null;
  const moId = isMo ? raw.network_id.replace('mo_', '') : null;
  const imageUrl = raw.images?.length
    ? getFileURL(raw, raw.images[0])
    : (raw.gbif_image_url || '');
  return {
    ...raw,
    mushroomName: raw.mushroom_name,
    userName: isGbif ? (isMo ? 'Mushroom Observer' : 'GBIF') : (userObj?.name || ''),
    userPhoto: isGbif ? '' : (userObj?.avatar ? getFileURL(userObj, userObj.avatar) : ''),
    imageUrl,
    isGbif,
    userId: typeof raw.user === 'string' ? raw.user : raw.user?.id,
    gbifUrl: gbifId ? `https://www.gbif.org/occurrence/${gbifId}` : undefined,
    gbif_image_url: raw.gbif_image_url || '',
    // MO-specific
    ...(isMo ? { moUrl: `https://mushroomobserver.org/observations/${moId}`, sourceName: 'Mushroom Observer' } : {}),
  } as Sighting;
}

// ── Layer visibility preferences ──
interface LayerToggles {
  showGbif: boolean;
  showMine: boolean;
  showOthers: boolean;
}

const LAYER_STORAGE_KEY = 'fungimap-layers';
const PAGE_SIZE = 500;
const CACHE_THRESHOLD = 0.20;

function loadLayerToggles(): LayerToggles {
  try {
    const raw = localStorage.getItem(LAYER_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { showGbif: true, showMine: true, showOthers: true };
}

function saveLayerToggles(t: LayerToggles) {
  try { localStorage.setItem(LAYER_STORAGE_KEY, JSON.stringify(t)); } catch {}
}

export function useSightings(currentUserId?: string) {
  const [sightings, setSightings] = useState<Sighting[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [layerToggles, setLayerToggles] = useState<LayerToggles>(loadLayerToggles);
  const [mapBounds, setMapBoundsState] = useState<ViewportBounds | null>(null);
  const cachedBoundsRef = useRef<ViewportBounds | null>(null);
  const cachedSightingsRef = useRef<Sighting[]>([]);

  const setMapBounds = useCallback((next: ViewportBounds | null) => {
    setMapBoundsState(prev => {
      if (!prev || !next) return next;
      const same =
        prev.northEast.lat === next.northEast.lat &&
        prev.northEast.lng === next.northEast.lng &&
        prev.southWest.lat === next.southWest.lat &&
        prev.southWest.lng === next.southWest.lng;
      return same ? prev : next;
    });
  }, []);

  const updateLayerToggle = useCallback(<K extends keyof LayerToggles>(key: K, value: LayerToggles[K]) => {
    setLayerToggles(prev => {
      const next = { ...prev, [key]: value };
      saveLayerToggles(next);
      return next;
    });
  }, []);

  const isInCurrentBounds = useCallback((sighting: Sighting) => {
    if (!mapBounds) return false;
    return isPointInBounds(sighting.lat, sighting.lng, mapBounds);
  }, [mapBounds]);

  const loadSightings = useCallback(async (bounds = mapBounds) => {
    if (!bounds) {
      setSightings([]);
      return;
    }

    const cachedBounds = cachedBoundsRef.current;
    const cachedSightings = cachedSightingsRef.current;
    if (cachedBounds && cachedSightings.length > 0 && viewportChangePercent(cachedBounds, bounds) < CACHE_THRESHOLD) {
      setSightings(cachedSightings.filter(s => isPointInBounds(s.lat, s.lng, bounds)));
      return;
    }

    try {
      const records = await listSightingsInViewport(bounds, PAGE_SIZE);
      const expanded = sortByDateDesc(records.items).map(expandSighting);
      cachedBoundsRef.current = bounds;
      cachedSightingsRef.current = expanded;
      setSightings(expanded);
    } catch (err) {
      logError('sightings.load', 'No se pudieron cargar los hallazgos del viewport', err, {
        bounds,
        pageSize: PAGE_SIZE,
      });
    }
  }, [mapBounds]);

  useEffect(() => {
    loadSightings(mapBounds);
  }, [loadSightings, mapBounds]);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    (async () => {
      try {
        unsubscribe = await pb.collection('sightings').subscribe('*', (e) => {
          if (cancelled) return;
          if (e.action === 'delete') {
            setSightings(prev => prev.filter(s => s.id !== e.record.id));
          } else {
            const expanded = expandSighting(e.record);
            if (!isInCurrentBounds(expanded)) {
              setSightings(prev => prev.filter(s => s.id !== e.record.id));
              return;
            }
            setSightings(prev => {
              const idx = prev.findIndex(s => s.id === e.record.id);
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
        logError('sightings.realtime', 'No se pudo suscribir a cambios de hallazgos', err);
      }
    })();

    return () => {
      cancelled = true;
      if (unsubscribe) {
        pb.collection('sightings').unsubscribe('*').catch(() => {});
      }
    };
  }, [isInCurrentBounds]);

  // ── Split by type ──
  const userSightings = useMemo(
    () => sightings.filter(s => !s.isGbif),
    [sightings]
  );

  const gbifSightings = useMemo(
    () => sightings.filter(s => s.isGbif),
    [sightings]
  );

  // ── Combined filtered by search + layer toggles ──
  const filteredSightings = useMemo(() => {
    const uid = currentUserId;
    let pool: Sighting[];

    // Start from search-filtered sightings
    const searched = !searchQuery.trim()
      ? sightings
      : sightings.filter(s =>
          (s.mushroomName || s.mushroom_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
          (s.description || '').toLowerCase().includes(searchQuery.toLowerCase())
        );

    // Apply layer toggles
    pool = searched.filter(s => {
      if (s.isGbif) return layerToggles.showGbif;
      const isMine = uid && (s.userId === uid || (typeof s.user === 'string' && s.user === uid));
      if (isMine) return layerToggles.showMine;
      return layerToggles.showOthers;
    });

    return pool;
  }, [sightings, searchQuery, layerToggles, currentUserId]);

  const findNearbyMycelium = useCallback((lat: number, lng: number, speciesName: string) => {
    const RADIUS_THRESHOLD = 0.0001;
    const match = sightings.find(s => {
      const dist = Math.sqrt(Math.pow(s.lat - lat, 2) + Math.pow(s.lng - lng, 2));
      const sameSpecies = (s.mushroomName || s.mushroom_name || '').toLowerCase().includes(speciesName.split(' ')[0].toLowerCase());
      return dist < RADIUS_THRESHOLD && sameSpecies;
    });
    return match ? (match.network_id || match.id) : null;
  }, [sightings]);

  return {
    sightings,
    userSightings,
    gbifSightings,
    filteredSightings,
    searchQuery,
    setSearchQuery,
    layerToggles,
    updateLayerToggle,
    mapBounds,
    setMapBounds,
    findNearbyMycelium,
    reload: loadSightings,
  };
}
