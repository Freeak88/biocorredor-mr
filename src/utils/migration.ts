/**
 * Migration utilities — PocketBase version
 *
 * Original Firebase migration added geohash fields in batch.
 * With PocketBase, geohash is set on creation via the sighting form.
 * This file is kept for reference and future migration needs.
 */

import { pb } from '../lib/pb';
import { encodeGeohash } from './geohash';

export interface MigrationResult {
  processed: number;
  updated: number;
  skipped: number;
  errors: string[];
}

/**
 * Add geohash field to all PocketBase sightings that don't have one.
 */
export async function migrateAddGeohash(): Promise<MigrationResult> {
  const result: MigrationResult = {
    processed: 0,
    updated: 0,
    skipped: 0,
    errors: [],
  };

  try {
    const records = await pb.collection('sightings').getFullList();

    for (const record of records) {
      result.processed++;
      if (record.geohash) {
        result.skipped++;
        continue;
      }
      if (typeof record.lat !== 'number' || typeof record.lng !== 'number') {
        result.skipped++;
        continue;
      }

      try {
        const geohash = encodeGeohash(record.lat, record.lng, 9);
        await pb.collection('sightings').update(record.id, { geohash });
        result.updated++;
      } catch (err) {
        result.errors.push(`Record ${record.id}: ${err}`);
      }
    }
  } catch (err) {
    result.errors.push(`Failed to load records: ${err}`);
  }

  console.log('[Migration] Complete:', result);
  return result;
}

/**
 * Check migration status
 */
export async function getMigrationStatus(): Promise<{
  total: number;
  withGeohash: number;
  withoutGeohash: number;
}> {
  const records = await pb.collection('sightings').getFullList();
  let withGeohash = 0;
  let withoutGeohash = 0;

  for (const r of records) {
    if (r.geohash) withGeohash++;
    else withoutGeohash++;
  }

  return { total: records.length, withGeohash, withoutGeohash };
}
