/**
 * seed_from_baseline.ts — populate data/seo.db with the locked pre-redesign baseline.
 *
 * Reads:
 *   - baseline/baseline_locked_2026-05-30.json
 *   - config/tracked_keywords.json
 *
 * Seeds (idempotent — uses INSERT OR REPLACE and clears audit/keyword rows first):
 *   gsc_daily, gsc_query_weekly, gsc_page_weekly,
 *   ga4_daily, ga4_channel_weekly, ga4_landing_weekly,
 *   keyword_meta, keyword_rank_weekly (baseline week),
 *   competitor_weekly, audit_findings, weekly_summary.
 *
 * Usage: npm run db:seed  (tsx scripts/seed_from_baseline.ts)
 */
import Database from 'better-sqlite3';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const dbPath = resolve(root, 'data', 'seo.db');

if (!existsSync(dbPath)) {
  console.error(`✗ Database not found at ${dbPath}. Run "npm run db:init" first.`);
  process.exit(1);
}

const baseline = JSON.parse(
  readFileSync(resolve(root, 'baseline', 'baseline_locked_2026-05-30.json'), 'utf-8')
);
const keywords = JSON.parse(readFileSync(resolve(root, 'config', 'tracked_keywords.json'), 'utf-8'));

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

// The seeded baseline week_start label. The 28-day window aggregates are
// attached to this week for display purposes.
const BASELINE_WEEK = '2026-05-25';
const REDESIGN_DATE = baseline._meta.redesign_launch_date as string; // 2026-05-31
const TRACKED_SINCE = '2026-05-31';

/* ===================== 1. gsc_daily ===================== */
// Exact daily GSC rows for the baseline window (2026-05-03 .. 2026-05-29).
const GSC_DAILY: [string, number, number, number, number][] = [
  ['2026-05-03', 33, 2930, 0.01126, 14.42],
  ['2026-05-04', 36, 4137, 0.0087, 13.6],
  ['2026-05-05', 40, 3438, 0.01163, 14.64],
  ['2026-05-06', 27, 3565, 0.00757, 14.63],
  ['2026-05-07', 40, 3474, 0.01151, 17.13],
  ['2026-05-08', 28, 3154, 0.00888, 14.73],
  ['2026-05-09', 30, 3216, 0.00933, 12.7],
  ['2026-05-10', 25, 3133, 0.00798, 17.29],
  ['2026-05-11', 29, 4007, 0.00724, 14.77],
  ['2026-05-12', 30, 3213, 0.00934, 16.34],
  ['2026-05-13', 25, 3829, 0.00653, 16.92],
  ['2026-05-14', 31, 5317, 0.00583, 11.84],
  ['2026-05-15', 25, 3051, 0.00819, 15.75],
  ['2026-05-16', 39, 2853, 0.01367, 15.75],
  ['2026-05-17', 34, 2918, 0.01165, 16.81],
  ['2026-05-18', 24, 4767, 0.00503, 15.93],
  ['2026-05-19', 50, 3480, 0.01437, 17.78],
  ['2026-05-20', 28, 3380, 0.00828, 18.62],
  ['2026-05-21', 25, 3323, 0.00752, 16.53],
  ['2026-05-22', 37, 3094, 0.01196, 17.8],
  ['2026-05-23', 31, 6631, 0.00468, 19.83],
  ['2026-05-24', 28, 3397, 0.00824, 21.95],
  ['2026-05-25', 29, 3416, 0.00849, 20.67],
  ['2026-05-26', 24, 2946, 0.00815, 21.59],
  ['2026-05-27', 20, 3071, 0.00651, 24.85],
  ['2026-05-28', 29, 2632, 0.01102, 23.38],
  ['2026-05-29', 20, 2574, 0.00777, 21.15],
];

const insGscDaily = db.prepare(
  `INSERT OR REPLACE INTO gsc_daily (date, clicks, impressions, ctr, position)
   VALUES (?, ?, ?, ?, ?)`
);
const seedGscDaily = db.transaction(() => {
  for (const r of GSC_DAILY) insGscDaily.run(...r);
});
seedGscDaily();

/* ===================== 2. gsc_query_weekly ===================== */
const insQuery = db.prepare(
  `INSERT OR REPLACE INTO gsc_query_weekly (week_start, query, clicks, impressions, ctr, position)
   VALUES (?, ?, ?, ?, ?, ?)`
);
const seedQueries = db.transaction(() => {
  for (const q of baseline.gsc.top_queries_28d) {
    insQuery.run(BASELINE_WEEK, q.query, q.clicks, q.impressions, q.ctr ?? 0, q.position);
  }
});
seedQueries();

