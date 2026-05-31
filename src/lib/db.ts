/**
 * db.ts — build-time SQLite access for the static dashboard.
 *
 * Astro renders pages at build time in Node, so we can open the SQLite
 * file directly with better-sqlite3 and run synchronous queries. The DB
 * is opened read-only and cached for the lifetime of the build process.
 */
import Database from 'better-sqlite3';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { weekStart, parseISODate, percentChange } from './dates';

const DB_PATH = resolve(process.cwd(), 'data', 'seo.db');

let _db: Database.Database | null = null;

/** Open (and cache) the SQLite database read-only. */
export function getDb(): Database.Database {
  if (_db) return _db;
  if (!existsSync(DB_PATH)) {
    throw new Error(
      `SQLite database not found at ${DB_PATH}. Run "npm run setup" to initialize and seed it.`
    );
  }
  _db = new Database(DB_PATH, { readonly: true, fileMustExist: true });
  return _db;
}

/* ---------- Row types ---------- */

export interface GscDaily {
  date: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface GscQuery {
  week_start: string;
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface GscPage {
  week_start: string;
  page: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface Ga4Daily {
  date: string;
  sessions: number;
  total_users: number;
  new_users: number;
  engaged_sessions: number;
  engagement_rate: number;
  avg_session_duration: number;
  bounce_rate: number;
  page_views: number;
  conversions: number;
}

export interface Ga4Channel {
  week_start: string;
  channel: string;
  sessions: number;
  engaged_sessions: number;
  conversions: number;
}

export interface Ga4Landing {
  week_start: string;
  landing_page: string;
  sessions: number;
  engaged_sessions: number;
  avg_duration: number;
  conversions: number;
}

export interface KeywordRow {
  keyword: string;
  group_name: string;
  intent: string;
  priority: number;
  competitor: string | null;
  tracked_since: string | null;
  position: number | null;
  prev_position: number | null;
  url: string | null;
  search_volume: number | null;
  location: string | null;
}

export interface AuditFinding {
  id: number;
  audit_date: string;
  url: string;
  severity: string;
  category: string;
  finding: string;
  recommendation: string;
  status: string;
}

export interface Competitor {
  week_start: string;
  domain: string;
  organic_keywords: number;
  organic_traffic: number;
  dr: number;
  common_keywords: number;
}

/* ---------- Query helpers ---------- */

/** Last `days` of daily GSC totals, oldest first. */
export function getDailyGsc(days = 60): GscDaily[] {
  const db = getDb();
  const rows = db
    .prepare('SELECT date, clicks, impressions, ctr, position FROM gsc_daily ORDER BY date DESC LIMIT ?')
    .all(days) as GscDaily[];
  return rows.reverse();
}

/** Last `days` of daily GA4 totals, oldest first. */
export function getDailyGa4(days = 60): Ga4Daily[] {
  const db = getDb();
  const rows = db
    .prepare('SELECT * FROM ga4_daily ORDER BY date DESC LIMIT ?')
    .all(days) as Ga4Daily[];
  return rows.reverse();
}

/** Weekly query rows for a given week, ordered by clicks desc. */
export function getWeeklyQueries(weekStart?: string, limit = 10): GscQuery[] {
  const db = getDb();
  const ws = weekStart ?? latestWeek('gsc_query_weekly');
  return db
    .prepare('SELECT * FROM gsc_query_weekly WHERE week_start = ? ORDER BY clicks DESC LIMIT ?')
    .all(ws, limit) as GscQuery[];
}

/** Weekly page rows for a given week, ordered by clicks desc. */
export function getWeeklyPages(weekStart?: string, limit = 10): GscPage[] {
  const db = getDb();
  const ws = weekStart ?? latestWeek('gsc_page_weekly');
  return db
    .prepare('SELECT * FROM gsc_page_weekly WHERE week_start = ? ORDER BY clicks DESC LIMIT ?')
    .all(ws, limit) as GscPage[];
}

/** Latest week_start present in a weekly table. */
export function latestWeek(table: string): string {
  const db = getDb();
  const row = db.prepare(`SELECT MAX(week_start) AS w FROM ${table}`).get() as { w: string | null };
  return row.w ?? '';
}

/**
 * Tracked keywords with their meta + current/previous-week positions.
 * Optionally filter by group_name.
 */
export function getTrackedKeywords(filter?: string): KeywordRow[] {
  const db = getDb();
  const current = latestWeek('keyword_rank_weekly');
  // previous week = current minus 7 days
  let prev = '';
  if (current) {
    const d = parseISODate(current);
    d.setUTCDate(d.getUTCDate() - 7);
    prev = d.toISOString().slice(0, 10);
  }

  const rows = db
    .prepare(
      `SELECT m.keyword, m.group_name, m.intent, m.priority, m.competitor, m.tracked_since,
              cur.position AS position, cur.url AS url, cur.search_volume AS search_volume, cur.location AS location,
              prv.position AS prev_position
         FROM keyword_meta m
         LEFT JOIN keyword_rank_weekly cur
           ON cur.keyword = m.keyword AND cur.week_start = ?
         LEFT JOIN keyword_rank_weekly prv
           ON prv.keyword = m.keyword AND prv.week_start = ?
        ORDER BY m.priority ASC, m.group_name ASC, m.keyword ASC`
    )
    .all(current, prev) as KeywordRow[];

  if (filter && filter !== 'all') {
    return rows.filter((r) => r.group_name === filter);
  }
  return rows;
}

/** Distinct keyword groups, in a stable display order. */
export function getKeywordGroups(): string[] {
  const db = getDb();
  const rows = db
    .prepare('SELECT DISTINCT group_name FROM keyword_meta WHERE group_name IS NOT NULL')
    .all() as { group_name: string }[];
  return rows.map((r) => r.group_name);
}

/** Audit findings, optionally filtered by severity. */
export function getAuditFindings(severity?: string): AuditFinding[] {
  const db = getDb();
  if (severity) {
    return db
      .prepare('SELECT * FROM audit_findings WHERE severity = ? ORDER BY id ASC')
      .all(severity) as AuditFinding[];
  }
  // Order by severity rank then id.
  const all = db.prepare('SELECT * FROM audit_findings ORDER BY id ASC').all() as AuditFinding[];
  const rank: Record<string, number> = { critical: 0, warning: 1, info: 2 };
  return all.sort((a, b) => (rank[a.severity] ?? 9) - (rank[b.severity] ?? 9));
}

/** Competitor snapshot for a week (defaults to latest). */
export function getCompetitors(weekStart?: string): Competitor[] {
  const db = getDb();
  const ws = weekStart ?? latestWeek('competitor_weekly');
  return db
    .prepare('SELECT * FROM competitor_weekly WHERE week_start = ? ORDER BY dr DESC, organic_traffic DESC')
    .all(ws) as Competitor[];
}

/** Weekly executive summary for a week (defaults to latest). */
export function getWeeklySummary(weekStart?: string): {
  week_start: string;
  headline: string;
  summary_json: string;
  generated_at: string;
} | null {
  const db = getDb();
  const ws = weekStart ?? latestWeek('weekly_summary');
  if (!ws) return null;
  return (
    (db.prepare('SELECT * FROM weekly_summary WHERE week_start = ?').get(ws) as any) ?? null
  );
}

/* ---------- Redesign impact ---------- */

export interface KpiImpact {
  key: string;
  label: string;
  unit: 'count' | 'percent' | 'seconds' | 'position';
  baseline: number;
  current: number | null;
  pctChange: number | null;
  invert: boolean; // true when lower is better
  sparkline: number[]; // daily/weekly series for the sparkline
  sufficient: boolean; // enough post-redesign data to be meaningful
}

export interface RedesignImpact {
  redesignDate: string;
  daysSince: number;
  baselineWeeks: number;
  postWeeks: number;
  postDays: number;
  kpis: KpiImpact[];
}

/**
 * Compute before/after impact for the redesign.
 *
 * The "baseline" is the locked pre-redesign 4-week average that we seeded.
 * "Current" is computed from post-redesign data (GSC/GA4 daily rows dated
 * on/after the redesign date). When fewer than 7 post-redesign days exist,
 * current is null and we surface "data accumulating".
 */
export function getRedesignImpact(redesignDate: string, now: Date = new Date()): RedesignImpact {
  const db = getDb();
  const launch = parseISODate(redesignDate);
  const days = Math.max(0, Math.floor((now.getTime() - launch.getTime()) / 86_400_000));
  const sufficient = days >= 7;

  // ---- Baseline averages (from seeded pre-redesign rows, dates < redesign) ----
  const gscBase = db
    .prepare(
      `SELECT AVG(clicks) AS clicks, AVG(impressions) AS impressions, AVG(position) AS position
         FROM gsc_daily WHERE date < ?`
    )
    .get(redesignDate) as { clicks: number; impressions: number; position: number };

  const ga4Base = db
    .prepare(
      `SELECT AVG(sessions) AS sessions, AVG(engagement_rate) AS engagement_rate,
              AVG(avg_session_duration) AS dur
         FROM ga4_daily WHERE date < ?`
    )
    .get(redesignDate) as { sessions: number; engagement_rate: number; dur: number };

  // Calculator page sessions (baseline weekly landing page sessions for the two calculator pages)
  const calcBase = db
    .prepare(
      `SELECT AVG(sessions) AS s FROM ga4_landing_weekly
        WHERE landing_page LIKE '%calculator%'`
    )
    .get() as { s: number | null };

  // Baseline keyword counts come from the seeded baseline rank week.
  const baseRankWeek = db.prepare(`SELECT MIN(week_start) AS w FROM keyword_rank_weekly`).get() as {
    w: string | null;
  };
  const top10Base = baseRankWeek.w
    ? (db
        .prepare(
          `SELECT COUNT(*) AS c FROM keyword_rank_weekly WHERE week_start = ? AND position <= 10`
        )
        .get(baseRankWeek.w) as { c: number }).c
    : 0;
  const top3Base = baseRankWeek.w
    ? (db
        .prepare(
          `SELECT COUNT(*) AS c FROM keyword_rank_weekly WHERE week_start = ? AND position <= 3`
        )
        .get(baseRankWeek.w) as { c: number }).c
    : 0;

  // ---- Post-redesign averages (dates >= redesign) ----
  const gscPost = db
    .prepare(
      `SELECT AVG(clicks) AS clicks, AVG(impressions) AS impressions, AVG(position) AS position,
              COUNT(*) AS n
         FROM gsc_daily WHERE date >= ?`
    )
    .get(redesignDate) as { clicks: number; impressions: number; position: number; n: number };

  const ga4Post = db
    .prepare(
      `SELECT AVG(sessions) AS sessions, AVG(engagement_rate) AS engagement_rate,
              AVG(avg_session_duration) AS dur, COUNT(*) AS n
         FROM ga4_daily WHERE date >= ?`
    )
    .get(redesignDate) as { sessions: number; engagement_rate: number; dur: number; n: number };

  const hasGscPost = (gscPost?.n ?? 0) > 0 && sufficient;
  const hasGa4Post = (ga4Post?.n ?? 0) > 0 && sufficient;

  // Post-redesign keyword counts (latest rank week if it is after the baseline week).
  const latestRankWeek = latestWeek('keyword_rank_weekly');
  const hasPostRank = latestRankWeek && baseRankWeek.w && latestRankWeek > baseRankWeek.w;
  const top10Post = hasPostRank
    ? (db
        .prepare(`SELECT COUNT(*) AS c FROM keyword_rank_weekly WHERE week_start = ? AND position <= 10`)
        .get(latestRankWeek) as { c: number }).c
    : null;
  const top3Post = hasPostRank
    ? (db
        .prepare(`SELECT COUNT(*) AS c FROM keyword_rank_weekly WHERE week_start = ? AND position <= 3`)
        .get(latestRankWeek) as { c: number }).c
    : null;

  // Sparkline series — weekly clicks per week (baseline window) for context.
  const clickSpark = db
    .prepare(`SELECT clicks FROM gsc_daily ORDER BY date ASC`)
    .all()
    .map((r: any) => r.clicks as number);
  const imprSpark = db
    .prepare(`SELECT impressions FROM gsc_daily ORDER BY date ASC`)
    .all()
    .map((r: any) => r.impressions as number);
  const posSpark = db
    .prepare(`SELECT position FROM gsc_daily ORDER BY date ASC`)
    .all()
    .map((r: any) => r.position as number);
  const sessSpark = db
    .prepare(`SELECT sessions FROM ga4_daily ORDER BY date ASC`)
    .all()
    .map((r: any) => r.sessions as number);

  // Helper to weekly-scale a per-day baseline average.
  const perWeek = (perDay: number) => perDay * 7;

  const kpis: KpiImpact[] = [
    {
      key: 'organic_clicks',
      label: 'Organic clicks / week',
      unit: 'count',
      baseline: perWeek(gscBase.clicks),
      current: hasGscPost ? perWeek(gscPost.clicks) : null,
      pctChange: hasGscPost ? percentChange(gscBase.clicks, gscPost.clicks) : null,
      invert: false,
      sparkline: clickSpark,
      sufficient: hasGscPost,
    },
    {
      key: 'organic_impressions',
      label: 'Organic impressions / week',
      unit: 'count',
      baseline: perWeek(gscBase.impressions),
      current: hasGscPost ? perWeek(gscPost.impressions) : null,
      pctChange: hasGscPost ? percentChange(gscBase.impressions, gscPost.impressions) : null,
      invert: false,
      sparkline: imprSpark,
      sufficient: hasGscPost,
    },
    {
      key: 'avg_position',
      label: 'Avg position',
      unit: 'position',
      baseline: gscBase.position,
      current: hasGscPost ? gscPost.position : null,
      pctChange: hasGscPost ? percentChange(gscBase.position, gscPost.position) : null,
      invert: true,
      sparkline: posSpark,
      sufficient: hasGscPost,
    },
    {
      key: 'organic_sessions',
      label: 'Organic sessions / week',
      unit: 'count',
      baseline: perWeek(ga4Base.sessions),
      current: hasGa4Post ? perWeek(ga4Post.sessions) : null,
      pctChange: hasGa4Post ? percentChange(ga4Base.sessions, ga4Post.sessions) : null,
      invert: false,
      sparkline: sessSpark,
      sufficient: hasGa4Post,
    },
    {
      key: 'engagement_rate',
      label: 'Engagement rate',
      unit: 'percent',
      baseline: ga4Base.engagement_rate,
      current: hasGa4Post ? ga4Post.engagement_rate : null,
      pctChange: hasGa4Post ? percentChange(ga4Base.engagement_rate, ga4Post.engagement_rate) : null,
      invert: false,
      sparkline: [],
      sufficient: hasGa4Post,
    },
    {
      key: 'avg_session_duration',
      label: 'Avg session duration',
      unit: 'seconds',
      baseline: ga4Base.dur,
      current: hasGa4Post ? ga4Post.dur : null,
      pctChange: hasGa4Post ? percentChange(ga4Base.dur, ga4Post.dur) : null,
      invert: false,
      sparkline: [],
      sufficient: hasGa4Post,
    },
    {
      key: 'calculator_sessions',
      label: 'Calculator page sessions / week',
      unit: 'count',
      baseline: calcBase.s ?? 0,
      current: null,
      pctChange: null,
      invert: false,
      sparkline: [],
      sufficient: false,
    },
    {
      key: 'top10_keywords',
      label: 'Top 10 keyword count',
      unit: 'count',
      baseline: top10Base,
      current: top10Post,
      pctChange: top10Post !== null ? percentChange(top10Base, top10Post) : null,
      invert: false,
      sparkline: [],
      sufficient: top10Post !== null,
    },
    {
      key: 'top3_keywords',
      label: 'Top 3 keyword count',
      unit: 'count',
      baseline: top3Base,
      current: top3Post,
      pctChange: top3Post !== null ? percentChange(top3Base, top3Post) : null,
      invert: false,
      sparkline: [],
      sufficient: top3Post !== null,
    },
  ];

  return {
    redesignDate,
    daysSince: days,
    baselineWeeks: 4,
    postWeeks: Math.floor(days / 7),
    postDays: days,
    kpis,
  };
}

/** Tracked-keyword rank distribution buckets for the latest week. */
export function getRankDistribution(weekStart?: string): { label: string; count: number }[] {
  const db = getDb();
  const ws = weekStart ?? latestWeek('keyword_rank_weekly');
  const rows = db
    .prepare('SELECT position FROM keyword_rank_weekly WHERE week_start = ? AND position IS NOT NULL')
    .all(ws) as { position: number }[];
  const buckets = [
    { label: '1–3', count: 0 },
    { label: '4–10', count: 0 },
    { label: '11–20', count: 0 },
    { label: '21–50', count: 0 },
    { label: '50+', count: 0 },
  ];
  for (const { position } of rows) {
    if (position <= 3) buckets[0].count++;
    else if (position <= 10) buckets[1].count++;
    else if (position <= 20) buckets[2].count++;
    else if (position <= 50) buckets[3].count++;
    else buckets[4].count++;
  }
  return buckets;
}
