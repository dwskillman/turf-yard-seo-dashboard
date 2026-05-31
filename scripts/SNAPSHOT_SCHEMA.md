# Weekly Snapshot JSON Schema

Every Monday, the Perplexity Computer cron writes a snapshot file to `data/snapshots/{YYYY-MM-DD}.json` where the filename is the **Monday of the reporting week** (start of the 7-day window the data describes).

The dashboard imports this snapshot into SQLite via `npm run import:latest`.

## Top-level fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `week_start` | string `YYYY-MM-DD` | yes | Monday of the reporting week |
| `week_end` | string `YYYY-MM-DD` | yes | Sunday of the reporting week |
| `generated_at` | ISO timestamp | yes | When the cron generated the snapshot |
| `redesign_launch_date` | string | yes | `2026-05-31` (locked) |
| `days_since_redesign` | int | yes | Computed |
| `gsc` | object | yes | Google Search Console data |
| `ga4` | object | yes | Google Analytics 4 data |
| `keyword_rankings` | array | yes | DataForSEO weekly rank pull |
| `competitors` | array | optional | Refreshed monthly post Ahrefs reset |
| `audit_findings` | array | optional | DataForSEO OnPage run |
| `backlinks` | object | optional | DataForSEO backlinks summary |
| `summary` | object | yes | Executive summary for the week |

## `gsc`

```json
{
  "daily": [
    {"date": "2026-06-01", "clicks": 28, "impressions": 3210, "ctr": 0.0087, "position": 17.2}
  ],
  "queries": [
    {"query": "the turf yard", "clicks": 12, "impressions": 35, "ctr": 0.34, "position": 1.3}
  ],
  "pages": [
    {"page": "/", "clicks": 42, "impressions": 7800, "ctr": 0.005, "position": 17.5}
  ]
}
```

## `ga4`

```json
{
  "daily": [
    {"date": "2026-06-01", "sessions": 78, "total_users": 62, "new_users": 48,
     "engaged_sessions": 43, "engagement_rate": 0.55, "avg_session_duration": 224.5,
     "bounce_rate": 0.45, "page_views": 145, "conversions": 0}
  ],
  "channels": [
    {"channel": "Organic Search", "sessions": 295, "engaged_sessions": 180, "conversions": 0}
  ],
  "landing_pages": [
    {"landing_page": "/", "sessions": 180, "engaged_sessions": 112, "avg_duration": 245.2, "conversions": 0}
  ]
}
```

## `keyword_rankings`

```json
[
  {"keyword": "the turf yard", "position": 1, "url": "https://theturfyard.com/",
   "search_volume": 70, "location": "US"}
]
```

`position = null` means the keyword was outside the top 100. `location` is `"US"` for national searches or `"Phoenix"` for local-pack queries (the ETL runs both for the gap keywords).

## `competitors`

```json
[
  {"domain": "theturfyard.com", "organic_keywords": 168, "organic_traffic": 591, "dr": 9, "common_keywords": null},
  {"domain": "nexgenlawns.com", "organic_keywords": 1240, "organic_traffic": 14044, "dr": 34, "common_keywords": 30}
]
```

## `audit_findings`

Severity is one of `critical`, `warning`, `info`. The import dedupes by `(url, category, finding)` for any existing open findings, so re-scans are safe.

```json
[
  {"url": "/", "severity": "critical", "category": "missing_schema",
   "finding": "Homepage missing JSON-LD", "recommendation": "Add LocalBusiness schema"}
]
```

## `backlinks`

```json
{
  "total_backlinks": 2400,
  "referring_domains": 145,
  "new_referring": 6,
  "lost_referring": 2
}
```

## `summary`

```json
{
  "headline": "Day 8 post-redesign — clicks up 12% vs baseline",
  "winners": [{"query": "...", "old_position": 22, "new_position": 14, "clicks_delta": 8}],
  "losers": [],
  "opportunities": [],
  "content_strategy": [],
  "next_steps": []
}
```