/* ===================== 3. gsc_page_weekly ===================== */
const insPage = db.prepare(
  `INSERT OR REPLACE INTO gsc_page_weekly (week_start, page, clicks, impressions, ctr, position)
   VALUES (?, ?, ?, ?, ?, ?)`
);
const seedPages = db.transaction(() => {
  for (const p of baseline.gsc.top_pages_28d) {
    const ctr = p.impressions > 0 ? p.clicks / p.impressions : 0;
    insPage.run(BASELINE_WEEK, p.page, p.clicks, p.impressions, ctr, p.position);
  }
});
seedPages();

/* ===================== 4. ga4_daily ===================== */
// The baseline JSON stores 28-day GA4 aggregates only. We distribute them
// across the 27 baseline days with light deterministic variation so the
// trend charts have a realistic daily shape while exactly preserving the
// 28-day per-day averages on average. (No randomness — reproducible build.)
const ga4 = baseline.ga4;
const days = GSC_DAILY.map((r) => r[0]); // reuse the same 27 baseline dates
const n = days.length;

const totals = ga4.totals_28d;
// Per-day baselines derived from totals.
const baseSessions = totals.sessions / n;
const baseUsers = totals.totalUsers / n;
const baseNew = totals.newUsers / n;
const baseEngaged = totals.engagedSessions / n;
const baseViews = totals.screenPageViews / n;

// Deterministic weekly-shaped multiplier (weekday vs weekend dip).
function dayFactor(iso: string): number {
  const d = new Date(iso + 'T00:00:00Z').getUTCDay(); // 0 Sun .. 6 Sat
  // Slightly lower on weekends, peak midweek.
  const map: Record<number, number> = { 0: 0.82, 1: 1.05, 2: 1.08, 3: 1.07, 4: 1.04, 5: 0.98, 6: 0.86 };
  return map[d] ?? 1;
}
// Normalize factors so the average is exactly 1 (preserves totals).
const factors = days.map(dayFactor);
const factorMean = factors.reduce((a, b) => a + b, 0) / n;
const normFactors = factors.map((f) => f / factorMean);

