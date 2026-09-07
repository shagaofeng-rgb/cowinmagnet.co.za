# Google Search Console indexing recovery

## Confirmed fault

`trailingSlash` is enabled for the site, while the two Vercel Cron paths previously omitted their final `/`. Each scheduled request therefore received an HTTP 308 before reaching the protected handler. Vercel Cron does not follow redirects, so sitemap submission, Search Console analytics sync, and URL Inspection never ran.

## Recovery changes

- Cron paths now target `/api/cron/google-seo/` and `/api/cron/gsc-inspection/` directly.
- Both jobs run daily (02:00 and 02:20 UTC), and inspection defaults to 24 URLs per batch.
- A full URL Inspection pass now completes in roughly eight days for the current 180-URL sitemap.
- Cron success and failure events include phase, duration, sitemap-submission status, and safe summary metrics.
- A Search Console sync error now returns HTTP 500 instead of a false successful result.

## Validation before deployment

- Cron configuration test: passed.
- Sitemap and Google API unit tests: passed (13 tests).
- Next.js production build: passed.
- Production API audit: passed (12 checks).

## Production verification required after the next scheduled run

1. Confirm the two Vercel Cron entries show direct 2xx invocations instead of 308 redirects.
2. Confirm the `google_seo_cron_completed` event includes `sitemapSubmitted: true`.
3. Confirm the service account can access the configured Search Console property and that the property matches the canonical production site.
4. Review the first URL Inspection batch and Page Indexing coverage reasons in Search Console.

No normal product or news URL is sent to the Google Indexing API; that API is restricted to eligible job-posting and livestream pages.
