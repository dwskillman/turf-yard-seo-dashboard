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

/* ===================== v2: Bucket + category helpers ===================== */
function matchesHost(source: string, hosts: string[]): boolean {
  const s = source.toLowerCase();
  return hosts.some(h => s === h || s.endsWith('.' + h));
}

function bucketFor(source: string, medium: string): 'ai'|'reddit'|'social'|'search'|'direct'|'referral'|'other' {
  const s = (source || '').toLowerCase();
  const m = (medium || '').toLowerCase();
  // Direct first — must precede any substring matching
  if (s === '(direct)' || m === '(none)' || s === '(not set)') return 'direct';
  if (s === 'reddit.com' || s.endsWith('.reddit.com') || s === 'reddit') return 'reddit';
  const AI_HOSTS = ['chatgpt.com','chat.openai.com','openai.com','perplexity.ai','claude.ai','gemini.google.com','bard.google.com','copilot.microsoft.com','meta.ai','you.com','phind.com','searchgpt.com','grok.com','poe.com','character.ai','x.ai'];
  if (matchesHost(s, AI_HOSTS)) return 'ai';
  if (m === 'organic' || ['google','bing','yahoo','duckduckgo','baidu','ecosia','brave','startpage','qwant','ask','aol'].includes(s)) return 'search';
  const SOCIAL_HOSTS = ['facebook.com','m.facebook.com','l.facebook.com','instagram.com','l.instagram.com','twitter.com','x.com','linkedin.com','lnkd.in','tiktok.com','pinterest.com','youtube.com','m.youtube.com','t.co','fb.me','snapchat.com','threads.net','bsky.app'];
  if (m === 'social' || matchesHost(s, SOCIAL_HOSTS) || s === 'ig' || s === 'fb') return 'social';
  if (m === 'referral') return 'referral';
  return 'other';
}

const CONVERSION_EVENTS = new Set(['form_submit','form_start','phone_click','quote_request_click','calculator_start','calculator_complete','generate_lead','file_download']);
const ENGAGEMENT_EVENTS = new Set(['video_start','video_progress','video_complete','scroll','user_engagement']);
const NAVIGATION_EVENTS = new Set(['page_view','session_start','first_visit','click','location_page_view']);

function categoryFor(eventName: string): string {
  if (CONVERSION_EVENTS.has(eventName)) return 'conversion';
  if (ENGAGEMENT_EVENTS.has(eventName)) return 'engagement';
  if (NAVIGATION_EVENTS.has(eventName)) return 'navigation';
  return 'other';
}

const TARGET_CITIES = new Set([
  // Phoenix metro
  'Phoenix','Mesa','Gilbert','Chandler','Tempe','Glendale','Peoria','Scottsdale','Surprise',
  'Buckeye','Avondale','Goodyear','San Tan Valley','Apache Junction','Queen Creek','Maricopa',
  'Casa Grande','Fountain Hills','Flagstaff','Tucson','Marana',
  // Utah
  'Provo','Orem','Lehi','Spanish Fork','Eagle Mountain','West Jordan','Pleasant View','Murray',
  'Springville','Salt Lake City','Lindon','Ogden','Heber City','Draper','Cottonwood Heights',
  'Pleasant Grove','Manti','Vernal','West Haven',
]);

/* ===================== v2 baseline files ===================== */
const v2Dir = resolve(root, 'baseline', 'v2');
const v2TrafficSources = JSON.parse(readFileSync(resolve(v2Dir, 'ga4_traffic_sources.json'), 'utf-8'));
const v2Channels = JSON.parse(readFileSync(resolve(v2Dir, 'ga4_channels.json'), 'utf-8'));
const v2EventsDaily = JSON.parse(readFileSync(resolve(v2Dir, 'ga4_events_daily.json'), 'utf-8'));
const v2ConversionAttr = JSON.parse(readFileSync(resolve(v2Dir, 'ga4_conversion_attribution.json'), 'utf-8'));
const v2DevicesGeo = JSON.parse(readFileSync(resolve(v2Dir, 'ga4_devices_geo.json'), 'utf-8'));

// 4 synthetic weeks for the 28-day baseline window
const V2_WEEKS = ['2026-05-03', '2026-05-10', '2026-05-17', '2026-05-24'];

