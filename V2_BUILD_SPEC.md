# Turf Yard Dashboard v2 — Build Spec

## Mission
Extend the existing dashboard at `/home/user/workspace/turf_yard_dashboard/` with 5 new pages + an AI Insights card on the Overview. Do NOT break the existing pages — they keep working as-is. Match the existing brand palette and component style.

## Project context
- Astro 4 + Tailwind + Chart.js + better-sqlite3
- Brand colors are defined in `tailwind.config.mjs` — use `brand.green`, `brand.sand`, `brand.terra`, `brand.cream`, `brand.ink` etc.
- Existing components live in `src/components/`: Layout, Logo, KpiCard, LineChart, BarChart, DonutChart, DataTable, SeverityBadge, Section, RedesignBanner, Sparkline
- DB schema at `db/schema.sql`, init at `db/init.ts`
- Existing seed script: `scripts/seed_from_baseline.ts` — reads from `baseline/baseline_locked_2026-05-30.json`
- New baseline data files are in `baseline/v2/`:
  - `ga4_traffic_sources.json` — sessionSource × sessionMedium, 27 rows
  - `ga4_channels.json` — sessionDefaultChannelGroup, 6 rows
  - `ga4_events_daily.json` — date × eventName, 274 rows
  - `ga4_conversion_attribution.json` — sessionSource × eventName (filtered to key events), 20 rows
  - `ga4_devices_geo.json` — deviceCategory × city, 602 rows
- After your changes, `npm run setup` must still work end-to-end and seed all the new tables.
- `npm run build` (with `GITHUB_PAGES=true npm run build`) must produce a working static site for GitHub Pages at base `/turf-yard-seo-dashboard`.

## What to build

### 1. Schema additions (db/schema.sql)
Add these tables (use existing naming conventions: snake_case, `_weekly` suffix for weekly snapshots):

```sql
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

-- Conversion attribution: events × source
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
  is_target_market INTEGER DEFAULT 0,  -- 1 if Phoenix, Mesa, Gilbert, Chandler, Tempe, Glendale, Peoria, Scottsdale, Surprise, Buckeye, Avondale, Goodyear, San Tan Valley, Apache Junction, Queen Creek, Maricopa, Casa Grande OR Provo, Orem, Lehi, Spanish Fork, Eagle Mountain, West Jordan, Pleasant View, Murray, Springville, Salt Lake City
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
  -- Insights metrics (when GBP Performance API is available)
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
```

### 2. Update db/init.ts
Append the new tables to the init script so `npm run setup` creates them. Don't drop the existing tables.

### 3. Update scripts/seed_from_baseline.ts
Add functions to seed each new table from `baseline/v2/*.json`. The baseline window is 2026-05-03 to 2026-05-30 (28 days). For weekly tables, distribute the 28-day total evenly across 4 synthetic week_starts: 2026-05-03, 2026-05-10, 2026-05-17, 2026-05-24. For `event_daily`, the date in the JSON is `YYYYMMDD` — convert to `YYYY-MM-DD`.

**Bucket mapping logic** (use in both seed + import scripts):
```ts
function bucketFor(source: string, medium: string): 'ai'|'reddit'|'social'|'search'|'direct'|'referral'|'other' {
  const s = (source||'').toLowerCase();
  const m = (medium||'').toLowerCase();
  const AI_HOSTS = ['chatgpt.com','chat.openai.com','openai.com','perplexity.ai','www.perplexity.ai','claude.ai','gemini.google.com','bard.google.com','copilot.microsoft.com','bing.com/chat','meta.ai','you.com','phind.com','searchgpt.com','grok.com','poe.com','character.ai'];
  if (AI_HOSTS.some(h => s.includes(h.split('.')[0]) || s === h)) return 'ai';
  if (s.includes('reddit')) return 'reddit';
  if (m === 'organic' || s === 'google' || s === 'bing' || s === 'yahoo' || s === 'duckduckgo' || s === 'baidu' || s === 'ecosia') return 'search';
  if (m === 'social' || ['facebook.com','m.facebook.com','instagram.com','ig','twitter.com','x.com','linkedin.com','tiktok.com','pinterest.com','youtube.com','t.co','lnkd.in','fb.me'].some(h => s.includes(h.split('.')[0]))) return 'social';
  if (s === '(direct)' || m === '(none)') return 'direct';
  if (m === 'referral') return 'referral';
  return 'other';
}
```

**Event category mapping**:
- `conversion`: form_submit, form_start, phone_click, quote_request_click, calculator_start, calculator_complete, generate_lead, file_download
- `engagement`: video_start, video_progress, video_complete, scroll, user_engagement
- `navigation`: page_view, session_start, first_visit, click, location_page_view

**Target-market cities** for `geo_weekly.is_target_market = 1`:
Phoenix Metro: Phoenix, Mesa, Gilbert, Chandler, Tempe, Glendale, Peoria, Scottsdale, Surprise, Buckeye, Avondale, Goodyear, San Tan Valley, Apache Junction, Queen Creek, Maricopa, Casa Grande, Fountain Hills, Flagstaff, Tucson, Marana
Utah: Provo, Orem, Lehi, Spanish Fork, Eagle Mountain, West Jordan, Pleasant View, Murray, Springville, Salt Lake City, Lindon, Ogden, Heber City, Draper, Cottonwood Heights, Pleasant Grove, Manti, Vernal, West Haven

