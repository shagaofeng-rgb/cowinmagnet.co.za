# Full-stack Audit and Repair Report

Generated: 2026-08-09

## Scope and safeguards

- Audited public routes, static pages, shared client scripts, dynamic API routes, data routing, configuration, sitemap/schema tooling and Vercel deployment metadata.
- Backups created before edits in `.audit-backups/20260809-fullstack-audit/` for the enquiry client/API route, data route, product data and SVG asset.
- The News automatic publishing workflow, cron schedule, generation logic, database model and administration controls were not changed.

## Confirmed normal

| Area | Evidence | Result |
| --- | --- | --- |
| Production build and built-in TypeScript check | `next build` | Passed |
| Sitemap regression suite | `node --test tools/sitemap-test.mjs` | 12 passed, 0 failed |
| Structured data | `node tools/structured-data-audit.mjs` | 95 files scanned; 0 invalid items |
| Static internal links | `node tools/static-link-audit.mjs` | 189 pages; 15,145 links; 0 broken |
| Route normalization | Local `GET /en-za` | One `308` to `/en-za/` |
| Responsive page checks | CDP checks on home, product hub, RCYD detail, News, Contact, Quote and 404 | No overflow, non-lazy broken images or runtime errors |
| Navigation interaction | `node tools/cdp-navigation-check.mjs http://localhost:8102/en-za/` | Mobile and desktop Products link/menu open/close checks passed |
| Vercel deployment state | Vercel deployment `dpl_9KN4KeGeRmguUDN1YmEdYwrTDrMQ` | READY before this audit patch |

## Fixed

### High: private operational data exposed by public data route

- **Problem:** `/data/seo/...`, `/data/news-automation/...` and `/data/backups/...` were publicly downloadable even though CMS data was blocked.
- **Fix:** `app/data/[...path]/route.js` now allowlists only `search-index.json`, the only public file referenced by the site client.
- **Verification:** Search index returns `200`; CMS enquiries, SEO data, news automation config and backups return `404` from a fresh production-mode local instance.

### High: form failure could be mistaken for a synchronized enquiry

- **Problem:** the Quote form stored a failed request in browser local storage and reported that it was retained for retry. This was neither a CRM/database record nor an automatic retry.
- **Fix:** `assets/site.js` preserves completed fields on screen and gives an explicit unsent/retry/WhatsApp message. `app/api/[...path]/route.js` now validates request shape, bounds scalar fields, adds a short request-rate guard, refuses Vercel temporary storage, and re-reads the saved enquiry before returning success.
- **Verification:** With `VERCEL=1` and no database, a valid test payload returned `503` with a clear storage-unavailable message; invalid content returned `400`. No local record was created in that production-mode test.

### Medium: product terminology consistency

- **Problem:** 67 product records had avoidable title-case, hyphenation or terminology inconsistencies.
- **Fix:** Applied the existing language-quality audit's deterministic corrections and regenerated all 88 South Africa product detail pages.
- **Verification:** `reports/language-quality-audit.json` records 67 corrected products; the product detail mobile check passed with one H1, no horizontal overflow and no broken non-lazy images.

### Low: historic test wording in a public SVG

- **Problem:** `assets/hero-mining.svg` included the phrase `local prototype` in its public description.
- **Fix:** Replaced it with an accurate accessibility description.

## Language and content findings

- The only verified public translation in `data/translations/locales.json` is `en-za`.
- Regional legacy routes exist but serve English technical fallback and are marked noindex by the dynamic route. They were not represented as completed translations, and no product facts were translated or invented.
- No public encoding-corruption or internal editorial metadata findings were reported by the language audit across 1,139 HTML files. The remaining development-style search empty-state heading was replaced with reader-facing wording in the final hardening pass.

## Final hardening pass: 2026-08-09

- Added a second deny-by-default safeguard to `app/[[...path]]/route.js`. The dedicated `app/data/[...path]` route remains the primary allowlist, while the static catch-all now also denies internal data, source, report, backup, build and deployment/configuration paths. `/data/search-index.json` remains the only intentionally public data file.
- Production-mode local HTTP verification: `/en-za/`, `/en-za/search/` and `/data/search-index.json` returned `200`; `/data/cms/enquiries.json`, `/data/seo/google-search-console.json`, `/package.json` and the server log path returned `404` with `X-Robots-Tag: noindex, nofollow`.
- UI regression checks passed for the home page at 1440px and 390px, products at 390px, an RCYD product page at 390px, News at 1440px and Contact at 390px: no horizontal overflow, broken images or captured runtime errors.
- Products navigation regression passed on desktop and mobile: the text link targets `/en-za/products/`, while the independent menu control opens and closes correctly.
- `npm run test:sitemap`: 12 passed, 0 failed. `npm run build`: passed, including Next.js TypeScript validation.

## Known limits and follow-up

- No `lint` or standalone `typecheck` script is defined in `package.json`; Next's production build performed its built-in TypeScript check successfully.
- Local environment does not contain a `DATABASE_URL`, and Vercel environment-variable values are not exposed through the available connector. A real production enquiry/database/admin three-way verification therefore cannot be claimed. The new guard prevents false success if production persistence is absent. Before accepting production form traffic, confirm `DATABASE_URL` is set for Production and perform one controlled enquiry followed by an authenticated admin readback.
- Vercel reported one historical `/api/[...path]` timeout on 2026-08-08 from an older deployment. There were no serverless error/fatal logs in the audited 24-hour window. The News workflow was not altered in response to that historical event.

## Changed files

- `app/api/[...path]/route.js`
- `app/data/[...path]/route.js`
- `assets/site.js`
- `assets/hero-mining.svg`
- `data/products/products.json` and 88 regenerated English South Africa product pages
- `.env.example`
- `README.md`
- `tools/cdp-navigation-check.mjs`

## Production verification after deployment

- Deployment `dpl_DAS5EbiCqtugHaKQxwuuWnt4Gr4n` for commit `5a6ef9fe` reached `READY`.
- `https://cowinmagnet.co.za/en-za/`, `/en-za/products/`, `/en-za/news/`, `/en-za/contact/` and `/en-za/request-a-quote/` each returned `200`.
- `https://cowinmagnet.co.za/en-za` returned one `308` redirect to `/en-za/`.
- `/data/search-index.json` remained public (`200`); the tested SEO, News automation and backup paths returned `404`.
- Vercel reported no error or fatal serverless logs for this deployment during the post-deploy check.

## Screenshots and browser evidence

- `home-1440.png`, `home-390.png`, `products-390.png`, `product-390-final.png`, `news-1280-final.png`, `contact-390.png`, `quote-390-final.png`, and `not-found-390.png` are stored beside this report.
