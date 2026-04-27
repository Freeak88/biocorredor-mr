import { useMemo } from 'react';
import type { Sighting } from '../types';

export interface SpeciesStats {
  monthlyData: number[];        // 12 elements, index 0=Enero ... 11=Diciembre
  totalCount: number;
  firstSeen: string | null;     // ISO date string
  lastSeen: string | null;      // ISO date string
  latRange: [number, number] | null; // [min, max]
}

function getDate(s: Sighting): Date | null {
  const raw = s.created || s.createdAt;
  if (!raw) return null;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}

function getMushroomName(s: Sighting): string {
  return (s.mushroomName || s.mushroom_name || '').trim();
}

export function useSpeciesStats(
  mushroomName: string,
  sightings: Sighting[]
): SpeciesStats {
  return useMemo(() => {
    const empty: SpeciesStats = {
      monthlyData: new Array(12).fill(0),
      totalCount: 0,
      firstSeen: null,
      lastSeen: null,
      latRange: null,
    };

    if (!mushroomName || !sightings.length) return empty;

    // Use first word (genus) for broader matching
    const genus = mushroomName.split(' ')[0].toLowerCase();

    const sameSpecies = sightings.filter(s => {
      const name = getMushroomName(s);
      if (!name) return false;
      const nameGenus = name.split(' ')[0].toLowerCase();
      // Exact match OR same genus with at least one matching word after
      if (name.toLowerCase() === mushroomName.toLowerCase()) return true;
      if (nameGenus === genus && name.toLowerCase().includes(mushroomName.toLowerCase().split(' ').slice(0, 2).join(' '))) return true;
      return false;
    });

    if (!sameSpecies.length) return empty;

    const monthlyData = new Array(12).fill(0);
    let firstDate: Date | null = null;
    let lastDate: Date | null = null;
    let minLat = Infinity;
    let maxLat = -Infinity;

    for (const s of sameSpecies) {
      const d = getDate(s);
      if (d) {
        monthlyData[d.getMonth()]++;
        if (!firstDate || d < firstDate) firstDate = d;
        if (!lastDate || d > lastDate) lastDate = d;
      }
      if (typeof s.lat === 'number' && isFinite(s.lat)) {
        if (s.lat < minLat) minLat = s.lat;
        if (s.lat > maxLat) maxLat = s.lat;
      }
    }

    return {
      monthlyData,
      totalCount: sameSpecies.length,
      firstSeen: firstDate ? firstDate.toISOString() : null,
      lastSeen: lastDate ? lastDate.toISOString() : null,
      latRange: (minLat !== Infinity && maxLat !== -Infinity) ? [minLat, maxLat] : null,
    };
  }, [mushroomName, sightings]);
}
