/**
 * formatters.ts — pretty number / percent / delta formatting for the UI.
 */

/** Compact number formatting: 1234 -> "1.2K", 95266 -> "95.3K". */
export function compact(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: digits,
  }).format(n);
}

/** Plain integer with thousands separators. */
export function num(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return new Intl.NumberFormat('en-US').format(Math.round(n));
}

/** Fixed-decimal number (e.g. average position 17.2). */
export function decimal(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return n.toFixed(digits);
}

/**
 * Format a fraction (0..1) as a percent string.
 * percent(0.558) -> "55.8%"
 */
export function percent(fraction: number | null | undefined, digits = 1): string {
  if (fraction === null || fraction === undefined || Number.isNaN(fraction)) return '—';
  return `${(fraction * 100).toFixed(digits)}%`;
}

/** Format a percentage-point value already in % units. percentPts(12.4) -> "+12.4%". */
export function signedPercent(pct: number | null | undefined, digits = 1): string {
  if (pct === null || pct === undefined || Number.isNaN(pct)) return '—';
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct.toFixed(digits)}%`;
}

/** Seconds -> "4m 0s" style duration. */
export function duration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || Number.isNaN(seconds)) return '—';
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export type DeltaDirection = 'up' | 'down' | 'flat';

export interface Delta {
  direction: DeltaDirection;
  arrow: string;
  text: string;
  /**
   * Whether this delta is "good" (improvement). For most metrics higher
   * is better; for average position and bounce rate LOWER is better, so
   * pass invert=true.
   */
  positive: boolean;
}

/**
 * Build a delta descriptor from a percentage change.
 * @param pct   percentage change in % units (e.g. +12.4)
 * @param invert true when lower values are better (position, bounce rate)
 */
export function delta(pct: number | null | undefined, invert = false): Delta {
  if (pct === null || pct === undefined || Number.isNaN(pct)) {
    return { direction: 'flat', arrow: '→', text: '—', positive: false };
  }
  const direction: DeltaDirection = pct > 0.05 ? 'up' : pct < -0.05 ? 'down' : 'flat';
  const arrow = direction === 'up' ? '▲' : direction === 'down' ? '▼' : '→';
  // "positive" = improvement. Up is good unless inverted.
  const positive = invert ? pct < 0 : pct > 0;
  return { direction, arrow, text: signedPercent(pct), positive };
}