For the AI evaluation seed, insert ONE row with `week_start='2026-05-24'` (the last pre-redesign week), with the verdict='too-early', headline 'Baseline locked — measurement starts now.', and a brief 'what_changed' explaining this is the pre-redesign baseline.

### 4. Build 5 new Astro pages

All use the existing `Layout` component. Add nav items to the sidebar in `src/components/Layout.astro` after "Audit": **Traffic**, **Events**, **Devices & Geo**, **Local Business**, **Attribution**.

#### `src/pages/traffic.astro` — Traffic Sources
- Top section: 6 KPI cards in a 3×2 grid — one per bucket (AI, Reddit, Social, Search, Direct, Referral). Each shows total sessions this week + sparkline + WoW delta. The AI and Reddit cards get a small accent badge ("Emerging" for AI, "Community" for Reddit).
- Detail table sorted by sessions: Source · Medium · Bucket · Sessions · Users · Engaged · Avg duration
- Donut chart showing channel share (using `traffic_channel_weekly`)

#### `src/pages/events.astro` — Events
- KPI strip: form_submit (with $ icon), generate_lead, phone_click, quote_request_click, calculator_complete — each with WoW delta
- Funnel cards:
  - "Form funnel": form_start → form_submit, show submit rate
  - "Calculator funnel": calculator_start → calculator_complete, show completion rate
- Table of all events grouped by category (conversion / engagement / navigation) with weekly count + spark
- Line chart of total events per day (last 60 days from `event_daily`)

#### `src/pages/devices-geo.astro` — Devices & Geography
- Top: 3 KPI cards (mobile / desktop / tablet sessions + share)
- Donut chart: device share
- Bar chart: top 15 target-market cities sorted by sessions
- Table: all cities, sorted by sessions, with target-market column highlighted (use `brand.green` text)

#### `src/pages/local-business.astro` — Google Business Profile
- Rating big number + review count
- New reviews this week (with delta)
- Most recent post date
- If `search_views`/`maps_views`/etc. are populated: 5-tile KPI strip with deltas. Else show a note "GBP Performance API not yet wired — populated on next cron run."
- A note explaining what GBP data shows since the cron will populate it weekly

#### `src/pages/attribution.astro` — Conversion Attribution
- Headline: "Which channels drive conversions?"
- For each key conversion event (form_submit, phone_click, quote_request_click, generate_lead, calculator_complete, calculator_start):
  - Show a small horizontal bar chart of sources broken down by bucket color
- Big table at bottom: Source × Event → count, sorted by count desc

### 5. AI Insights card on Overview

In `src/pages/index.astro`, add a new section RIGHT BELOW the existing redesign tracker section and ABOVE the GSC/GA4 charts:

- A prominent card with brand-green left border, headline "AI Strategist", subheadline "Weekly synthesis — generated {generated_at} by {model}"
- Big verdict pill ("Redesign too early to call" / "Working" / "Concerning" / "Mixed") with appropriate color
- One-line headline in large type
- 3 stacked accordion-like sections (use static `<details>` to keep it pure HTML): "What changed", "Biggest risk", "Biggest opportunity"
- A numbered list of recommended actions, each with action + rationale + leverage tag (low/med/high)

Read from the latest row of `ai_evaluation_weekly`. If table is empty, show a graceful empty state.

### 6. Update scripts/import_snapshot.ts

Extend the importer to read these new snapshot JSON keys (if present) and upsert into the new tables:
- `traffic_sources` → array of {source, medium, sessions, users, engaged_sessions, avg_session_duration} → upsert into traffic_source_weekly with bucket computed
- `channels` → array of {channel, sessions, users, engaged_sessions, avg_session_duration} → upsert into traffic_channel_weekly
- `events_daily` → array of {date, event_name, event_count, total_users} → upsert into event_daily
- `events_weekly` → array of {event_name, event_count, total_users} → upsert into event_weekly with category computed
- `conversion_attribution` → array of {source, event_name, event_count, total_users} → upsert with bucket
- `devices` → array of {device_category, sessions, users, engaged_sessions} → upsert
- `geography` → array of {city, sessions, users, engaged_sessions} → upsert with is_target_market computed
- `gbp` → object with rating, review_count, new_reviews, avg_new_rating, recent_post_count, etc → upsert single row
- `ai_evaluation` → object with verdict, headline, what_changed, biggest_risk, biggest_opportunity, recommended_actions → upsert

All upserts are keyed by week_start (= snapshot's `week_start` field).

### 7. Update SNAPSHOT_SCHEMA.md

Add documentation for the new top-level snapshot fields. Keep existing docs intact.

### 8. Update README.md

In the "Pages" section, add the 5 new pages. In "What gets refreshed weekly", add traffic, events, devices, geo, GBP, AI evaluation.

## Constraints

- **DO NOT** modify the existing locked baseline file `baseline/baseline_locked_2026-05-30.json` or `config/tracked_keywords.json`
- **DO NOT** remove existing tables or pages
- **DO** use existing Tailwind classes — match the visual language of the existing pages exactly
- **DO** make every new page use the same `Layout` component
- **DO** test with `npm run setup && npm run build` before declaring done. The build must succeed.
- **DO NOT** commit or push — I'll do that after reviewing your work

## Output expected
At the end, report:
1. Which files you created/modified
2. Output of `npm run setup` (row counts)
3. Output of `GITHUB_PAGES=true npm run build` (success + page count)
4. Confirm no existing pages broke (you can `curl` the dev server or just check `dist/`)
