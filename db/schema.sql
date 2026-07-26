-- The Turf Yard SEO dashboard — SQLite schema
-- All weekly tables key on week_start (Monday-based ISO date string 'YYYY-MM-DD').

-- Google Search Console — daily site totals
CREATE TABLE IF NOT EXISTS gsc_daily (
  date        TEXT PRIMARY KEY,        -- 'YYYY-MM-DD'
  clicks      INTEGER NOT NULL,
  impressions INTEGER NOT NULL,
  ctr         REAL    NOT NULL,        -- fraction (0..1)
  position    REAL    NOT NULL,        -- average position
  created_at  TEXT    DEFAULT (datetime('now'))
);

-- GSC — weekly per-query performance
CREATE TABLE IF NOT EXISTS gsc_query_weekly (
  week_start  TEXT    NOT NULL,
  query       TEXT    NOT NULL,
  clicks      INTEGER NOT NULL,
  impressions INTEGER NOT NULL,
  ctr         REAL    NOT NULL,
  position    REAL    NOT NULL,
  PRIMARY KEY (week_start, query)
);

-- GSC — weekly per-page performance
CREATE TABLE IF NOT EXISTS gsc_page_weekly (
  week_start  TEXT    NOT NULL,
  page        TEXT    NOT NULL,
  clicks      INTEGER NOT NULL,
  impressions INTEGER NOT NULL,
  ctr         REAL    NOT NULL,
  position    REAL    NOT NULL,
  PRIMARY KEY (week_start, page)
);

-- GA4 — daily site totals
CREATE TABLE IF NOT EXISTS ga4_daily (
  date                 TEXT PRIMARY KEY,
  sessions             INTEGER NOT NULL,
  total_users          INTEGER NOT NULL,
  new_users            INTEGER NOT NULL,
  engaged_sessions     INTEGER NOT NULL,
  engagement_rate      REAL    NOT NULL,
  avg_session_duration REAL    NOT NULL,   -- seconds; last event - first event. Collapses to ~0
                                           -- for single-event sessions, so it is NOT a measure of
                                           -- attention. Retained for continuity; prefer the next column.
  avg_engagement_time  REAL,               -- seconds; GA4 averageEngagementTimePerSession, i.e. the
                                           -- SDK's foreground visibility timer. The honest "time on site".
  bounce_rate          REAL    NOT NULL,
  page_views           INTEGER NOT NULL,
  conversions          INTEGER NOT NULL,
  -- Sessions remaining after removing known cloud/datacenter egress locations whose
  -- measured engagement time is ~0s (see SNAPSHOT_SCHEMA.md "automated traffic").
  -- Nullable: rows imported before this was tracked have no value.
  sessions_excl_auto        INTEGER,
  engaged_sessions_excl_auto INTEGER,
  created_at           TEXT    DEFAULT (datetime('now'))
);

-- GA4 — weekly per-channel
CREATE TABLE IF NOT EXISTS ga4_channel_weekly (
  week_start       TEXT    NOT NULL,
  channel          TEXT    NOT NULL,
  sessions         INTEGER NOT NULL,
  engaged_sessions INTEGER NOT NULL,
  conversions      INTEGER NOT NULL,
  PRIMARY KEY (week_start, channel)
);

-- GA4 — weekly per-landing-page
CREATE TABLE IF NOT EXISTS ga4_landing_weekly (
  week_start       TEXT    NOT NULL,
  landing_page     TEXT    NOT NULL,
  sessions         INTEGER NOT NULL,
  engaged_sessions INTEGER NOT NULL,
  avg_duration     REAL    NOT NULL,
  conversions      INTEGER NOT NULL,
  PRIMARY KEY (week_start, landing_page)
);

-- Keyword rank tracking — weekly position per keyword/location
CREATE TABLE IF NOT EXISTS keyword_rank_weekly (
  week_start    TEXT NOT NULL,
  keyword       TEXT NOT NULL,
  position      REAL,
  url           TEXT,
  search_volume INTEGER,
  location      TEXT NOT NULL,
  PRIMARY KEY (week_start, keyword, location)
);

-- Keyword metadata (group / intent / priority / competitor)
CREATE TABLE IF NOT EXISTS keyword_meta (
  keyword       TEXT PRIMARY KEY,
  group_name    TEXT,
  intent        TEXT,
  priority      INTEGER,
  competitor    TEXT,
  tracked_since TEXT
);

-- Competitor tracking — weekly Ahrefs snapshot
CREATE TABLE IF NOT EXISTS competitor_weekly (
  week_start       TEXT    NOT NULL,
  domain           TEXT    NOT NULL,
  organic_keywords INTEGER,
  organic_traffic  INTEGER,
  dr               INTEGER,
  common_keywords  INTEGER,
  PRIMARY KEY (week_start, domain)
);

-- On-page audit findings
CREATE TABLE IF NOT EXISTS audit_findings (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  audit_date     TEXT,
  url            TEXT,
  severity       TEXT,   -- critical | warning | info
  category       TEXT,
  finding        TEXT,
  recommendation TEXT,
  status         TEXT    -- open | fixed | wontfix
);

-- Backlinks — weekly totals
CREATE TABLE IF NOT EXISTS backlinks_weekly (
  week_start      TEXT PRIMARY KEY,
  total_backlinks INTEGER,
  referring_domains INTEGER,
  new_referring   INTEGER,
  lost_referring  INTEGER
);

-- Weekly executive summary
CREATE TABLE IF NOT EXISTS weekly_summary (
  week_start   TEXT PRIMARY KEY,
  headline     TEXT,
  summary_json TEXT,   -- JSON blob
  generated_at TEXT
);

