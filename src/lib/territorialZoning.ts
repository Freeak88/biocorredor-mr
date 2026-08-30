export type Ord11440Zone = 'R6' | 'ZRE';
export type Ord11819Zone = 'productiva' | 'recuperacion' | 'equipamiento' | 'uso_especifico' | 'preservacion';
export type EvidenceGrade = 'official_text' | 'official_annex_transcription' | 'cadastral_join' | 'pending_review';

export interface ParcelZoningRecord {
  cadastralKey: string;
  ordinance: '11440/19' | '11819/20';
  zone: Ord11440Zone | Ord11819Zone;
  evidenceGrade: EvidenceGrade;
  sourceUrl: string;
  sourcePage?: number;
  note?: string;
}

export interface ParcelZoningResolution {
  normalizedKey: string;
  ord11440: ParcelZoningRecord | null;
  ord11819: ParcelZoningRecord | null;
  conflicts: ParcelZoningRecord[];
}

/**
 * Cadastral joins must be exact after normalization. This deliberately avoids
 * fuzzy/spatial guessing because a wrong zoning assignment is worse than an
 * unresolved parcel in an audit workflow.
 */
export function normalizeCadastralKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '')
    .trim();
}

export function resolveParcelZoning(
  cadastralKey: string,
  records: ParcelZoningRecord[],
): ParcelZoningResolution {
  const normalizedKey = normalizeCadastralKey(cadastralKey);
  const matches = records.filter(record => normalizeCadastralKey(record.cadastralKey) === normalizedKey);

  const forOrd = (ordinance: ParcelZoningRecord['ordinance']) => matches.filter(record => record.ordinance === ordinance);
  const ord11440Matches = forOrd('11440/19');
  const ord11819Matches = forOrd('11819/20');

  const conflicts = [
    ...(new Set(ord11440Matches.map(record => record.zone)).size > 1 ? ord11440Matches : []),
    ...(new Set(ord11819Matches.map(record => record.zone)).size > 1 ? ord11819Matches : []),
  ];

  return {
    normalizedKey,
    ord11440: conflicts.some(record => record.ordinance === '11440/19') ? null : (ord11440Matches[0] ?? null),
    ord11819: conflicts.some(record => record.ordinance === '11819/20') ? null : (ord11819Matches[0] ?? null),
    conflicts,
  };
}

export function minimumLotAreaOrd11440(zone: Ord11440Zone | null): number | null {
  if (zone === 'R6') return 300;
  if (zone === 'ZRE') return 600;
  return null;
}

/**
 * Under Ord. 11.819/20 the ordinary quota is tied to the rural productive
 * area. Recovery/equipment/specific-use areas may host projects outside the
 * percentage subject to the ordinance's conditions. Preservation is never
 * treated here as automatically developable.
 */
export function quotaTreatmentFromOrd11819(zone: Ord11819Zone | null): 'counts' | 'outside_quota' | 'not_developable_by_rule' | 'unknown' {
  if (zone === 'productiva') return 'counts';
  if (zone === 'recuperacion' || zone === 'equipamiento' || zone === 'uso_especifico') return 'outside_quota';
  if (zone === 'preservacion') return 'not_developable_by_rule';
  return 'unknown';
}

export function minimumPrivateUnitOrd11819(context: 'rural_productive' | 'adjacent_urban' | 'degraded_or_specific' | null): number | null {
  if (context === 'rural_productive') return 2000;
  if (context === 'adjacent_urban') return 800;
  if (context === 'degraded_or_specific') return 600;
  return null;
}
