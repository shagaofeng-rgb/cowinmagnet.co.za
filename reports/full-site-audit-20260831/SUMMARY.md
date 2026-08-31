# Cowinmagnet full-site audit — 2026-08-31

## Scope

Frontend and responsive layout, backend/API access controls, enquiry handling, database-backed News/Blog visibility, product synchronization, language policy, images, accessibility, SEO/schema/sitemaps/RSS, automation health, build and deployment readiness.

## Rollback baseline

- Git baseline: `d809dc19eda7ebd6f65cc55757a6cbed5e65f6ce`
- Backup branch: `codex/backup-full-site-audit-20260831`
- Vercel baseline deployment: `dpl_79nh412bgQFLPL4gmNDyKe6j9JUh`
- Local content/data archive was created before modification.

## Baseline production findings

- One duplicate DCZ product record and route, plus an incorrect redirect masking a valid seven-product category.
- One mobile product-list call-to-action exceeded the 390 px viewport.
- Three broken legacy Blog image URLs sourced from a database-only article.
- One duplicate title group and three duplicate description groups in the production sitemap crawl.
- Large source images, including a 676 KB logo delivered on every page.
- Runtime audit contained stale preproduction/news-block wording and a zero-value configuration bug.
- Security headers and a keyboard skip link were incomplete.

The machine-readable baseline is retained in `baseline-production-site-audit.json` and `baseline-production-api-audit.json`.

## Implemented corrections

- Consolidated the duplicate product into one canonical record, added permanent redirects for all locale paths, removed the bad category redirect, and hardened future product sync against the alias returning.
- Corrected the mobile CTA width and verified 390, 768 and 1440 px layouts on Home, Products, Product, Industry, News and Quote pages.
- Normalized legacy Blog media paths at render time so database-held content uses existing local assets.
- Added unique technical-support descriptions and unique fallbacks for older News metadata.
- Added global `nosniff`, `SAMEORIGIN`, strict referrer and restricted permissions headers.
- Added a visible-on-focus skip link and a stable main-content target.
- Converted ten large guidance PNGs to WebP, removed six redundant PNG originals, reduced the logo from 676 KB to 17 KB, and updated remaining legacy-locale image references. The image directory is approximately 15 MB with no file above 1 MB and no missing static image reference.
- Corrected runtime audit semantics while retaining the policy that unknown supplier specifications are not invented.

## Candidate verification

- Optimized production build: pass.
- Sitemap tests: 12/12 pass.
- News automation and publication tests: 15/15 pass.
- News health: healthy; latest article current; 14 candidates; zero consecutive blocks.
- Local sitemap crawl: 177 pages; zero page, image, duplicate-title or duplicate-description failures.
- Static link audit: 188 pages and 15,060 links; zero broken.
- Structured data: 94 files; zero invalid items, parse errors or missing WebPage schemas.
- Product pages: 87 products; zero QA failures, zero content leaks, 87 Product schemas.
- Product source sync: 87/87 supplier URLs returned successfully; zero consistency failures.
- API/security checks: 12/12 pass locally and on the baseline production deployment.
- Language audit: 1,138 public HTML files; zero placeholders or mojibake. Only verified English is selectable; legacy regional URLs remain English and noindex until human-approved translations exist.
- Responsive/browser checks: one H1, no eager broken images, no runtime exceptions and no horizontal overflow on the tested matrix.
- Mobile lab transfer snapshots after optimization: Home 980 KB, Products 582 KB, representative Product 135 KB, News 260 KB, Quote 122 KB. These are lab snapshots, not field Core Web Vitals.

## Deliberate constraints

- The 751 unconfirmed supplier fields remain marked unavailable/request-confirmation; they are not defects and were not fabricated.
- Local database credentials are intentionally unavailable. Production database visibility was verified through the public APIs and a database-only Blog record; production runtime error logs were empty before release.
- No persistent test enquiry was created because a non-persistent rejected-payload test covered validation without leaving data that required privileged cleanup.