/* ===================== 12. traffic_source_weekly ===================== */
const insTrafficSource = db.prepare(
  `INSERT OR REPLACE INTO traffic_source_weekly
     (week_start, source, medium, bucket, sessions, users, engaged_sessions, avg_session_duration)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
);
const seedTrafficSources = db.transaction(() => {
  for (const row of v2TrafficSources.rows) {
    const source = row.dimensionValues[0].value;
    const medium = row.dimensionValues[1].value;
    const totalSessions = parseInt(row.metricValues[0].value, 10);
    const totalUsers = parseInt(row.metricValues[1].value, 10);
    const totalEngaged = parseInt(row.metricValues[2].value, 10);
    const avgDur = parseFloat(row.metricValues[3].value);
    const bucket = bucketFor(source, medium);
    // Distribute evenly across 4 weeks
    for (const week of V2_WEEKS) {
      const s = Math.round(totalSessions / 4);
      const u = Math.round(totalUsers / 4);
      const e = Math.round(totalEngaged / 4);
      insTrafficSource.run(week, source, medium, bucket, s, u, e, avgDur);
    }
  }
});
seedTrafficSources();

/* ===================== 13. traffic_channel_weekly ===================== */
const insTrafficChannel = db.prepare(
  `INSERT OR REPLACE INTO traffic_channel_weekly
     (week_start, channel, sessions, users, engaged_sessions, avg_session_duration)
   VALUES (?, ?, ?, ?, ?, ?)`
);
const seedTrafficChannels = db.transaction(() => {
  for (const row of v2Channels.rows) {
    const channel = row.dimensionValues[0].value;
    const totalSessions = parseInt(row.metricValues[0].value, 10);
    const totalUsers = parseInt(row.metricValues[1].value, 10);
    const totalEngaged = parseInt(row.metricValues[2].value, 10);
    const avgDur = parseFloat(row.metricValues[3].value);
    for (const week of V2_WEEKS) {
      insTrafficChannel.run(week, channel, Math.round(totalSessions / 4), Math.round(totalUsers / 4), Math.round(totalEngaged / 4), avgDur);
    }
  }
});
seedTrafficChannels();

/* ===================== 14. event_daily ===================== */
const insEventDaily = db.prepare(
  `INSERT OR REPLACE INTO event_daily (date, event_name, event_count, total_users)
   VALUES (?, ?, ?, ?)`
);
const seedEventDaily = db.transaction(() => {
  for (const row of v2EventsDaily.rows) {
    const rawDate = row.dimensionValues[0].value; // YYYYMMDD
    const isoDate = `${rawDate.slice(0,4)}-${rawDate.slice(4,6)}-${rawDate.slice(6,8)}`;
    const eventName = row.dimensionValues[1].value;
    const eventCount = parseInt(row.metricValues[0].value, 10);
    const totalUsers = parseInt(row.metricValues[1].value, 10);
    insEventDaily.run(isoDate, eventName, eventCount, totalUsers);
  }
});
seedEventDaily();

/* ===================== 15. event_weekly (aggregated from daily) ===================== */
// Aggregate event_daily to weekly buckets
const insEventWeekly = db.prepare(
  `INSERT OR REPLACE INTO event_weekly (week_start, event_name, category, event_count, total_users)
   VALUES (?, ?, ?, ?, ?)`
);
const seedEventWeekly = db.transaction(() => {
  // Group all events by name, then split totals across 4 weeks
  const totals = new Map<string, { count: number; users: number }>();
  for (const row of v2EventsDaily.rows) {
    const eventName = row.dimensionValues[1].value;
    const eventCount = parseInt(row.metricValues[0].value, 10);
    const totalUsers = parseInt(row.metricValues[1].value, 10);
    const prev = totals.get(eventName) || { count: 0, users: 0 };
    totals.set(eventName, { count: prev.count + eventCount, users: prev.users + totalUsers });
  }
  for (const [eventName, { count, users }] of totals) {
    const category = categoryFor(eventName);
    for (const week of V2_WEEKS) {
      insEventWeekly.run(week, eventName, category, Math.round(count / 4), Math.round(users / 4));
    }
  }
});
seedEventWeekly();

/* ===================== 16. conversion_attribution_weekly ===================== */
const insConvAttr = db.prepare(
  `INSERT OR REPLACE INTO conversion_attribution_weekly
     (week_start, source, bucket, event_name, event_count, total_users)
   VALUES (?, ?, ?, ?, ?, ?)`
);
const seedConvAttr = db.transaction(() => {
  for (const row of v2ConversionAttr.rows) {
    const source = row.dimensionValues[0].value;
    const eventName = row.dimensionValues[1].value;
    const eventCount = parseInt(row.metricValues[0].value, 10);
    const totalUsers = parseInt(row.metricValues[1].value, 10);
    const bucket = bucketFor(source, '');
    for (const week of V2_WEEKS) {
      insConvAttr.run(week, source, bucket, eventName, Math.round(eventCount / 4), Math.round(totalUsers / 4));
    }
  }
});
seedConvAttr();

/* ===================== 17. device_weekly + geo_weekly ===================== */
// Aggregate device + city totals from the cross-dimension data
const deviceTotals = new Map<string, { sessions: number; users: number; engaged: number }>();
const geoTotals = new Map<string, { sessions: number; users: number; engaged: number }>();

for (const row of v2DevicesGeo.rows) {
  const device = row.dimensionValues[0].value;
  const city = row.dimensionValues[1].value;
  const s = parseInt(row.metricValues[0].value, 10);
  const u = parseInt(row.metricValues[1].value, 10);
  const e = parseInt(row.metricValues[2].value, 10);

  const dPrev = deviceTotals.get(device) || { sessions: 0, users: 0, engaged: 0 };
  deviceTotals.set(device, { sessions: dPrev.sessions + s, users: dPrev.users + u, engaged: dPrev.engaged + e });

  const cPrev = geoTotals.get(city) || { sessions: 0, users: 0, engaged: 0 };
  geoTotals.set(city, { sessions: cPrev.sessions + s, users: cPrev.users + u, engaged: cPrev.engaged + e });
}

const insDevice = db.prepare(
  `INSERT OR REPLACE INTO device_weekly (week_start, device_category, sessions, users, engaged_sessions)
   VALUES (?, ?, ?, ?, ?)`
);
const insGeo = db.prepare(
  `INSERT OR REPLACE INTO geo_weekly (week_start, city, region, is_target_market, sessions, users, engaged_sessions)
   VALUES (?, ?, ?, ?, ?, ?, ?)`
);
const seedDevicesGeo = db.transaction(() => {
  for (const [device, { sessions, users, engaged }] of deviceTotals) {
    for (const week of V2_WEEKS) {
      insDevice.run(week, device, Math.round(sessions / 4), Math.round(users / 4), Math.round(engaged / 4));
    }
  }
  for (const [city, { sessions, users, engaged }] of geoTotals) {
    const isTarget = TARGET_CITIES.has(city) ? 1 : 0;
    for (const week of V2_WEEKS) {
      insGeo.run(week, city, null, isTarget, Math.round(sessions / 4), Math.round(users / 4), Math.round(engaged / 4));
    }
  }
});
seedDevicesGeo();

/* ===================== 18. gbp_weekly (placeholder) ===================== */
// Seed a placeholder GBP row — real data populated by cron via import_snapshot
const insGbp = db.prepare(
  `INSERT OR REPLACE INTO gbp_weekly
     (week_start, rating, review_count, new_reviews, avg_new_rating, recent_post_count, most_recent_post_date)
   VALUES (?, ?, ?, ?, ?, ?, ?)`
);
insGbp.run('2026-05-24', null, null, null, null, null, null);

/* ===================== 19. ai_evaluation_weekly ===================== */
const insAiEval = db.prepare(
  `INSERT OR REPLACE INTO ai_evaluation_weekly
     (week_start, generated_at, model, redesign_verdict, one_line_headline, what_changed,
      biggest_risk, biggest_opportunity, recommended_actions)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
);
insAiEval.run(
  '2026-05-24',
  '2026-05-30T00:00:00Z',
  'baseline-seed',
  'too-early',
  'Baseline locked — measurement starts now.',
  'This is the pre-redesign baseline snapshot. The site redesign launched 2026-05-31. All metrics here represent the 28-day pre-launch window (2026-05-03 to 2026-05-30) and will serve as the comparison baseline for all future AI evaluations.',
  'Without post-redesign data we cannot yet confirm whether the redesign has maintained or improved organic visibility. The 4-week average position softened toward 21 in the final days of the baseline window.',
  'Calculator pages (/artificial-turf-calculator/ and /sub-base-turf-calculator/) are the strongest non-brand performers and the best candidates to optimize for conversion after the redesign.',
  JSON.stringify([
    { action: 'Configure GA4 key events', rationale: 'No conversions are currently tracked — form_submit, phone_click, and calculator_complete need to be wired.', leverage: 'high' },
    { action: 'Fix homepage H1 and meta description', rationale: 'Both are missing, suppressing click-through rate and local ranking signals.', leverage: 'high' },
    { action: 'Add JSON-LD schema to calculator pages', rationale: 'FAQ and Product schema could unlock rich results for the strongest-performing pages.', leverage: 'med' },
    { action: 'Monitor position trend weekly', rationale: 'Average position weakened from 14 to 21 over the baseline window — confirm whether this was pre-redesign technical debt or seasonal.', leverage: 'med' },
  ])
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
  'traffic_source_weekly',
  'traffic_channel_weekly',
  'event_daily',
  'event_weekly',
  'conversion_attribution_weekly',
  'device_weekly',
  'geo_weekly',
  'gbp_weekly',
  'ai_evaluation_weekly',
]) {
  console.log(`  ${t.padEnd(30)} ${count(t)}`);
}
console.log(`✓ Redesign date: ${REDESIGN_DATE}`);
db.close();
