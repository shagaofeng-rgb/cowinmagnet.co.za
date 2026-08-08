# South Africa Site Audit and Implementation Report

Generated: 2026-08-08 (UTC)

## Confirmed and fixed

- The baseline inventory covers 94 rendered product pages and 88 product records. Product truth cards and missing-data lists were generated before content restructuring.
- Public editorial metadata leakage was removed. The visibility scan reports zero matches for internal SEO/CMS fields.
- Product pages now use family-specific specification fields. Product rich-result schema is intentionally omitted until verified commercial offer data exists; this avoids unsupported price, availability, review, and rating claims.
- 33 classification-route redirects and six stable product shortcuts now use single-hop permanent redirects to the corresponding canonical product pages.
- Static link audit: 186 pages and 16,348 internal links checked; 0 broken links.
- Structured-data audit: 94 product pages scanned; 0 invalid items, 0 parse errors, 0 missing WebPage items.
- The legacy scheduled News/Blog publisher is removed. The replacement News workflow is disabled by default and cannot publish until the quality gates pass.

## News automation state

- Schedule configured: `/api/cron/news-publish` at `0 8 */2 * *`.
- Production publishing requires `NEWS_AUTOPUBLISH_ENABLED=true`, `NEWS_AUTOPUBLISH_MODE=production`, six approved preproduction drafts, independent accessible sources, source freshness, ownership-safe media, duplicate checks, and a verified product truth card.
- Current state: blocked intentionally. No product truth cards are engineering-verified and no six-draft preproduction approval set exists. This is a safety hold, not a failed publish.
- The News cron and admin News automation endpoint both reject unauthenticated requests with HTTP 401.

## Production verification

- HTTP 200: `/en-za/`, `/en-za/news/`, `/en-za/blog/`, `/robots.txt`, `/sitemap.xml`.
- HTTP 308 then HTTP 200: the six product shortcut routes redirect to the canonical, rendered product pages.
- Public content scan of the home, News, Blog, and a product page found no `SEO Meta`, `Primary Keyword`, `AI Citation Ready Summary`, `AI-generated`, or no-results template text.
- Invalid root Webhook credential returns `code: 0`, confirming unauthenticated publish attempts are rejected.

## Reproducible checks

```text
node --test tools/news-automation-test.mjs tools/sitemap-test.mjs
node tools/structured-data-audit.mjs
node tools/static-link-audit.mjs
node node_modules/next/dist/bin/next build
```

Latest results: 14 automated tests passed; production build completed successfully.

## Evidence and operational files

- `reports/product-inventory-before.csv`
- `reports/missing-product-data.csv`
- `reports/product-truth-cards/`
- `reports/content-visibility-audit.csv`
- `reports/url-canonical-hreflang-audit.csv`
- `reports/redirect-map.csv`
- `reports/seo-audit-before.csv`
- `reports/schema-validation.json`
- `reports/internal-link-map.csv`
- `reports/runtime-audit.json`

## Not confirmed / requires real input

- Engineering must verify the 88 product truth cards before numeric performance, configuration options, cooling, motor, or magnetic-field claims can be published.
- Search Console index coverage, Core Web Vitals field data, and AI citation status cannot be confirmed without the relevant external console permissions; no ranking or indexing claim is made.
- The local production-environment snapshot does not contain `WEBHOOK_ARTICLE_SIGN`; therefore only the invalid-credential Webhook test was performed. Verify that Vercel Production has this variable and redeploy after any change before testing the valid no-write verification request.
- Mobile device/browser matrix and live server resource metrics were not run in this audit environment and remain verification items rather than completed claims.

## Backup and rollback

- Pre-change backups are stored locally under `.audit-backups/` and intentionally excluded from version control.
- Roll back application code by redeploying the prior Git commit. Do not restore a database snapshot without first checking current editorial and inquiry records.
