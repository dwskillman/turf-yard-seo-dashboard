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
  avg_session_duration REAL    NOT NULL,   -- seconds
  bounce_rate          REAL    NOT NULL,
  page_views           INTEGER NOT NULL,
  conversions          INTEGER NOT NULL,
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
