# Cowinmagnet South Africa full-stack audit - 2026-08-11

## Scope and evidence

This report records checks made against the repository and public production
endpoints on 2026-08-11. It deliberately separates verified results from items
that require an authenticated database, Vercel, Google Search Console, or
administrator session. No production customer enquiry or unpublished content
was created during the audit.

## Production deployment evidence

- Commit: `0bb29573ce25fe6e5ba17716eb0c979d3756139d`
- Vercel production deployment: `dpl_37XWJfYFPSDW2SXSgzcXudZT4rgT`, state `READY`
- Vercel build log: `Build Completed in /vercel/output [5s]`; errors-only query
  contained no build error.
- Post-deployment HTTPS checks: home `1.094s`, products `0.765s`, Blog
  `0.719s`, Blog API `0.812s`, News API `0.594s`, sitemap `0.625s`, and
  robots `0.438s`; every checked URL returned HTTP 200.
- A safe unsigned root Webhook check returned HTTP 200 with
  `{"code":0,"msg":"Invalid secret"}`. Vercel recorded the expected
  `blog_webhook_rejected` structured event for that request, without logging a
  secret or body.
- Vercel runtime-error query for the 15 minutes following deployment returned
  no runtime errors.

## Confirmed working

| Area | Evidence | Result |
| --- | --- | --- |
| Production public routes | HTTPS requests to `/en-za/`, product hub, product category, product detail, `/en-za/news/`, `/en-za/blog/`, contact, quote, sitemap and robots all returned HTTP 200. | Public routes reachable. |
| Public content data | `GET /api/blog` returned a published Blog article that is not present in the repository snapshot; `GET /api/news` returned published source-backed News records. | Production reads persisted content rather than only the repository JSON snapshot. |
| Webhook entry point | An unsigned form POST to `/` returned `200 {"code":0,"msg":"Invalid secret"}`. | The required root POST forwarding and server-side secret check are active. |
| Sitemap and links | `node tools/static-link-audit.mjs` checked 15,145 local links across 189 pages, with 0 broken links. | No static link breakage found. |
| Tests | `node --test` ran sitemap, News automation, News-source, article-render safety and Blog publication tests: 21 passed, 0 failed. | Regression suite passed. |
| Build/type phase | Next.js 16.3.0 production build completed successfully. | Compilation and the framework TypeScript phase passed. |
| SEO schedule | `vercel.json` schedules `/api/cron/google-seo` at `0 2 */3 * *` and `/api/cron/gsc-inspection` at `30 2 */3 * *`. | Google sitemap/inspection tasks are configured every three days, not daily. |
| News schedule | `.github/workflows/news-autopublish.yml` runs daily at 08:00 UTC, while `data/news-automation/config.json` enforces `publishIntervalHours: 48`. | News discovery may run daily; publication is gated to one article per 48 hours. |

## Fixed in this change

| Severity | Issue and root cause | Repair | Verification |
| --- | --- | --- | --- |
| High | A Vercel runtime timeout had occurred in the GSC inspection route. The route attempted every sitemap URL in one invocation, which can exceed the 300-second serverless limit. | `app/api/[...path]/route.js` now inspects a rotating batch (default 12, maximum 24, concurrency 3), persists the next offset and merges results into the cumulative report. | Production build and 21-test suite pass. The implementation is bounded and logs batch size/offset on success. A live authenticated cron run still requires the protected cron secret. |
| High | A database write failure could fall back to ephemeral Vercel filesystem storage, yielding a false durable-success response for admin writes. | `writeJson` now fails closed on Vercel when database persistence is unavailable; local-file fallback remains limited to non-Vercel development. | Build and regression suite pass. |
| Medium | Blog Webhook operations did not emit structured, safe lifecycle records. | Added JSON logs for rejected, published and failed Blog webhook events without recording secrets, request body, or content. | Build and regression suite pass. |
| Low | The runtime-audit tool called the News workflow a Vercel cron even though production scheduling is GitHub Actions with its own 48-hour gate. | Corrected `tools/runtime-audit.mjs`; added the documented `GSC_INSPECTION_BATCH_SIZE` and `WEBHOOK_ARTICLE_SIGN` environment-variable placeholders to `.env.example`. | Configuration review completed. |

