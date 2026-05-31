# Turf Yard Weekly SEO Dashboard Refresh

You are running the weekly SEO data refresh for The Turf Yard (theturfyard.com — artificial turf installer in Phoenix/Mesa/Provo). The site relaunched on **2026-05-31** — this is the locked baseline date for all post-redesign comparisons.

Your job: pull fresh data from 4 sources, write a snapshot JSON, commit it to the GitHub dashboard repo if configured, send Daniel a branded PDF + email summary.

## Reporting window
- `week_end` = yesterday (Sunday)
- `week_start` = 6 days before week_end (Monday)
- Use these exact ISO dates everywhere — compute them in Python at the start.

## Step 1 — Google Search Console (free, fast)
Connector: `google_search_console__pipedream` → `google_search_console-retrieve-site-performance-data`
- `siteUrl: "sc-domain:theturfyard.com"`, `startDate: week_start`, `endDate: week_end`

Make three separate calls:
1. `dimensions: ["date"]`, `rowLimit: 7` → daily totals
2. `dimensions: ["query"]`, `rowLimit: 100` → top queries
3. `dimensions: ["page"]`, `rowLimit: 50` → top pages

## Step 2 — Google Analytics 4 (free, fast)
Connector: `google_analytics__pipedream` → `google_analytics-run-report-in-ga4`
- `property: "properties/407057852"`, `startDate: week_start`, `endDate: week_end`

Three calls:
1. `metrics: ["sessions","totalUsers","newUsers","engagedSessions","engagementRate","averageSessionDuration","bounceRate","screenPageViews","conversions"]`, `dimensions: ["date"]` → daily
2. Same metrics, `dimensions: ["sessionDefaultChannelGroup"]` → channels
3. Same metrics, `dimensions: ["landingPage"]` → landing pages

## Step 3 — DataForSEO keyword ranks (paid, ~$0.07)
Read the tracked keywords list from the dashboard repo: `config/tracked_keywords.json` (70 keywords across multiple groups). If you can't read the file (no repo yet), fall back to using the keywords from your memory of the prior week's snapshot.

For EACH of the 70 keywords call:
- Connector: `dataforseo__pipedream` → `dataforseo-get-google-organic-results`
- `keyword: <keyword>`, `locationCode: 2840` (US), `languageCode: "en"`, `depth: 100`

For each result: find the first `theturfyard.com` URL in the organic results. Record its position (1-based). If not found in top 100, record `position: null`. Also record `url`.

Phoenix-local gap keywords (group `gap_*` and `phoenix_local`) get a SECOND call with `locationCode: 1024118` (Phoenix). Record those rows with `location: "Phoenix"` instead of `"US"`.

**Cost guard:** if a single keyword call returns an error, log it and continue — don't abort the run.

## Step 4 — Ahrefs (budget-gated, monthly refresh)
Call `ahrefs` → `subscription-info-limits-and-usage` first (free). If `units_limit_workspace - units_usage_workspace > 300`:
- `site-explorer-domain-rating` for theturfyard.com (date=today, protocol=both)
- `site-explorer-organic-competitors` (target=theturfyard.com, mode=subdomains, country=us, limit=10, select=domain,domain_rating,common_keywords,organic_traffic)
- Build `competitors` array including theturfyard.com itself as the first row

If budget too low, **skip Ahrefs** and emit `competitors: []` plus a `summary.notes` entry "Ahrefs refresh skipped — budget low. Next refresh after {reset_date}."

## Step 5 — DataForSEO backlinks summary (~$0.02)
Connector: `dataforseo__pipedream` → `dataforseo-get-backlinks-summary` with `target: "theturfyard.com"`, `includeSubdomains: true`, `excludeInternalBacklinks: true`, `backlinksStatusType: "live"`.
Record `total_backlinks`, `referring_domains`. For `new_referring` / `lost_referring`, diff vs. last week's snapshot if you have it in memory.

## Step 6 — DataForSEO on-page audit (~$0.03)
Top 5 pages from Step 1's page results → for each call `dataforseo__pipedream` → `dataforseo-parse-page-content`. From each result, derive findings:
- `missing_h1` if no h1 tag
- `missing_meta_description` if no meta description
- `missing_schema` if no JSON-LD found
- `title_truncated` if `<title>` length > 65 chars (will be cut in SERPs)
- `thin_content` if visible word count < 300

## Step 7 — Compute WoW + redesign deltas (in-process)
- WoW = current week vs the week before (search memory for prior snapshot)
- Redesign-impact: current week vs the locked baseline 4-week average (clicks: 204/wk, impressions: 23,816/wk, position: 17.21, sessions: 496/wk, engagement_rate: 0.558)
- Build `summary.winners` (top 5 queries with biggest clicks gain WoW) and `summary.losers` (top 5 drops)
- Build `summary.opportunities` (queries with >100 impressions but position 5-15 OR CTR <1%)
- Build `summary.content_strategy` (5 prioritized recommendations Phoenix-biased)
- Build `summary.next_steps` (3 highest-impact actions)