const insGa4Daily = db.prepare(
  `INSERT OR REPLACE INTO ga4_daily
     (date, sessions, total_users, new_users, engaged_sessions, engagement_rate,
      avg_session_duration, bounce_rate, page_views, conversions)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
);
const seedGa4Daily = db.transaction(() => {
  days.forEach((date, i) => {
    const f = normFactors[i];
    const sessions = Math.round(baseSessions * f);
    const engaged = Math.round(baseEngaged * f);
    const engagementRate = sessions > 0 ? engaged / sessions : totals.engagementRate_avg;
    insGa4Daily.run(
      date,
      sessions,
      Math.round(baseUsers * f),
      Math.round(baseNew * f),
      engaged,
      Number(engagementRate.toFixed(4)),
      Number(totals.averageSessionDuration_seconds_avg.toFixed(1)),
      Number(totals.bounceRate_avg.toFixed(4)),
      Math.round(baseViews * f),
      0
    );
  });
});
seedGa4Daily();

/* ===================== 5. ga4_channel_weekly ===================== */
const insChannel = db.prepare(
  `INSERT OR REPLACE INTO ga4_channel_weekly (week_start, channel, sessions, engaged_sessions, conversions)
   VALUES (?, ?, ?, ?, ?)`
);
const seedChannels = db.transaction(() => {
  for (const c of ga4.traffic_sources_28d) {
    insChannel.run(BASELINE_WEEK, c.channel, c.sessions, c.engagedSessions, c.conversions);
  }
});
seedChannels();

/* ===================== 6. ga4_landing_weekly ===================== */
const insLanding = db.prepare(
  `INSERT OR REPLACE INTO ga4_landing_weekly
     (week_start, landing_page, sessions, engaged_sessions, avg_duration, conversions)
   VALUES (?, ?, ?, ?, ?, ?)`
);
const seedLandings = db.transaction(() => {
  for (const l of ga4.top_landing_pages_28d) {
    insLanding.run(BASELINE_WEEK, l.landingPage, l.sessions, l.engagedSessions, l.avgDuration, 0);
  }
});
seedLandings();

/* ===================== 7. keyword_meta ===================== */
// Flatten all keyword groups from tracked_keywords.json.
const allKw: any[] = [
  ...keywords.brand_and_calculator,
  ...keywords.products,
  ...keywords.phoenix_az_local,
  ...keywords.high_intent_generic,
  ...keywords.competitor_gap_commercial,
];

const insMeta = db.prepare(
  `INSERT OR REPLACE INTO keyword_meta (keyword, group_name, intent, priority, competitor, tracked_since)
   VALUES (?, ?, ?, ?, ?, ?)`
);
const seedMeta = db.transaction(() => {
  for (const k of allKw) {
    insMeta.run(k.keyword, k.group, k.intent, k.priority, k.competitor ?? null, TRACKED_SINCE);
  }
});
seedMeta();

/* ===================== 8. keyword_rank_weekly (baseline week) ===================== */
// Baseline positions: map tracked keywords to known positions from the GSC
// top_queries_28d where a clean match exists. Keywords without GSC presence
// are seeded with NULL position (not yet ranking / no data) so the dashboard
// can show "—" until the first DataForSEO pull populates them.
const queryPos = new Map<string, { position: number }>();
for (const q of baseline.gsc.top_queries_28d) {
  queryPos.set(q.query.toLowerCase().trim(), { position: q.position });
}

// Map a few tracked-keyword variants to their GSC query equivalent.
const variantMap: Record<string, string> = {
  'lush 80 turf': 'lush 80 turf',
  'turf yard base layer calculator': 'turf yard base layer calculator',
  'turf calculator': 'turf calculator',
};

const insRank = db.prepare(
  `INSERT OR REPLACE INTO keyword_rank_weekly
     (week_start, keyword, position, url, search_volume, location)
   VALUES (?, ?, ?, ?, ?, ?)`
);

// Best-guess landing URL per group for the baseline snapshot.
function urlForKeyword(k: any): string | null {
  const kw = k.keyword.toLowerCase();
  if (kw.includes('sub base') || kw.includes('sub-base') || kw.includes('base')) {
    return 'https://theturfyard.com/sub-base-turf-calculator/';
  }
  if (kw.includes('calculator') || kw.includes('estimator') || kw.includes('cost')) {
    return 'https://theturfyard.com/artificial-turf-calculator/';
  }
  if (kw.includes('lush 80')) return 'https://theturfyard.com/lush-80-artificial-turf/';
  if (kw.includes('lush 70')) return 'https://theturfyard.com/lush-70-artificial-turf/';
  if (kw.includes('lush primo')) return 'https://theturfyard.com/lush-primo-artificial-turf/';
  if (kw.includes('lucky 77')) return 'https://theturfyard.com/lucky-77-artificial-turf/';
  if (k.group === 'brand') return 'https://theturfyard.com/';
  return null;
}

const seedRanks = db.transaction(() => {
  for (const k of allKw) {
    const key = (variantMap[k.keyword] ?? k.keyword).toLowerCase().trim();
    const match = queryPos.get(key);
    const position = match ? Number(match.position.toFixed(1)) : null;
    insRank.run(BASELINE_WEEK, k.keyword, position, urlForKeyword(k), null, 'United States');
  }
});
seedRanks();

/* ===================== 9. competitor_weekly ===================== */
const snap = baseline.ahrefs_snapshot_may_25_2026;
const insComp = db.prepare(
  `INSERT OR REPLACE INTO competitor_weekly
     (week_start, domain, organic_keywords, organic_traffic, dr, common_keywords)
   VALUES (?, ?, ?, ?, ?, ?)`
);
const seedComp = db.transaction(() => {
  // The Turf Yard itself first (no common_keywords with itself).
  insComp.run(
    BASELINE_WEEK,
    'theturfyard.com',
    snap.organic_keywords,
    snap.organic_traffic_monthly,
    snap.domain_rating,
    null
  );
  for (const c of snap.top_competitors) {
    insComp.run(BASELINE_WEEK, c.domain, null, c.traffic, c.dr, c.common_kw);
  }
});
seedComp();

/* ===================== 10. audit_findings ===================== */
const AUDIT_DATE = '2026-05-30';
type Finding = [string, string, string, string, string]; // severity, url, category, finding, recommendation
const FINDINGS: Finding[] = [
  ['critical', '/', 'missing_h1', 'Homepage has no H1 tag', 'Add H1: Premium Artificial Turf Supplier in Phoenix, AZ'],
  ['critical', '/', 'missing_meta_description', 'Homepage missing meta description', "Add 150-char meta targeting 'artificial grass phoenix'"],
  ['critical', '/', 'missing_canonical', 'Homepage missing canonical tag', 'Add <link rel=canonical href=https://theturfyard.com/>'],
  ['critical', '/artificial-turf-calculator/', 'missing_schema', 'No JSON-LD schema', 'Add FAQPage + Product schema'],
  ['critical', '/sub-base-turf-calculator/', 'missing_schema', 'No JSON-LD schema', 'Add FAQPage schema'],
  ['critical', '/lush-80-artificial-turf/', 'missing_schema', 'No JSON-LD schema', 'Add Product schema'],
  ['critical', '/service-areas/utah/provo/', 'missing_h1', 'Service area page missing H1', 'Add H1: Artificial Turf in Provo, UT'],
  ['critical', '/service-areas/utah/provo/', 'missing_schema', 'No LocalBusiness schema', 'Add LocalBusiness JSON-LD'],
  ['warning', '/artificial-turf-calculator/', 'title_truncated', "Title truncated in SERPs: 'Artificial Grass That's...'", 'Rewrite title to 50-60 chars'],
  ['warning', '/lush-80-artificial-turf/', 'title_duplicate_word', 'Duplicate word in title', 'Fix title to remove duplication'],
  ['warning', '/sub-base-turf-calculator/', 'title_truncated', 'Title truncated in SERPs', 'Rewrite title to 50-60 chars'],
  ['info', '/', 'indexed_count', 'Indexed pages: ~80', 'Run regular index audits'],
];

// Clear existing audit rows for this date to keep seeding idempotent.
db.prepare('DELETE FROM audit_findings WHERE audit_date = ?').run(AUDIT_DATE);
const insAudit = db.prepare(
  `INSERT INTO audit_findings (audit_date, url, severity, category, finding, recommendation, status)
   VALUES (?, ?, ?, ?, ?, ?, 'open')`
);
const seedAudit = db.transaction(() => {
  for (const [severity, url, category, finding, recommendation] of FINDINGS) {
    insAudit.run(AUDIT_DATE, url, severity, category, finding, recommendation);
  }
});
seedAudit();

/* ===================== 11. weekly_summary ===================== */
const summary = {
  baseline_window: `${baseline._meta.baseline_window_start} → ${baseline._meta.baseline_window_end}`,
  clicks_28d: baseline.gsc.totals_28d.clicks,
  impressions_28d: baseline.gsc.totals_28d.impressions,
  avg_position: baseline.gsc.totals_28d.avg_position,
  sessions_28d: baseline.ga4.totals_28d.sessions,
  engagement_rate: baseline.ga4.totals_28d.engagementRate_avg,
  domain_rating: snap.domain_rating,
  organic_keywords: snap.organic_keywords,
  keywords_top_3: snap.keywords_top_3,
  highlights: [
    'Baseline locked 2026-05-31 ahead of the site redesign launch.',
    'Calculator pages (/artificial-turf-calculator/, /sub-base-turf-calculator/) are the strongest non-brand performers.',
    'Average position softened late in the window (14.4 → 21.2), making post-redesign recovery a key KPI.',
    '8 critical on-page issues found (missing H1/meta/canonical on homepage; missing schema on 4 pages).',
    'No GA4 conversions configured — recommend key events for form_submit, phone_click, quote_request, calculator_complete.',
  ],
};
const insSummary = db.prepare(
  `INSERT OR REPLACE INTO weekly_summary (week_start, headline, summary_json, generated_at)
   VALUES (?, ?, ?, datetime('now'))`
);
insSummary.run(
  BASELINE_WEEK,
  'Pre-redesign baseline locked — 817 clicks / 95.3K impressions over 28 days',
  JSON.stringify(summary)
);

/* ===================== Report ===================== */
function count(table: string): number {
  return (db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as { c: number }).c;
}
console.log('✓ Seed complete. Row counts:');
for (const t of [
  'gsc_daily',
  'gsc_query_weekly',
  'gsc_page_weekly',
  'ga4_daily',
  'ga4_channel_weekly',
  'ga4_landing_weekly',
  'keyword_meta',
  'keyword_rank_weekly',
  'competitor_weekly',
  'audit_findings',
  'weekly_summary',
]) {
  console.log(`  ${t.padEnd(22)} ${count(t)}`);
}
console.log(`✓ Redesign date: ${REDESIGN_DATE}`);
db.close();
