# CowinMagnet ZA News deployment audit

**Audited:** 2026-08-20  
**Scope:** `cowinmagnet.co.za` only; News discovery, publishing, front-end delivery verification and production deployment.

## Confirmed in production

- The scheduled discovery workflow runs every 12 hours and calls only `npm run news:ingest`; it does not call the publishing command.
- The publication workflow checks every 12 hours but the application enforces a 48-hour interval from the last published News article.
- News and Blog use distinct article types and routes. News output is written with `article_type: "news"` and published at `/en-za/news/[slug]/`.
- A publication is now recorded as `pending_frontend_verification` until the public News list, detail page and News sitemap pass HTTP checks. Only then may the run become `published_success`.
- Production deployment was built by Vercel after the changes. The public News list was checked at `https://cowinmagnet.co.za/en-za/news/` and returned HTTP 200 with the existing News entries.

## Fixed during this audit

1. **Unhelpful workflow failure for an exhausted candidate pool**
   - Root cause: the remaining unused candidates were from one hostname, while the quality gate correctly requires two independent source domains.
   - Fix: the publisher now records `skipped_no_qualified_source` with candidate counts and a reason. It does not manufacture an article, silently weaken the two-source rule, or treat a skip as a publish.
2. **Lost front-end delivery diagnostics**
   - Root cause: the verification workflow exited before its modified run record could be committed on a failed public check.
   - Fix: the workflow now commits the retryable delivery state first and only then marks the GitHub Actions job as failed.
3. **Insufficient source diversity**
   - Fix: discovery now also evaluates the Minerals Council South Africa public economic-report index, alongside the existing government, association and trade-media sources.

## Open requirement: supplied 300-source directory

The four intended source-catalog artefacts currently exist but are empty:

- `data/news/cowinmagnet-za-africa-sources.raw.md`
- `data/news/cowinmagnet-za-source-catalog.seed.json`
- `data/news/cowinmagnet-za-source-catalog.seed.csv`
- `data/news/cowinmagnet-za-source-normalization-report.md`

They must not be treated as a completed import. The existing normalizer is retained, but the supplied 300 rows still need to be written into the raw catalog, normalised, and then individually verified for access, robots policy, relevance and rights before becoming active. The live discovery set remains deliberately limited to public sources whose use is known and appropriate.

## Verification limits

Local shell execution in the current Windows environment is blocked by an operating-system CET compatibility failure, so no local `npm run lint`, `npm test`, or `npm run build` result is claimed in this audit. Vercel production builds completed successfully. The next GitHub Actions discovery/publish cycle is the required runtime verification for the new source parser.

## Rollback

Revert the three commits made on 2026-08-20 that change:
- `app/lib/news-automation.js`
- `.github/workflows/news-delivery-verification.yml`
- `app/lib/news-sources.js`

No database migration, data deletion or URL change was performed.