## Step 8 — Assemble the snapshot JSON
Build the snapshot per the schema in `scripts/SNAPSHOT_SCHEMA.md`. Top-level fields:
- `week_start`, `week_end`, `generated_at` (ISO), `redesign_launch_date: "2026-05-31"`, `days_since_redesign` (compute)
- `gsc: { daily, queries, pages }`
- `ga4: { daily, channels, landing_pages }`
- `keyword_rankings: [...]` — one row per keyword (and one per Phoenix variant for gap keywords)
- `competitors: [...]`
- `audit_findings: [...]`
- `backlinks: { ... }`
- `summary: { headline, winners, losers, opportunities, content_strategy, next_steps, notes }`

Write it to `/home/user/workspace/turf_yard_data/snapshots/{week_start}.json` (create the directory if needed).

## Step 9 — Commit to GitHub (if repo connected)
Check `list_external_tools(queries=["github"])`. If the GitHub connector is `CONNECTED` AND a previous session memory says "Turf Yard SEO dashboard repo: {owner}/{repo}":
- Use the GitHub connector to commit `data/snapshots/{week_start}.json` and `data/seo.db.example` to the repo's main branch
- Commit message: `Weekly snapshot {week_start} — {days_since_redesign} days post-redesign`

If no repo configured yet, skip this step and add to email body: "GitHub repo not yet configured. Snapshot saved at `/home/user/workspace/turf_yard_data/snapshots/{week_start}.json` — run `npm run import:latest` locally after pulling."

## Step 10 — Save snapshot to memory
`memory_update`: "Remember that for the week ending {week_end}, Turf Yard SEO weekly snapshot: clicks={total}, impressions={total}, sessions={total}, avg position={p}, top 5 queries were [...]. Redesign day {N}. Snapshot file: {path}. Compare vs baseline (204 clicks/wk, 23816 impr/wk, 17.21 pos, 496 sessions/wk)."

## Step 11 — Build the branded PDF
Reuse `/home/user/workspace/turf_yard_report/build_pdf.py` and `make_charts.py` — but UPDATE them to read from the new snapshot JSON instead of hardcoded data. Cover should now say "Week {N} post-redesign" instead of just dates. Add a new "Redesign Impact" page right after the cover that shows the 6 key metrics vs locked baseline.

If `build_pdf.py` execution fails for any reason, skip the PDF and note it in the email — the email + dashboard snapshot are the primary deliverables.

## Step 12 — Send email + in-app notification
`send_notification`:
- `channels: ["email", "in_app"]`
- `title: "Turf Yard SEO — Week {N} post-redesign ({week_start} to {week_end})"`
- `body`: 2-3 sentences with the headline finding and the biggest opportunity
- `schedule_description: "Mondays · 7:00AM Phoenix"`
- `email_args.template: "generic"`
- `email_args.subject: "Turf Yard SEO Dashboard Update — Week of {week_start}"`

Email body (Markdown, follow this structure exactly):

```
# Turf Yard SEO — Week of {week_start} to {week_end}
*Day {N} post-redesign launch*

## Executive Summary
{2-3 sentences}

## Dashboard Updated
The dashboard at `[repo URL OR local path]` has been refreshed with this week's data.
To view: `cd "Turf Yard SEO/seo-dashboard" && npm run weekly && npm run dev` → http://localhost:4321/

## Redesign Impact (vs locked baseline)
| Metric | Baseline (4-wk avg) | This Week | Change |
|---|---|---|---|
| Clicks / week | 204 | {X} | {±N%} |
| Impressions / week | 23,816 | {Y} | {±N%} |
| Avg position | 17.21 | {Z} | {±N} |
| Sessions / week | 496 | {S} | {±N%} |
| Engagement rate | 55.8% | {E}% | {±N pp} |

## Performance This Week
- Clicks: {X} ({±N%} WoW)
- Impressions: {Y} ({±N%} WoW)
- CTR: {Z}% ({±N pp} WoW)
- Avg Position: {P} ({±N} WoW)
- Sessions: {S} ({±N%} WoW)
- New keywords ranking: {K}

## Winners
{Bullet list — top 5 queries with biggest clicks gain, old → new position}

## Losers
{Bullet list — top 5 queries with biggest clicks drop, old → new position}

## Tracked Keyword Movement
- In top 3: {N} ({+/-N WoW})
- In top 10: {N} ({+/-N WoW})
- In top 20: {N} ({+/-N WoW})

## Opportunities
{3-5 keyword groups with impressions but low CTR / position 5-15}

## Audit Findings
{Severity-grouped issues. Critical, Warnings, Info — each with affected URL + fix.}

## Content Strategy
{5 prioritized recommendations}

## Next Steps
{3 actions ranked by impact}

---
*Branded PDF attached. Dashboard runs locally on your Mac — `npm run weekly` rebuilds it with this snapshot. Reply to cancel or change cadence.*
```

Attach the branded PDF if Step 11 succeeded.

---

## Failure handling
If GSC or GA4 fails: skip that section, fill `null` in the snapshot, note "DATA SOURCE: {source} failed — {error}" in `summary.notes`. Continue.
If DataForSEO fails on a single keyword: skip that keyword. If it fails on >50% of keywords: skip Step 3 entirely, note in summary.
If GitHub commit fails: save the snapshot locally and tell Daniel in the email how to manually pull it.

Partial reports are better than no report. Always send the email even if some sources failed.

## Tone
Confident, analytical, specific. You are a senior SEO strategist briefing a client. Use exact numbers and call out trends clearly. The client cares most about: (1) is the redesign working? (2) what should I fix this week?
