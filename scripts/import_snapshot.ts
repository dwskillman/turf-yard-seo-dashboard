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

function pickSnapshot(): string {
  const arg = process.argv[2];
  if (arg) {
    const explicit = join(SNAP_DIR, arg);
    if (!existsSync(explicit)) throw new Error(`Snapshot not found: ${explicit}`);
    return explicit;
  }
  const files = readdirSync(SNAP_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .reverse();
  if (files.length === 0) throw new Error(`No snapshots in ${SNAP_DIR}`);
  return join(SNAP_DIR, files[0]);
}

const snapPath = pickSnapshot();
console.log(`Importing snapshot: ${snapPath}`);
const snap = JSON.parse(readFileSync(snapPath, "utf8"));

if (!existsSync(DB_PATH)) {
  throw new Error(`Database not found at ${DB_PATH}. Run \`npm run db:init\` first.`);
}

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

const weekStart: string = snap.week_start;
if (!weekStart) throw new Error("Snapshot missing required field: week_start");
console.log(`Week start: ${weekStart}`);

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
    for (const row of snap.ga4.daily) stmt.run(row);
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
    for (const row of snap.ga4.channels) stmt.run(weekStart, row);
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
    for (const row of snap.ga4.landing_pages) stmt.run(weekStart, row);
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
    for (const row of snap.keyword_rankings) stmt.run(weekStart, row);
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
    for (const row of snap.audit_findings) {
      if (!exists.get(row.url, row.category, row.finding)) {
        insert.run(snap.audit_date || weekStart, row);
        added++;
      }
    }
    console.log(`  ✓ audit_findings: ${added} new (${snap.audit_findings.length} scanned)`);
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
});

tx();
db.close();
console.log(`\n✓ Import complete. Next: npm run build`);
