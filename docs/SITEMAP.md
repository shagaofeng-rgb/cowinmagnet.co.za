# Sitemap and Google Search Console

## Architecture

The production site exposes a live sitemap index at `https://cowinmagnet.co.za/sitemap.xml`. It is generated from the current product, category, News, Blog, and public-page data and links to UTF-8 XML files under `/sitemaps/`:

- `pages-N.xml`
- `products-N.xml`
- `categories-N.xml`
- `posts-N.xml`

Only published, public, self-canonical, crawlable routes are included. Admin/API/search/404 routes, drafts, deleted records, `noindex` pages, and non-self-canonical URLs are excluded. Product, category, and article dates come from their real update fields. Static page dates are stored in `data/seo/static-page-dates.json` and only change when the page content hash changes.

Each sitemap is split before 50,000 URLs or 50 MB. The public routes build XML from structured records, so a failed file write cannot corrupt production output. The manual command writes validated XML to `.generated-sitemaps/` using temporary files and atomic rename, while preserving `.bak` copies of prior output.

## Public URLs

- Sitemap index: `https://cowinmagnet.co.za/sitemap.xml`
- Robots: `https://cowinmagnet.co.za/robots.txt`
- Example child sitemap: `https://cowinmagnet.co.za/sitemaps/products-1.xml`

## Manual command

```bash
npm run sitemap:generate -- --force --verbose
npm run sitemap:generate -- --dry-run --verbose
npm run sitemap:generate -- --force --submit --verbose
```

`--force` records a new full audit, `--dry-run` performs checks without writes, `--submit` requests Search Console submission, and `--verbose` prints detailed output. The authenticated admin API also supports `GET/POST /api/admin/sitemap`; no unauthenticated rebuild endpoint exists.

## Scheduled execution

Vercel runs `/api/cron/google-seo` daily at `02:00 UTC`. That existing job first checks and records Sitemap consistency, then optionally submits the sitemap and synchronizes Search Console analytics. News remains on its existing three-hour job. Do not add a second scheduler.

Required production secret:

```env
CRON_SECRET=<random-long-secret>
```

Vercel sends it as `Authorization: Bearer <CRON_SECRET>`. Production Cron routes fail closed when the secret is missing.

## Search Console configuration

```env
GOOGLE_SEARCH_CONSOLE_ENABLED=true
GOOGLE_SEARCH_CONSOLE_SITE_URL=sc-domain:cowinmagnet.co.za
GOOGLE_SEARCH_CONSOLE_SITEMAP_URL=https://cowinmagnet.co.za/sitemap.xml
GOOGLE_SERVICE_ACCOUNT_JSON=<encrypted-service-account-json>
```

Enable the Google Search Console API in the Google Cloud project. Add the service-account email as an owner or full user of the matching Search Console property. Credentials must remain in encrypted environment variables and must never be committed or logged.

Submission uses the official Search Console Sitemaps API with the `https://www.googleapis.com/auth/webmasters` scope and a `PUT` request. The discontinued Google sitemap ping endpoint is not used. The Indexing API is not used because ordinary company, product, News, and Blog pages are not eligible for it.

## Logs and tests

Production records are stored through the existing PostgreSQL-backed JSON document store:

- `data/seo/sitemap-state.json`
- `data/seo/sitemap-manifest.json`
- `data/seo/sitemap-runs.json`

Each run records timing, trigger, URL/file counts, bytes, added/modified/deleted URLs, split state, and sanitized Search Console results.

```bash
npm run test:sitemap
npm run test:news
npm run build
```

## Troubleshooting

- `sitemap.xml` returns 404/503: inspect deployment logs and confirm packaged static page/data files exist.
- Invalid XML: run `npm run test:sitemap` and `npm run sitemap:generate -- --dry-run --verbose`.
- Robots has no declaration: confirm `https://cowinmagnet.co.za/robots.txt` contains the absolute sitemap URL.
- Search Console returns 403: verify the service-account email has access to the exact property value, including `sc-domain:` versus URL-prefix format.
- Submitted but not indexed: submission only helps Google discover URLs. Successful submission does not prove crawling; crawling does not guarantee indexing. Confirm final status in Google Search Console.

Official references:

- https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap
- https://developers.google.com/crawling/docs/robots-txt/robots-txt-spec
- https://developers.google.com/webmaster-tools/v1/sitemaps/submit
