import { describe, expect, it } from 'vitest';
import { SAMPLING_EFFORT_UNIT_MEANINGS, SAMPLING_EFFORT_UNITS } from '../../lib/sampling';

describe('sampling effort unit contract', () => {
  it('exposes the canonical PocketBase catalog in stable order', () => {
    expect(SAMPLING_EFFORT_UNITS).toEqual([
      'minutes', 'observer_minutes', 'meters', 'kilometers', 'square_meters', 'points', 'point_minutes', 'other',
    ]);
    expect(Object.keys(SAMPLING_EFFORT_UNIT_MEANINGS)).toEqual([...SAMPLING_EFFORT_UNITS]);
  });

  it('keeps observer minutes and point minutes semantically distinct', () => {
    expect(SAMPLING_EFFORT_UNIT_MEANINGS.observer_minutes).not.toBe(SAMPLING_EFFORT_UNIT_MEANINGS.minutes);
    expect(SAMPLING_EFFORT_UNIT_MEANINGS.point_minutes).not.toBe(SAMPLING_EFFORT_UNIT_MEANINGS.points);
  });
});
