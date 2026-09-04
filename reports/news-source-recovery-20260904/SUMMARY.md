# News auto-publishing recovery — 2026-09-04

## Root cause

- GitHub Actions and Vercel had not stopped. Four scheduled runs between 2 and 4 September completed and recorded `skipped_no_qualified_source`.
- Each blocked run had 12 usable candidates but only one independent hostname. The two-source quality gate correctly prevented publication.
- The official Government of South Africa mining feed contained a relevant 18 August chrome-mine inspection item, but the old title-only relevance list did not recognise `chrome`, `tailings`, `ore` and related mining vocabulary.
- Upstream government and industry sites can also fail transiently during TLS/HTTP fetching. The old single-attempt implementation silently discarded those sources, making one publisher a hidden single point of failure.

## Corrections

- Kept `minIndependentSources: 2`; no editorial or evidence threshold was reduced.
- Added source-aware mining context and a broader, bounded mining/material-handling vocabulary.
- Added one retry for transient source failures.
- Added official Statistics South Africa and Eskom RSS discovery to diversify the primary-source pool.
- Added per-source health diagnostics to every ingest run so failures and item counts are visible in the automation record.
- Extended news-angle classification to use the verified source context.
- Added automated regression coverage for chrome/tailings recognition, retry recovery, independent-host diversity, and official statistics/utility parsing.

## Local verification

- News tests: 18/18 passed.
- Live ingest: 14 relevant items discovered, 11 new candidates added, 25 available candidates.
- Source health: 6/7 source endpoints succeeded; Mining Weekly returned HTTP 403 and is no longer required for diversity.
- Forced publication dry run: passed with 1,055 words, two independent primary sources, title similarity 0 and body similarity 0.21.
- Candidate article sources: Eskom and Statistics South Africa.
- Next.js optimized production build: passed.
- Sitemap tests: 12/12 passed.
- Static links: 188 pages, 15,060 links, zero broken links.
- Structured data: 94 files, zero invalid items or parse errors.
- Image audit: 100 unique assets, no missing references.
- Language audit: 1,138 HTML files, zero placeholders or mojibake; no product text corrections required.
- API/security: 8/8 targeted checks passed, including admin/cron authentication, enquiry validation, public News/Blog APIs, and private repository paths.
- Browser matrix: 7 page types at 390, 768 and 1,440 px (21 combinations), all returned 200 with one H1, zero horizontal overflow, zero broken images, zero missing alt attributes and zero page exceptions. The expected local `/api/track` 503 is caused by intentionally unavailable local database credentials and must be rechecked in production.

## Release and production verification

- Recovery commit: `46c9b8913c45beca3614dff26cf52fe6896e8ec5`.
- GitHub Actions run 50 completed successfully. Discovery, generation, quality checks, News tests, production build, health check and delivery verification all passed.
- Automatic article commit: `14368bc563b99c46da62307225681c4443fd00bc`.
- Published article: `New-phase R60bn capex programme announced by Impala Platinum: Material-Handling Decisions for Conveyor Protection`.
- Published at: `2026-09-04T09:10:52.595Z`.
- Production QA: 1,053 words, two sources on two independent hosts, title similarity 0.1, body similarity 0.306, zero quality-gate failures.
- Only the verified local COWIN product image is used as cover media.
- Vercel article deployment: `dpl_CRRgXZEiLHpKbiYf6EHLhjR4hoeo`, READY and assigned to `cowinmagnet.co.za` and `www.cowinmagnet.co.za`.
- Delivery verification commit: `1e44f45299e01f01641564239c9aaa442f915ae5`.
- News list, article detail, News sitemap and RSS feed all returned HTTP 200 and contained the new slug.
- Production runtime errors for the article deployment: zero.

## Rollback

- Pre-change commit: `739eaef5a05127bd8d845548856671a877b0862f`
- Backup branch: `codex/backup-news-source-pool-20260904`