## Running program inventory

| Program | Trigger | Frequency | State verified from repository |
| --- | --- | --- | --- |
| Next.js public and API application | Vercel deployment | on deployment/request | Dynamic catch-all routes serve the public site and APIs. |
| Blog publisher Webhook | External custom-framework Webhook POST to `/`, forwarded to `/api/webhook/send_article` | external event | Signature check, duplicate hash guard, persisted read-back and sitemap audit scheduling are implemented. |
| News publishing workflow | GitHub Actions | daily trigger; internal 48-hour gate | `news-autopublish.yml` has concurrency protection; the News code limits retry count to 2. |
| Google sitemap submission and Search Console sync | Vercel Cron | every 3 days, 02:00 UTC | Authenticated by `CRON_SECRET`. |
| Google URL Inspection | Vercel Cron | every 3 days, 02:30 UTC | Authenticated by `CRON_SECRET`, now batched. |
| Sitemap audit | content mutation and Google cron | event-driven / every 3 days | Runs after content changes and on the SEO schedule. |

The repository does not name a vendor for the external Blog plugin. Its
available integration is correctly identified only as a custom-framework
Webhook. No OAuth client, vendor SDK, or second Blog scheduler was found.

## Data and API consistency

- Products, News and Blog share durable JSON-document persistence through
  `africa_json_documents` when `DATABASE_URL` is configured. Production public
  Blog data differs from the repository snapshot, which is evidence that the
  production database overlay is active.
- The Blog publisher writes an article, re-reads it under the data lock, and
  refuses success when the read-back fails. Hash-based idempotency prevents a
  retry of the same signed payload from creating another row.
- The public `/api/blog` and `/api/news` routes only expose published records;
  Sitemap generation applies the same publish/canonical filters.
- Public end-to-end reads were verified. Authenticated CRUD, three customer
  enquiries, private SEO records, indexes, and production database permissions
  could not be inspected because this session has no administrator cookie,
  production `DATABASE_URL`, cron secret, or Search Console credential.

## Items not asserted as normal

| Area | Why it was not fully verified | Safe next step |
| --- | --- | --- |
| Blog publisher valid-payload publication | The production webhook secret is intentionally unavailable to this session; no secret was copied from old screenshots or logs. | Trigger the plugin's built-in verification/publish after deployment, then inspect the safe `blog_webhook_*` runtime event and the article in Blog/admin. |
| Database schema, indexes, permissions and three-record four-way comparison | Public APIs cannot expose private CMS/enquiry rows, and local development has no `DATABASE_URL`. | Run `node tools/audit-article-publication.mjs` in a controlled environment with a read-only production database URL, then compare selected records in admin/API/public pages. |
| Google API response and next production cron execution | `CRON_SECRET` and Google service-account material are private. | Use Vercel Cron logs after the next run. The expected inspection log is `gsc_inspection_completed` with `inspectedThisRun <= 24`. |
| Slow query and queue metrics | The current data store is a JSONB document table and the session cannot access production database metrics. | Monitor PostgreSQL query statistics and Vercel function duration. Do not migrate the content model without a backup and migration plan. |
| Customer enquiry delivery | No real customer form was submitted, to avoid polluting production enquiries. | Use an approved internal test address and confirm the record, notification and UI status under an admin session. |

## Risks and rollback

- The JSON-document persistence model is simple and functioning for the public
  data observed, but it offers limited field-level indexing. Treat a future
  normalized migration as a planned project, not an emergency hotfix.
- The GSC batch default is intentionally conservative. If Vercel duration data
  supports it, increase `GSC_INSPECTION_BATCH_SIZE` gradually; do not exceed
  24 without observing runtime duration and API quota behaviour.
- Roll back this change with `git revert <deployment-commit>`, redeploy, and
  retain the existing database documents. This change makes no schema or data
  migration.

## Files changed by this audit

- `app/api/[...path]/route.js`
- `.env.example`
- `tools/runtime-audit.mjs`
- `reports/fullstack-audit-20260811.md`
