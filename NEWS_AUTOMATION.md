# News Automation System

This project now includes an automated News system for Cowinmagnet South Africa.

## What It Does

- Checks the daily published News count.
- Targets `NEWS_DAILY_TARGET=4` published articles per natural day.
- Collects public RSS news from configured sources.
- Keeps only source articles with a verified original publication time inside `NEWS_LOOKBACK_HOURS=72`.
- Deduplicates source URLs, canonical URLs, normalized titles, content hashes and event fingerprints within `NEWS_DEDUP_DAYS=7`.
- Scores each candidate against the real product catalog in `data/products/products.json`.
- Publishes only candidates that pass the configured relevance threshold.
- Stores source metadata, product relationships, SEO/GEO fields, source fingerprints, jobs and daily audits.
- Exposes public News list/detail pages, RSS feed, API endpoints and sitemap entries.

## Storage and Migration Notes

The current regional site is a JSON-backed static/Next hybrid project. No production database credentials are configured in `.env.example`.

Current storage:

- `data/articles/articles.json`
- `data/news/news-sources.json`
- `data/news/news-jobs.json`
- `data/news/news-publication-audits.json`

Future database migration should map these JSON objects to the requested entities:

- `news_articles`
- `news_products`
- `news_sources`
- `news_jobs`
- `news_publication_audits`

Required indexes for a relational migration:

- `news_articles(status)`
- `news_articles(published_at)`
- `news_articles(source_published_at)`
- `news_articles(canonical_source_url)`
- `news_articles(source_fingerprint)`
- `news_articles(event_fingerprint)`
- `news_articles(slug unique)`

## Environment Variables

```text
NEWS_DAILY_TARGET=4
NEWS_TIMEZONE=Africa/Johannesburg
NEWS_MAX_RETRIES=3
NEWS_LOOKBACK_HOURS=72
NEWS_DEDUP_DAYS=7
NEWS_RELEVANCE_THRESHOLD=0.18
NEWS_AUTO_PUBLISH=true
NEWS_ALLOWED_LANGUAGES=en
NEWS_SOURCE_WHITELIST=
NEWS_SOURCE_BLACKLIST=
NEWS_ALERT_EMAIL=
AI_PROVIDER_API_KEY=
NEWS_API_KEY=
CRON_SECRET=
NEWS_CRON_SECRET=
```

`AI_PROVIDER_API_KEY` and `NEWS_API_KEY` are optional placeholders. Without them, the system uses source summaries plus a deterministic Cowin Magnet analysis template and does not invent facts.

## Routes

Public:

- `GET /en-za/news/`
- `GET /en-za/news/[slug]/`
- `GET /en-za/news/feed.xml`
- `GET /api/news`
- `GET /api/news/[slug]`
- `GET /api/news/categories`
- `GET /api/products/[productId-or-slug]/news`

Admin:

- `GET /api/admin/news`
- `GET /api/admin/news/state`
- `GET /api/admin/news/sources`
- `PUT /api/admin/news/sources`
- `POST /api/admin/news/collect`
- `POST /api/admin/news/generate`
- `POST /api/admin/news/publish`
- `POST /api/admin/news/retry`
- `GET /api/admin/news/jobs`
- `GET /api/admin/news/audits`

Cron:

- `POST /api/cron/news`

## Cron Deployment

`vercel.json` runs the News cron every 3 hours:

```json
{
  "path": "/api/cron/news",
  "schedule": "0 */3 * * *"
}
```

If `CRON_SECRET` or `NEWS_CRON_SECRET` is set, send it as either:

```text
Authorization: Bearer <secret>
```

or:

```text
X-Cron-Secret: <secret>
```

## Source Configuration

Edit:

```text
data/news/news-sources.json
```

Each source supports:

- `id`
- `domain`
- `publisher_name`
- `source_type`
- `rss_url`
- `language`
- `country`
- `credibility_score`
- `enabled`
- `allowed_for_auto_publish`

Only public RSS feeds are used by default. The fetcher does not bypass login, paywalls, CAPTCHA or access restrictions.

## Local Run

Use the configured Node runtime or the project scripts:

```powershell
npm run test:news
npm run build
```

Manual automation run after signing in as admin:

```text
/admin/ -> News Management -> Run Publish Task
```

Direct cron-style run:

```powershell
Invoke-WebRequest -Method POST http://localhost:8090/api/cron/news
```

## Acceptance Checklist

- News list page exists.
- News detail pages exist.
- RSS feed exists.
- Sitemap includes published News URLs.
- Each generated News item stores source URL, canonical source URL, original publication time, fetched time and source publisher.
- 72-hour recency check is enforced.
- 7-day source/event deduplication is enforced.
- Product relevance scoring is enforced.
- Each published article links to at least one real product when it passes automation.
- Jobs and daily audits are recorded.
- Admin can collect candidates and run publish tasks.
- Generated articles avoid copying original full text and separate facts from Cowin Magnet analysis.

## Known Limits

- Current implementation uses project JSON files because production database credentials are not configured.
- Source coverage is limited to configured RSS feeds until more whitelisted sources or a licensed news API is added.
- Without an AI provider key, content generation uses a conservative deterministic template instead of LLM rewriting.
- External source availability can affect daily completion; failures are recorded in jobs and audits.
