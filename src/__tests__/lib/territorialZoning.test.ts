import { describe, expect, it } from 'vitest';
import {
  minimumLotAreaOrd11440,
  minimumPrivateUnitOrd11819,
  normalizeCadastralKey,
  quotaTreatmentFromOrd11819,
  resolveParcelZoning,
  type ParcelZoningRecord,
} from '../../lib/territorialZoning';

const source = 'https://www.almirantebrown.gov.ar/';

describe('territorialZoning', () => {
  it('normalizes cadastral keys without relying on formatting', () => {
    expect(normalizeCadastralKey('Circ. IV - Secc. A - Qta. 12')).toBe('CIRCIVSECCAQTA12');
  });

  it('resolves only exact normalized cadastral joins', () => {
    const records: ParcelZoningRecord[] = [{
      cadastralKey: 'Circ IV Secc A Qta 12',
      ordinance: '11440/19',
      zone: 'ZRE',
      evidenceGrade: 'official_annex_transcription',
      sourceUrl: source,
    }];

    expect(resolveParcelZoning('Circ. IV / Secc A / Qta 12', records).ord11440?.zone).toBe('ZRE');
    expect(resolveParcelZoning('Circ. IV / Secc A / Qta 13', records).ord11440).toBeNull();
  });

  it('refuses a zoning conclusion when the same parcel conflicts', () => {
    const records: ParcelZoningRecord[] = [
      { cadastralKey: 'ABC-123', ordinance: '11440/19', zone: 'R6', evidenceGrade: 'official_annex_transcription', sourceUrl: source },
      { cadastralKey: 'ABC 123', ordinance: '11440/19', zone: 'ZRE', evidenceGrade: 'pending_review', sourceUrl: source },
    ];
    const resolution = resolveParcelZoning('ABC123', records);
    expect(resolution.ord11440).toBeNull();
    expect(resolution.conflicts).toHaveLength(2);
  });

  it('keeps the verified 11.440 minimum-lot rules explicit', () => {
    expect(minimumLotAreaOrd11440('R6')).toBe(300);
    expect(minimumLotAreaOrd11440('ZRE')).toBe(600);
    expect(minimumLotAreaOrd11440(null)).toBeNull();
  });

  it('maps 11.819 zoning to quota treatment without guessing unknown zones', () => {
    expect(quotaTreatmentFromOrd11819('productiva')).toBe('counts');
    expect(quotaTreatmentFromOrd11819('recuperacion')).toBe('outside_quota');
    expect(quotaTreatmentFromOrd11819('equipamiento')).toBe('outside_quota');
    expect(quotaTreatmentFromOrd11819('uso_especifico')).toBe('outside_quota');
    expect(quotaTreatmentFromOrd11819('preservacion')).toBe('not_developable_by_rule');
    expect(quotaTreatmentFromOrd11819(null)).toBe('unknown');
  });

  it('keeps 11.819 private-unit contexts explicit', () => {
    expect(minimumPrivateUnitOrd11819('rural_productive')).toBe(2000);
    expect(minimumPrivateUnitOrd11819('adjacent_urban')).toBe(800);
    expect(minimumPrivateUnitOrd11819('degraded_or_specific')).toBe(600);
    expect(minimumPrivateUnitOrd11819(null)).toBeNull();
  });
});
