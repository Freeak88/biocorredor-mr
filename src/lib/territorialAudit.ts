export type QuotaTreatment = 'counts' | 'outside_quota' | 'unknown';
export type AdditionalQuotaStatus = 'not_activated' | 'activated' | 'unknown';
export type VerificationStatus = 'documented' | 'partial' | 'priority_review';

export interface TerritorialDevelopment {
  id: string;
  name: string;
  locality: string;
  address?: string;
  anchor?: { lat: number; lng: number };
  advertisedGrossHa?: number;
  advertisedLots?: number;
  advertisedLotMinM2?: number;
  advertisedLotMaxM2?: number;
  quotaTreatment: QuotaTreatment;
  verificationStatus: VerificationStatus;
  expediente?: string;
  notes?: string[];
  evidenceUrls?: string[];
}

export interface QuotaInput {
  grossRuralHa: number;
  excludedHa: number;
  countableApprovedHa: number;
  additionalQuotaStatus: AdditionalQuotaStatus;
}

export interface QuotaResult {
  computableBaseHa: number;
  ordinaryCapHa: number;
  additionalCapHa: number | null;
  authorizedCapHa: number | null;
  usedHa: number;
  ordinaryRemainingHa: number;
  authorizedRemainingHa: number | null;
  ordinaryUsagePct: number | null;
  status: 'invalid_input' | 'within_ordinary' | 'ordinary_exhausted' | 'requires_additional_proof' | 'within_additional' | 'over_authorized';
}

function finiteNonNegative(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

export function calculateTerritorialQuota(input: QuotaInput): QuotaResult {
  const { grossRuralHa, excludedHa, countableApprovedHa, additionalQuotaStatus } = input;

  if (
    !finiteNonNegative(grossRuralHa) ||
    !finiteNonNegative(excludedHa) ||
    !finiteNonNegative(countableApprovedHa) ||
    excludedHa > grossRuralHa
  ) {
    return {
      computableBaseHa: 0,
      ordinaryCapHa: 0,
      additionalCapHa: null,
      authorizedCapHa: null,
      usedHa: countableApprovedHa,
      ordinaryRemainingHa: 0,
      authorizedRemainingHa: null,
      ordinaryUsagePct: null,
      status: 'invalid_input',
    };
  }

  const computableBaseHa = grossRuralHa - excludedHa;
  const ordinaryCapHa = computableBaseHa * 0.10;
  const additionalCapHa = additionalQuotaStatus === 'activated' ? computableBaseHa * 0.05 : null;
  const authorizedCapHa = additionalQuotaStatus === 'activated'
    ? ordinaryCapHa + (additionalCapHa ?? 0)
    : additionalQuotaStatus === 'not_activated'
      ? ordinaryCapHa
      : null;

  const ordinaryRemainingHa = ordinaryCapHa - countableApprovedHa;
  const authorizedRemainingHa = authorizedCapHa == null ? null : authorizedCapHa - countableApprovedHa;
  const ordinaryUsagePct = ordinaryCapHa > 0 ? (countableApprovedHa / ordinaryCapHa) * 100 : null;

  let status: QuotaResult['status'];
  if (countableApprovedHa < ordinaryCapHa) {
    status = 'within_ordinary';
  } else if (countableApprovedHa === ordinaryCapHa) {
    status = 'ordinary_exhausted';
  } else if (additionalQuotaStatus === 'unknown') {
    status = 'requires_additional_proof';
  } else if (additionalQuotaStatus === 'activated' && authorizedCapHa != null && countableApprovedHa <= authorizedCapHa) {
    status = 'within_additional';
  } else {
    status = 'over_authorized';
  }

  return {
    computableBaseHa,
    ordinaryCapHa,
    additionalCapHa,
    authorizedCapHa,
    usedHa: countableApprovedHa,
    ordinaryRemainingHa,
    authorizedRemainingHa,
    ordinaryUsagePct,
    status,
  };
}

export function minimumPrivateUnitForContext(context: 'rural_productive' | 'adjacent_urban' | 'degraded_or_specific'): number {
  if (context === 'rural_productive') return 2000;
  if (context === 'adjacent_urban') return 800;
  return 600;
}

export function lotSizeRequiresReview(lotM2: number | undefined, context: 'rural_productive' | 'adjacent_urban' | 'degraded_or_specific' | 'unknown'): boolean | null {
  if (lotM2 == null || !Number.isFinite(lotM2) || lotM2 <= 0 || context === 'unknown') return null;
  return lotM2 < minimumPrivateUnitForContext(context);
}
