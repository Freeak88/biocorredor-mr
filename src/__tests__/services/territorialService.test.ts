import { afterEach, describe, expect, it, vi } from 'vitest';
import { matchParcel } from '../../services/territorialService';

const parcelCollection = {
  type: 'FeatureCollection',
  features: [{
    type: 'Feature',
    properties: { nomenclatura: '003-A-001', partida: '12345', superficie_m2: 2500, tipo: 'Parcela' },
    geometry: { type: 'Polygon', coordinates: [[[-58.40, -34.90], [-58.30, -34.90], [-58.30, -34.80], [-58.40, -34.80], [-58.40, -34.90]]] },
  }],
};

describe('territorialService', () => {
  afterEach(() => vi.restoreAllMocks());

  it('matches a GPS point with the local GeoARBA parcel', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => parcelCollection }));
    const result = await matchParcel(-34.85, -58.36);
    expect(result.status).toBe('matched');
    expect(result.parcel_code).toBe('003-A-001');
    expect(result.partida).toBe('12345');
  });

  it('keeps an out-of-parcel point reviewable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => parcelCollection }));
    const result = await matchParcel(-34.75, -58.25);
    expect(result.status).toBe('indeterminate');
    expect(result.reason).toContain('no coincide');
  });
});
