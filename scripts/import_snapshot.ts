#!/usr/bin/env tsx
/**
 * import_snapshot.ts
 *
 * Imports a weekly data snapshot (JSON) into the local SQLite database.
 * Usage:
 *   npm run import:latest               # imports the most recent file in data/snapshots/
 *   npm run import:snapshot -- 2026-06-08.json
 *
 * Snapshot JSON shape: see scripts/SNAPSHOT_SCHEMA.md
 */
import Database from "better-sqlite3";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const DB_PATH = join(ROOT, "data", "seo.db");
const SNAP_DIR = join(ROOT, "data", "snapshots");

/**
 * With an explicit filename, import just that snapshot.
 *
 * With NO argument (how `npm run import:latest` and therefore CI invoke this),
 * import EVERY snapshot in chronological order rather than only the newest.
 * Each file carries just its own week of gsc_daily/ga4_daily rows, so importing
 * only the latest leaves a gap between the seeded baseline and the current week
 * and the 60-day trend charts and redesign-impact averages are computed over
 * that hole. Order matters: getTrackedKeywords derives "last week" as
 * latestWeek - 7 days.
 */
function pickSnapshots(): string[] {
  const arg = process.argv[2];
  if (arg) {
    const explicit = join(SNAP_DIR, arg);
    if (!existsSync(explicit)) throw new Error(`Snapshot not found: ${explicit}`);
    return [explicit];
  }
  const files = readdirSync(SNAP_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort();
  if (files.length === 0) throw new Error(`No snapshots in ${SNAP_DIR}`);
  return files.map((f) => join(SNAP_DIR, f));
}
const snapPaths = pickSnapshots();

if (!existsSync(DB_PATH)) {
  throw new Error(`Database not found at ${DB_PATH}. Run \`npm run db:init\` first.`);
}

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

for (const snapPath of snapPaths) {
console.log(`\nImporting snapshot: ${snapPath}`);
const snap = JSON.parse(readFileSync(snapPath, "utf8"));

const weekStart: string = snap.week_start;
if (!weekStart) throw new Error("Snapshot missing required field: week_start");
console.log(`Week start: ${weekStart}`);

/* ---- v2 helpers ---- */
// Matches host as full string OR ends-with a dot-delimited host (e.g. m.facebook.com matches facebook.com)
function matchesHost(source: string, hosts: string[]): boolean {
  const s = source.toLowerCase();
  return hosts.some(h => s === h || s.endsWith('.' + h));
}
function bucketFor(source: string, medium: string): 'ai'|'reddit'|'social'|'search'|'direct'|'referral'|'other' {
  const s = (source || '').toLowerCase();
  const m = (medium || '').toLowerCase();
  // Direct first — must precede any substring matching
  if (s === '(direct)' || m === '(none)' || s === '(not set)') return 'direct';
  // Reddit
  if (s === 'reddit.com' || s.endsWith('.reddit.com') || s === 'reddit') return 'reddit';
  // AI / LLM referrers
  const AI_HOSTS = ['chatgpt.com','chat.openai.com','openai.com','perplexity.ai','claude.ai','gemini.google.com','bard.google.com','copilot.microsoft.com','meta.ai','you.com','phind.com','searchgpt.com','grok.com','poe.com','character.ai','x.ai'];
  if (matchesHost(s, AI_HOSTS)) return 'ai';
  // Search engines (Bing belongs here, not AI)
  if (m === 'organic' || ['google','bing','yahoo','duckduckgo','baidu','ecosia','brave','startpage','qwant','ask','aol'].includes(s)) return 'search';
  // Social — explicit hosts, no substring tricks
  const SOCIAL_HOSTS = ['facebook.com','m.facebook.com','l.facebook.com','instagram.com','l.instagram.com','twitter.com','x.com','linkedin.com','lnkd.in','tiktok.com','pinterest.com','youtube.com','m.youtube.com','t.co','fb.me','snapchat.com','threads.net','bsky.app'];
  if (m === 'social' || matchesHost(s, SOCIAL_HOSTS) || s === 'ig' || s === 'fb') return 'social';
  // Referral catchall
  if (m === 'referral') return 'referral';
  return 'other';
}

const CONVERSION_EVENTS = new Set(['form_submit','form_start','phone_click','quote_request_click','calculator_start','calculator_complete','generate_lead','file_download']);
const ENGAGEMENT_EVENTS = new Set(['video_start','video_progress','video_complete','scroll','user_engagement']);
function categoryFor(eventName: string): string {
  if (CONVERSION_EVENTS.has(eventName)) return 'conversion';
  if (ENGAGEMENT_EVENTS.has(eventName)) return 'engagement';
  return 'navigation';
}

const TARGET_CITIES = new Set(['Phoenix','Mesa','Gilbert','Chandler','Tempe','Glendale','Peoria','Scottsdale','Surprise','Buckeye','Avondale','Goodyear','San Tan Valley','Apache Junction','Queen Creek','Maricopa','Casa Grande','Fountain Hills','Flagstaff','Tucson','Marana','Provo','Orem','Lehi','Spanish Fork','Eagle Mountain','West Jordan','Pleasant View','Murray','Springville','Salt Lake City','Lindon','Ogden','Heber City','Draper','Cottonwood Heights','Pleasant Grove','Manti','Vernal','West Haven']);


/**
 * GA4 field-name normaliser.
 *
 * Snapshots written before 2026-06-08 use raw GA4 API camelCase (`totalUsers`,
 * `screenPageViews`) and, in a couple of files, ad-hoc short forms (`users`,
 * `engRate`, `avgSessDur`, `pageViews`). Everything from 2026-06-08 onward is
 * snake_case. better-sqlite3 throws "Missing named parameter" on the first
 * mismatch and the whole transaction rolls back, so normalise before binding
 * rather than assuming one convention.
 */
function pick(row: any, ...names: string[]): any {
  for (const n of names) if (row[n] !== undefined) return row[n];
  return null;
}
function ga4DailyRow(row: any) {
  return {
    date: row.date,
    sessions: pick(row, 'sessions'),
    total_users: pick(row, 'total_users', 'totalUsers', 'users'),
    new_users: pick(row, 'new_users', 'newUsers'),
    engaged_sessions: pick(row, 'engaged_sessions', 'engagedSessions'),
    engagement_rate: pick(row, 'engagement_rate', 'engagementRate', 'engRate'),
    avg_session_duration: pick(row, 'avg_session_duration', 'averageSessionDuration', 'avgSessDur'),
    bounce_rate: pick(row, 'bounce_rate', 'bounceRate'),
    page_views: pick(row, 'page_views', 'screenPageViews', 'pageViews'),
    conversions: pick(row, 'conversions') ?? 0,
  };
}
function ga4ChannelRow(row: any) {
  return {
    channel: pick(row, 'channel', 'sessionDefaultChannelGroup'),
    sessions: pick(row, 'sessions'),
    engaged_sessions: pick(row, 'engaged_sessions', 'engagedSessions'),
    conversions: pick(row, 'conversions') ?? 0,
  };
}
function ga4LandingRow(row: any) {
  return {
    landing_page: pick(row, 'landing_page', 'landingPage'),
    sessions: pick(row, 'sessions'),
    engaged_sessions: pick(row, 'engaged_sessions', 'engagedSessions'),
    avg_duration: pick(row, 'avg_duration', 'averageSessionDuration', 'avgSessDur', 'avg_session_duration'),
    conversions: pick(row, 'conversions') ?? 0,
  };
}

function keywordRankRow(row: any) {
  return {
    keyword: pick(row, 'keyword'),
    position: pick(row, 'position'),
    url: pick(row, 'url'),
    search_volume: pick(row, 'search_volume', 'searchVolume', 'volume'),
    location: pick(row, 'location') ?? 'US',
  };
}
/**
 * Severity vocabulary has drifted across snapshot generations: lowercase
 * (`warning`, `low`), uppercase (`WARNING`, `INFO`) and priority words
 * (`high`, `medium`). audit.astro groups strictly on critical|warning|info,
 * so anything outside that set silently vanishes from the page. Fold them here.
 */
function normSeverity(v: any): string {
  const x = String(v ?? '').trim().toLowerCase();
  if (['critical', 'high', 'error'].includes(x)) return 'critical';
  if (['warning', 'warn', 'medium', 'moderate'].includes(x)) return 'warning';
  return 'info';
}
function auditRow(row: any) {
  const finding = pick(row, 'finding', 'issue');
  return {
    url: pick(row, 'url', 'page'),
    severity: normSeverity(pick(row, 'severity')),
    category: pick(row, 'category') ?? finding,
    finding,
    recommendation: pick(row, 'recommendation', 'fix'),
  };
}

const tx = db.transaction(() => {
  // ---- GSC daily ----
  if (snap.gsc?.daily?.length) {
    const stmt = db.prepare(`
      INSERT INTO gsc_daily (date, clicks, impressions, ctr, position, created_at)
      VALUES (@date, @clicks, @impressions, @ctr, @position, datetime('now'))
      ON CONFLICT(date) DO UPDATE SET
        clicks=excluded.clicks, impressions=excluded.impressions,
        ctr=excluded.ctr, position=excluded.position, created_at=excluded.created_at
    `);
    for (const row of snap.gsc.daily) stmt.run(row);
    console.log(`  ✓ gsc_daily: ${snap.gsc.daily.length} rows`);
  }

  // ---- GSC queries ----
  if (snap.gsc?.queries?.length) {
    const stmt = db.prepare(`
      INSERT INTO gsc_query_weekly (week_start, query, clicks, impressions, ctr, position)
      VALUES (?, @query, @clicks, @impressions, @ctr, @position)
      ON CONFLICT(week_start, query) DO UPDATE SET
        clicks=excluded.clicks, impressions=excluded.impressions,
        ctr=excluded.ctr, position=excluded.position
    `);
    for (const row of snap.gsc.queries) stmt.run(weekStart, row);
    console.log(`  ✓ gsc_query_weekly: ${snap.gsc.queries.length} rows`);
  }

  // ---- GSC pages ----
  if (snap.gsc?.pages?.length) {
    const stmt = db.prepare(`
      INSERT INTO gsc_page_weekly (week_start, page, clicks, impressions, ctr, position)
      VALUES (?, @page, @clicks, @impressions, @ctr, @position)
      ON CONFLICT(week_start, page) DO UPDATE SET
        clicks=excluded.clicks, impressions=excluded.impressions,
        ctr=excluded.ctr, position=excluded.position
    `);
    for (const row of snap.gsc.pages) stmt.run(weekStart, row);
    console.log(`  ✓ gsc_page_weekly: ${snap.gsc.pages.length} rows`);
  }

  // ---- GA4 daily ----
  if (snap.ga4?.daily?.length) {
    const stmt = db.prepare(`
      INSERT INTO ga4_daily (date, sessions, total_users, new_users, engaged_sessions,
        engagement_rate, avg_session_duration, bounce_rate, page_views, conversions, created_at)
      VALUES (@date, @sessions, @total_users, @new_users, @engaged_sessions,
        @engagement_rate, @avg_session_duration, @bounce_rate, @page_views, @conversions, datetime('now'))
      ON CONFLICT(date) DO UPDATE SET
        sessions=excluded.sessions, total_users=excluded.total_users, new_users=excluded.new_users,
        engaged_sessions=excluded.engaged_sessions, engagement_rate=excluded.engagement_rate,
        avg_session_duration=excluded.avg_session_duration, bounce_rate=excluded.bounce_rate,
        page_views=excluded.page_views, conversions=excluded.conversions, created_at=excluded.created_at
    `);
    for (const row of snap.ga4.daily) stmt.run(ga4DailyRow(row));
    console.log(`  ✓ ga4_daily: ${snap.ga4.daily.length} rows`);
  }

  // ---- GA4 channels ----
  if (snap.ga4?.channels?.length) {
    const stmt = db.prepare(`
      INSERT INTO ga4_channel_weekly (week_start, channel, sessions, engaged_sessions, conversions)
      VALUES (?, @channel, @sessions, @engaged_sessions, @conversions)
      ON CONFLICT(week_start, channel) DO UPDATE SET
        sessions=excluded.sessions, engaged_sessions=excluded.engaged_sessions,
        conversions=excluded.conversions
    `);
    for (const row of snap.ga4.channels) stmt.run(weekStart, ga4ChannelRow(row));
    console.log(`  ✓ ga4_channel_weekly: ${snap.ga4.channels.length} rows`);
  }

  // ---- GA4 landing pages ----
  if (snap.ga4?.landing_pages?.length) {
    const stmt = db.prepare(`
      INSERT INTO ga4_landing_weekly (week_start, landing_page, sessions, engaged_sessions, avg_duration, conversions)
      VALUES (?, @landing_page, @sessions, @engaged_sessions, @avg_duration, @conversions)
      ON CONFLICT(week_start, landing_page) DO UPDATE SET
        sessions=excluded.sessions, engaged_sessions=excluded.engaged_sessions,
        avg_duration=excluded.avg_duration, conversions=excluded.conversions
    `);
    for (const row of snap.ga4.landing_pages) stmt.run(weekStart, ga4LandingRow(row));
    console.log(`  ✓ ga4_landing_weekly: ${snap.ga4.landing_pages.length} rows`);
  }

  // ---- Keyword rankings (DataForSEO) ----
  if (snap.keyword_rankings?.length) {
    const stmt = db.prepare(`
      INSERT INTO keyword_rank_weekly (week_start, keyword, position, url, search_volume, location)
      VALUES (?, @keyword, @position, @url, @search_volume, @location)
      ON CONFLICT(week_start, keyword, location) DO UPDATE SET
        position=excluded.position, url=excluded.url, search_volume=excluded.search_volume
    `);
    for (const row of snap.keyword_rankings) stmt.run(weekStart, keywordRankRow(row));
    console.log(`  ✓ keyword_rank_weekly: ${snap.keyword_rankings.length} rows`);
  }

  // ---- Competitors ----
  if (snap.competitors?.length) {
    const stmt = db.prepare(`
      INSERT INTO competitor_weekly (week_start, domain, organic_keywords, organic_traffic, dr, common_keywords)
      VALUES (?, @domain, @organic_keywords, @organic_traffic, @dr, @common_keywords)
      ON CONFLICT(week_start, domain) DO UPDATE SET
        organic_keywords=excluded.organic_keywords, organic_traffic=excluded.organic_traffic,
        dr=excluded.dr, common_keywords=excluded.common_keywords
    `);
    for (const row of snap.competitors) stmt.run(weekStart, row);
    console.log(`  ✓ competitor_weekly: ${snap.competitors.length} rows`);
  }

  // ---- Audit findings ----
  if (snap.audit_findings?.length) {
    // Insert only new findings (dedupe by url+category+finding)
    const exists = db.prepare(`
      SELECT 1 FROM audit_findings WHERE url=? AND category=? AND finding=? AND status='open' LIMIT 1
    `);
    const insert = db.prepare(`
      INSERT INTO audit_findings (audit_date, url, severity, category, finding, recommendation, status)
      VALUES (?, @url, @severity, @category, @finding, @recommendation, 'open')
    `);
    let added = 0;
    for (const raw of snap.audit_findings) {
      const row = auditRow(raw);
      if (!exists.get(row.url, row.category, row.finding)) {
        insert.run(snap.audit_date || weekStart, row);
        added++;
      }
    }
    console.log(`  ✓ audit_findings: ${added} new (${snap.audit_findings.length} scanned)`);
  }

  // ---- Audit findings resolved since the last scan ----
  // The insert path only ever adds findings, and seed_from_baseline re-inserts the
  // pre-redesign list as 'open' on every CI build, so without this a long-fixed issue
  // reappears as open forever. Match on the same (url, category, finding) triple.
  if (snap.audit_resolved?.length) {
    const resolve = db.prepare(`
      UPDATE audit_findings SET status='fixed'
       WHERE url=? AND category=? AND finding=? AND status='open'
    `);
    let closed = 0;
    for (const row of snap.audit_resolved) {
      closed += resolve.run(row.url, row.category, row.finding).changes;
    }
    console.log(`  \u2713 audit_findings resolved: ${closed} (${snap.audit_resolved.length} reported)`);
  }

  // ---- Backlinks ----
  if (snap.backlinks) {
    db.prepare(`
      INSERT INTO backlinks_weekly (week_start, total_backlinks, referring_domains, new_referring, lost_referring)
      VALUES (?, @total_backlinks, @referring_domains, @new_referring, @lost_referring)
      ON CONFLICT(week_start) DO UPDATE SET
        total_backlinks=excluded.total_backlinks, referring_domains=excluded.referring_domains,
        new_referring=excluded.new_referring, lost_referring=excluded.lost_referring
    `).run(weekStart, snap.backlinks);
    console.log(`  ✓ backlinks_weekly: 1 row`);
  }

  // ---- Weekly summary ----
  if (snap.summary) {
    db.prepare(`
      INSERT INTO weekly_summary (week_start, headline, summary_json, generated_at)
      VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(week_start) DO UPDATE SET
        headline=excluded.headline, summary_json=excluded.summary_json, generated_at=excluded.generated_at
    `).run(weekStart, snap.summary.headline || "", JSON.stringify(snap.summary));
    console.log(`  ✓ weekly_summary: 1 row`);
  }

  // ---- v2: Traffic sources ----
  if (snap.traffic_sources?.length) {
    const stmt = db.prepare(`
      INSERT INTO traffic_source_weekly (week_start, source, medium, bucket, sessions, users, engaged_sessions, avg_session_duration)
      VALUES (?, @source, @medium, @bucket, @sessions, @users, @engaged_sessions, @avg_session_duration)
      ON CONFLICT(week_start, source, medium) DO UPDATE SET
        bucket=excluded.bucket, sessions=excluded.sessions, users=excluded.users,
        engaged_sessions=excluded.engaged_sessions, avg_session_duration=excluded.avg_session_duration
    `);
    for (const row of snap.traffic_sources) {
      const bucket = bucketFor(row.source, row.medium);
      stmt.run(weekStart, { ...row, bucket });
    }
    console.log(`  ✓ traffic_source_weekly: ${snap.traffic_sources.length} rows`);
  }

  // ---- v2: Traffic channels ----
  if (snap.channels?.length) {
    const stmt = db.prepare(`
      INSERT INTO traffic_channel_weekly (week_start, channel, sessions, users, engaged_sessions, avg_session_duration)
      VALUES (?, @channel, @sessions, @users, @engaged_sessions, @avg_session_duration)
      ON CONFLICT(week_start, channel) DO UPDATE SET
        sessions=excluded.sessions, users=excluded.users,
        engaged_sessions=excluded.engaged_sessions, avg_session_duration=excluded.avg_session_duration
    `);
    for (const row of snap.channels) stmt.run(weekStart, row);
    console.log(`  ✓ traffic_channel_weekly: ${snap.channels.length} rows`);
  }

  // ---- v2: Events daily ----
  if (snap.events_daily?.length) {
    const stmt = db.prepare(`
      INSERT INTO event_daily (date, event_name, event_count, total_users)
      VALUES (@date, @event_name, @event_count, @total_users)
      ON CONFLICT(date, event_name) DO UPDATE SET
        event_count=excluded.event_count, total_users=excluded.total_users
    `);
    for (const row of snap.events_daily) stmt.run(row);
    console.log(`  ✓ event_daily: ${snap.events_daily.length} rows`);
  }

  // ---- v2: Events weekly ----
  if (snap.events_weekly?.length) {
    const stmt = db.prepare(`
      INSERT INTO event_weekly (week_start, event_name, category, event_count, total_users)
      VALUES (?, @event_name, @category, @event_count, @total_users)
      ON CONFLICT(week_start, event_name) DO UPDATE SET
        category=excluded.category, event_count=excluded.event_count, total_users=excluded.total_users
    `);
    for (const row of snap.events_weekly) {
      const category = categoryFor(row.event_name);
      stmt.run(weekStart, { ...row, category });
    }
    console.log(`  ✓ event_weekly: ${snap.events_weekly.length} rows`);
  }

  // ---- v2: Conversion attribution ----
  if (snap.conversion_attribution?.length) {
    const stmt = db.prepare(`
      INSERT INTO conversion_attribution_weekly (week_start, source, bucket, event_name, event_count, total_users)
      VALUES (?, @source, @bucket, @event_name, @event_count, @total_users)
      ON CONFLICT(week_start, source, event_name) DO UPDATE SET
        bucket=excluded.bucket, event_count=excluded.event_count, total_users=excluded.total_users
    `);
    for (const row of snap.conversion_attribution) {
      const bucket = bucketFor(row.source, row.medium || '');
      stmt.run(weekStart, { ...row, bucket });
    }
    console.log(`  ✓ conversion_attribution_weekly: ${snap.conversion_attribution.length} rows`);
  }

  // ---- v2: Devices ----
  if (snap.devices?.length) {
    const stmt = db.prepare(`
      INSERT INTO device_weekly (week_start, device_category, sessions, users, engaged_sessions)
      VALUES (?, @device_category, @sessions, @users, @engaged_sessions)
      ON CONFLICT(week_start, device_category) DO UPDATE SET
        sessions=excluded.sessions, users=excluded.users, engaged_sessions=excluded.engaged_sessions
    `);
    for (const row of snap.devices) stmt.run(weekStart, row);
    console.log(`  ✓ device_weekly: ${snap.devices.length} rows`);
  }

  // ---- v2: Geography ----
  if (snap.geography?.length) {
    const stmt = db.prepare(`
      INSERT INTO geo_weekly (week_start, city, region, is_target_market, sessions, users, engaged_sessions)
      VALUES (?, @city, @region, @is_target_market, @sessions, @users, @engaged_sessions)
      ON CONFLICT(week_start, city) DO UPDATE SET
        region=excluded.region, is_target_market=excluded.is_target_market,
        sessions=excluded.sessions, users=excluded.users, engaged_sessions=excluded.engaged_sessions
    `);
    for (const row of snap.geography) {
      const isTarget = TARGET_CITIES.has(row.city) ? 1 : 0;
      stmt.run(weekStart, { ...row, is_target_market: isTarget, region: row.region ?? null });
    }
    console.log(`  ✓ geo_weekly: ${snap.geography.length} rows`);
  }

  // ---- v2: GBP ----
  if (snap.gbp) {
    db.prepare(`
      INSERT INTO gbp_weekly (week_start, rating, review_count, new_reviews, avg_new_rating,
        recent_post_count, most_recent_post_date, search_views, maps_views,
        direction_requests, phone_calls, website_clicks)
      VALUES (?, @rating, @review_count, @new_reviews, @avg_new_rating,
        @recent_post_count, @most_recent_post_date, @search_views, @maps_views,
        @direction_requests, @phone_calls, @website_clicks)
      ON CONFLICT(week_start) DO UPDATE SET
        rating=excluded.rating, review_count=excluded.review_count, new_reviews=excluded.new_reviews,
        avg_new_rating=excluded.avg_new_rating, recent_post_count=excluded.recent_post_count,
        most_recent_post_date=excluded.most_recent_post_date, search_views=excluded.search_views,
        maps_views=excluded.maps_views, direction_requests=excluded.direction_requests,
        phone_calls=excluded.phone_calls, website_clicks=excluded.website_clicks
    `).run(weekStart, {
      rating: snap.gbp.rating ?? null,
      review_count: snap.gbp.review_count ?? null,
      new_reviews: snap.gbp.new_reviews ?? null,
      avg_new_rating: snap.gbp.avg_new_rating ?? null,
      recent_post_count: snap.gbp.recent_post_count ?? null,
      most_recent_post_date: snap.gbp.most_recent_post_date ?? null,
      search_views: snap.gbp.search_views ?? null,
      maps_views: snap.gbp.maps_views ?? null,
      direction_requests: snap.gbp.direction_requests ?? null,
      phone_calls: snap.gbp.phone_calls ?? null,
      website_clicks: snap.gbp.website_clicks ?? null,
    });
    console.log(`  ✓ gbp_weekly: 1 row`);
  }

  // ---- v2: AI evaluation ----
  if (snap.ai_evaluation) {
    const ai = snap.ai_evaluation;
    db.prepare(`
      INSERT INTO ai_evaluation_weekly
        (week_start, generated_at, model, redesign_verdict, one_line_headline,
         what_changed, biggest_risk, biggest_opportunity, recommended_actions)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(week_start) DO UPDATE SET
        generated_at=excluded.generated_at, model=excluded.model,
        redesign_verdict=excluded.redesign_verdict, one_line_headline=excluded.one_line_headline,
        what_changed=excluded.what_changed, biggest_risk=excluded.biggest_risk,
        biggest_opportunity=excluded.biggest_opportunity, recommended_actions=excluded.recommended_actions
    `).run(
      weekStart,
      ai.generated_at || new Date().toISOString(),
      ai.model || 'unknown',
      ai.verdict ?? null,
      ai.headline ?? null,
      ai.what_changed ?? null,
      ai.biggest_risk ?? null,
      ai.biggest_opportunity ?? null,
      ai.recommended_actions ? JSON.stringify(ai.recommended_actions) : null
    );
    console.log(`  ✓ ai_evaluation_weekly: 1 row`);
  }

  // ---- v2.1: Core Web Vitals ----
  if (Array.isArray(snap.cwv) && snap.cwv.length) {
    const ins = db.prepare(`
      INSERT OR REPLACE INTO cwv_weekly
        (week_start, url, strategy, performance_score, lcp_ms, inp_ms, cls, fcp_ms, ttfb_ms, speed_index_ms, tbt_ms, cwv_status, fetch_status, fetch_error)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `);
    let n = 0;
    for (const r of snap.cwv) {
      ins.run(
        weekStart, r.url, r.strategy,
        r.performance_score ?? null,
        r.lcp_ms ?? null, r.inp_ms ?? null, r.cls ?? null,
        r.fcp_ms ?? null, r.ttfb_ms ?? null,
        r.speed_index_ms ?? null, r.tbt_ms ?? null,
        r.cwv_status ?? null,
        r.fetch_status ?? 'ok', r.fetch_error ?? null
      );
      n++;
    }
    console.log(`  ✓ cwv_weekly: ${n} rows`);
  }

  // ---- v2.1: Local Pack ----
  if (Array.isArray(snap.local_pack) && snap.local_pack.length) {
    const ins = db.prepare(`
      INSERT OR REPLACE INTO local_pack_weekly
        (week_start, keyword, location, in_local_pack, local_pack_position, business_name, rating, reviews_count, pack_size, competitors_above)
      VALUES (?,?,?,?,?,?,?,?,?,?)
    `);
    let n = 0;
    for (const r of snap.local_pack) {
      ins.run(
        weekStart, r.keyword, r.location || 'Phoenix',
        r.in_local_pack ? 1 : 0,
        r.local_pack_position ?? null,
        r.business_name ?? null,
        r.rating ?? null, r.reviews_count ?? null,
        r.pack_size ?? null,
        Array.isArray(r.competitors_above) ? JSON.stringify(r.competitors_above) : (r.competitors_above ?? null)
      );
      n++;
    }
    console.log(`  ✓ local_pack_weekly: ${n} rows`);
  }
});

tx();
}

db.close();
console.log(`\n✓ Imported ${snapPaths.length} snapshot(s). Next: npm run build`);
