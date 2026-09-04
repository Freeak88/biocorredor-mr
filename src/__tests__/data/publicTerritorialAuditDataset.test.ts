import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

type Range = { min: number; max: number };
type AuditDataset = {
  meta: { updatedAt: string; disclaimer: string };
  quota: {
    assessment: string;
    productiveProxyHa: Range;
    ordinary10ProxyHa: Range;
    hypothetical15ProxyHa: Range;
    exceptionScreeningHa: number;
  };
  cases: Array<{
    id: string;
    kind: string;
    lat: number;
    lng: number;
    candidateEnvelopeHa?: number;
    annex11819?: { specificUseHa: number; recoveryHa: number };
    partidas?: string[];
    pending?: string[];
  }>;
  officialRequests: string[];
};

function readDataset(): AuditDataset {
  const p = path.resolve(process.cwd(), 'public/data/auditoria/hallazgos-publicos.json');
  return JSON.parse(fs.readFileSync(p, 'utf8')) as AuditDataset;
}

describe('public territorial audit dataset', () => {
  it('keeps proxy quota arithmetic explicit and internally consistent', () => {
    const data = readDataset();
    expect(data.quota.assessment).toBe('not_demonstrated_exceeded');
    expect(data.quota.ordinary10ProxyHa.min).toBeCloseTo(data.quota.productiveProxyHa.min * 0.10, 6);
    expect(data.quota.ordinary10ProxyHa.max).toBeCloseTo(data.quota.productiveProxyHa.max * 0.10, 6);
    expect(data.quota.hypothetical15ProxyHa.min).toBeCloseTo(data.quota.productiveProxyHa.min * 0.15, 1);
    expect(data.quota.hypothetical15ProxyHa.max).toBeCloseTo(data.quota.productiveProxyHa.max * 0.15, 1);
    expect(data.meta.disclaimer.toLowerCase()).toContain('no constituye una determinación');
  });

  it('keeps Saint Henri as a candidate envelope, not an approved legal polygon', () => {
    const data = readDataset();
    const sh = data.cases.find((row) => row.id === 'saint-henri');
    expect(sh).toBeTruthy();
    expect(sh?.candidateEnvelopeHa).toBeCloseTo(56.600442, 6);
    expect((sh?.annex11819?.specificUseHa ?? 0) + (sh?.annex11819?.recoveryHa ?? 0)).toBeCloseTo(sh?.candidateEnvelopeHa ?? 0, 6);
    expect(sh?.partidas).toHaveLength(8);
    expect((sh?.pending ?? []).join(' ').toLowerCase()).toContain('plano aprobado');
  });

  it('publishes only bounded navigation/screening coordinates and a concrete official request list', () => {
    const data = readDataset();
    for (const row of data.cases) {
      expect(row.lat).toBeGreaterThan(-35.1);
      expect(row.lat).toBeLessThan(-34.6);
      expect(row.lng).toBeGreaterThan(-58.7);
      expect(row.lng).toBeLessThan(-58.0);
    }
    expect(data.officialRequests.length).toBeGreaterThanOrEqual(8);
    expect(data.officialRequests.join(' ').toLowerCase()).toContain('compulsas');
    expect(data.officialRequests.join(' ').toLowerCase()).toContain('5%');
  });
});
