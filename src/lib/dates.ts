/**
 * dates.ts — small date helpers used across the dashboard.
 * All dates are handled as 'YYYY-MM-DD' strings in UTC to keep the
 * static build deterministic regardless of the build machine timezone.
 */

/** Parse a 'YYYY-MM-DD' string into a UTC Date. */
export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** Format a Date as 'YYYY-MM-DD' (UTC). */
export function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Return the Monday-based week start ('YYYY-MM-DD') for a given date.
 * ISO weeks start on Monday.
 */
export function weekStart(input: string | Date): string {
  const d = typeof input === 'string' ? parseISODate(input) : new Date(input);
  const day = d.getUTCDay(); // 0 = Sun, 1 = Mon, ...
  const diff = (day + 6) % 7; // days since Monday
  d.setUTCDate(d.getUTCDate() - diff);
  return toISODate(d);
}

/** Whole days elapsed since the given date (relative to `now`, default today). */
export function daysSince(date: string | Date, now: Date = new Date()): number {
  const start = typeof date === 'string' ? parseISODate(date) : date;
  const ms = now.getTime() - start.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

/** Human-friendly date, e.g. 'May 31, 2026'. */
export function formatDate(iso: string): string {
  return parseISODate(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** Short date, e.g. 'May 31'. */
export function formatDateShort(iso: string): string {
  return parseISODate(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * Percentage change from `from` to `to`.
 * Returns null when `from` is 0 (undefined growth).
 */
export function percentChange(from: number, to: number): number | null {
  if (from === 0) return null;
  return ((to - from) / from) * 100;
}
