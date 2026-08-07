const PAPER_ID_PATTERN = /^MR-20260815-P(?:00[1-9]|0[1-9][0-9]|1[01][0-9]|120)$/;

export function normalizePaperId(value: string | null | undefined): string | null {
  const raw = String(value || '').trim();
  if (!raw) return null;
  let candidate = raw;
  try {
    const url = new URL(raw, window.location.origin);
    if (url.searchParams.has('paper')) candidate = url.searchParams.get('paper') || '';
  } catch {
    // Manual input is handled as a plain identifier.
  }
  candidate = candidate.trim().toUpperCase();
  return PAPER_ID_PATTERN.test(candidate) ? candidate : null;
}

export function isValidPaperId(value: string | null | undefined): boolean {
  return normalizePaperId(value) !== null;
}
