import { describe, expect, it } from 'vitest';
import {
  calculateTerritorialQuota,
  lotSizeRequiresReview,
  minimumPrivateUnitForContext,
} from '../../lib/territorialAudit';

describe('calculateTerritorialQuota', () => {
  it('calculates the ordinary 10% cap over the computable base', () => {
    const result = calculateTerritorialQuota({
      grossRuralHa: 2600,
      excludedHa: 100,
      countableApprovedHa: 200,
      additionalQuotaStatus: 'unknown',
    });

    expect(result.computableBaseHa).toBe(2500);
    expect(result.ordinaryCapHa).toBe(250);
    expect(result.ordinaryRemainingHa).toBe(50);
    expect(result.ordinaryUsagePct).toBe(80);
    expect(result.status).toBe('within_ordinary');
  });

  it('requires proof of the additional quota when the ordinary cap is exceeded and activation is unknown', () => {
    const result = calculateTerritorialQuota({
      grossRuralHa: 2500,
      excludedHa: 0,
      countableApprovedHa: 270,
      additionalQuotaStatus: 'unknown',
    });

    expect(result.ordinaryCapHa).toBe(250);
    expect(result.authorizedCapHa).toBeNull();
    expect(result.status).toBe('requires_additional_proof');
  });

  it('accepts up to 15% only when the additional 5% is documented as activated', () => {
    const result = calculateTerritorialQuota({
      grossRuralHa: 2500,
      excludedHa: 0,
      countableApprovedHa: 350,
      additionalQuotaStatus: 'activated',
    });

    expect(result.additionalCapHa).toBe(125);
    expect(result.authorizedCapHa).toBe(375);
    expect(result.authorizedRemainingHa).toBe(25);
    expect(result.status).toBe('within_additional');
  });

  it('does not silently assume the extra 5% when it is not activated', () => {
    const result = calculateTerritorialQuota({
      grossRuralHa: 2500,
      excludedHa: 0,
      countableApprovedHa: 251,
      additionalQuotaStatus: 'not_activated',
    });

    expect(result.authorizedCapHa).toBe(250);
    expect(result.status).toBe('over_authorized');
  });

  it('rejects an exclusion larger than the gross rural area', () => {
    const result = calculateTerritorialQuota({
      grossRuralHa: 100,
      excludedHa: 120,
      countableApprovedHa: 0,
      additionalQuotaStatus: 'unknown',
    });

    expect(result.status).toBe('invalid_input');
  });
});

describe('Ordinance 11.819 private-unit thresholds', () => {
  it('exposes the three thresholds encoded by the audit rule', () => {
    expect(minimumPrivateUnitForContext('rural_productive')).toBe(2000);
    expect(minimumPrivateUnitForContext('adjacent_urban')).toBe(800);
    expect(minimumPrivateUnitForContext('degraded_or_specific')).toBe(600);
  });

  it('returns indeterminate until the zoning/context is known', () => {
    expect(lotSizeRequiresReview(300, 'unknown')).toBeNull();
  });
});