-- ===== v2 tables =====

-- Traffic sources: one row per (week_start, source, medium)
CREATE TABLE IF NOT EXISTS traffic_source_weekly (
  week_start TEXT NOT NULL,
  source TEXT NOT NULL,
  medium TEXT NOT NULL,
  bucket TEXT NOT NULL,  -- 'ai', 'reddit', 'social', 'search', 'direct', 'referral', 'other'
  sessions INTEGER, users INTEGER, engaged_sessions INTEGER, avg_session_duration REAL,
  PRIMARY KEY (week_start, source, medium)
);

-- Default channel group rollup (for the standard view)
CREATE TABLE IF NOT EXISTS traffic_channel_weekly (
  week_start TEXT NOT NULL,
  channel TEXT NOT NULL,
  sessions INTEGER, users INTEGER, engaged_sessions INTEGER, avg_session_duration REAL,
  PRIMARY KEY (week_start, channel)
);

-- Events: daily totals per event
CREATE TABLE IF NOT EXISTS event_daily (
  date TEXT NOT NULL,
  event_name TEXT NOT NULL,
  event_count INTEGER, total_users INTEGER,
  PRIMARY KEY (date, event_name)
);

-- Events: weekly totals per event (faster aggregates for the page)
CREATE TABLE IF NOT EXISTS event_weekly (
  week_start TEXT NOT NULL,
  event_name TEXT NOT NULL,
  category TEXT NOT NULL,  -- 'conversion' | 'engagement' | 'navigation'
  event_count INTEGER, total_users INTEGER,
  PRIMARY KEY (week_start, event_name)
);

-- Conversion attribution: events x source
CREATE TABLE IF NOT EXISTS conversion_attribution_weekly (
  week_start TEXT NOT NULL,
  source TEXT NOT NULL,
  bucket TEXT NOT NULL,
  event_name TEXT NOT NULL,
  event_count INTEGER, total_users INTEGER,
  PRIMARY KEY (week_start, source, event_name)
);

-- Devices: weekly device-category sessions
CREATE TABLE IF NOT EXISTS device_weekly (
  week_start TEXT NOT NULL,
  device_category TEXT NOT NULL,
  sessions INTEGER, users INTEGER, engaged_sessions INTEGER,
  PRIMARY KEY (week_start, device_category)
);

-- Geography: weekly city sessions
CREATE TABLE IF NOT EXISTS geo_weekly (
  week_start TEXT NOT NULL,
  city TEXT NOT NULL,
  region TEXT,  -- inferred or null
  is_target_market INTEGER DEFAULT 0,
  sessions INTEGER, users INTEGER, engaged_sessions INTEGER,
  PRIMARY KEY (week_start, city)
);

-- Google Business Profile snapshot (one row per week)
CREATE TABLE IF NOT EXISTS gbp_weekly (
  week_start TEXT NOT NULL PRIMARY KEY,
  rating REAL,
  review_count INTEGER,
  new_reviews INTEGER,
  avg_new_rating REAL,
  recent_post_count INTEGER,
  most_recent_post_date TEXT,
  search_views INTEGER,
  maps_views INTEGER,
  direction_requests INTEGER,
  phone_calls INTEGER,
  website_clicks INTEGER
);

-- AI weekly evaluation
CREATE TABLE IF NOT EXISTS ai_evaluation_weekly (
  week_start TEXT NOT NULL PRIMARY KEY,
  generated_at TEXT NOT NULL,
  model TEXT NOT NULL,
  redesign_verdict TEXT,  -- 'working' | 'too-early' | 'concerning' | 'mixed'
  one_line_headline TEXT,
  what_changed TEXT,
  biggest_risk TEXT,
  biggest_opportunity TEXT,
  recommended_actions TEXT  -- JSON array of {action, rationale, leverage}
);

-- Core Web Vitals (PageSpeed Insights) — one row per URL+strategy per week
CREATE TABLE IF NOT EXISTS cwv_weekly (
  week_start TEXT NOT NULL,
  url        TEXT NOT NULL,
  strategy   TEXT NOT NULL CHECK (strategy IN ('mobile','desktop')),
  performance_score REAL,     -- 0..1 (Lighthouse)
  lcp_ms       REAL,           -- Largest Contentful Paint
  inp_ms       REAL,           -- Interaction to Next Paint
  cls          REAL,           -- Cumulative Layout Shift
  fcp_ms       REAL,           -- First Contentful Paint
  ttfb_ms      REAL,           -- Time to First Byte
  speed_index_ms REAL,
  tbt_ms       REAL,           -- Total Blocking Time
  cwv_status   TEXT,           -- 'good' | 'needs-improvement' | 'poor' | null
  fetch_status TEXT,           -- 'ok' | 'error'
  fetch_error  TEXT,
  PRIMARY KEY (week_start, url, strategy)
);

-- Local Pack tracking — Google 3-pack presence for Phoenix-area queries
CREATE TABLE IF NOT EXISTS local_pack_weekly (
  week_start TEXT NOT NULL,
  keyword TEXT NOT NULL,
  location TEXT NOT NULL,        -- 'Phoenix' | 'Mesa' | 'US' etc.
  in_local_pack INTEGER NOT NULL,-- 0 | 1
  local_pack_position INTEGER,   -- 1..3 (null if not in pack)
  business_name TEXT,            -- name found in local pack (e.g. 'The Turf Yard')
  rating REAL,
  reviews_count INTEGER,
  pack_size INTEGER,             -- typically 3 (sometimes 1-3)
  competitors_above TEXT,        -- JSON array of competitor names ranked above
  PRIMARY KEY (week_start, keyword, location)
);
