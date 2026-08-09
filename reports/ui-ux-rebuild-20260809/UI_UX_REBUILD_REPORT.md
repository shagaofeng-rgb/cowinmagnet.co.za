# COWIN MAGNET South Africa UI/UX Rebuild Report

## Scope completed

- Repaired the `/en-za` locale canonicalization path without changing public product slugs.
- Established an industrial B2B visual system: mineral blue `#0B2545`, secondary blue `#123B5D`, orange quotation CTA `#E9822E`, warm white/grey surfaces, an Inter/Manrope-first font stack, a 1280px content system and responsive spacing.
- Rebuilt the primary navigation into Products, Industries, Solutions, Resources, About COWIN and Contact. Each major group now has a real destination link plus a separate accessible menu trigger.
- Replaced the product hub's single large model wall with four process-led families, a full-catalogue disclosure, real filters and a clear filter reset.
- Kept category and product detail URLs, truth-card data and enquiry handling intact while improving mobile specifications and quote-form workflow.
- Added shared static navigation to all 189 English South Africa pages so primary links still exist without JavaScript.
- Rebuilt the home, industries hub and solutions hub into focused procurement entry pages. The home emphasizes product families, industry process context, the selection workflow, selected real products and project enquiry.
- Added a three-step quote workflow on the request-a-quote page. It preserves the existing `/api/enquiries` submission path and saves form progress locally until a successful submit.

## Redirect repair

Root cause: framework-level trailing-slash behavior and the earlier dynamic static-file route did not agree on `/en-za`, resulting in a self-targeting `308`.

Repair:

- `next.config.mjs` disables competing automatic slash handling for this dynamic catch-all route.
- `proxy.js` produces the explicit slash destination for a non-file GET/HEAD request.
- `vercel.json` declares the production edge trailing-slash convention.

Local production-build result:

| Request | Result |
| --- | --- |
| `GET /en-za` | `308 Location: /en-za/` |
| `GET /en-za/` | `200` |

## Validation evidence

### Build and data checks

| Check | Result |
| --- | --- |
| Next.js production build | Passed with Next.js `16.3.0` |
| Sitemap unit tests | 12 passed, 0 failed |
| Product structured-data audit | 95 files scanned; 0 invalid items; 0 missing WebPage records |
| Static link audit | 189 pages; 15,145 links checked; 0 broken links |

### Browser-rendered checks

| Page | Viewport | H1 count | Horizontal overflow | Broken non-lazy images | Runtime exceptions |
| --- | ---: | ---: | --- | --- | --- |
| Home | 1440px | 1 | No | 0 | 0 |
| Home | 390px | 1 | No | 0 | 0 |
| Products hub | 320px | 1 | No | 0 | 0 |
| RCYD product detail | 390px | 1 | No | 0 | 0 |
| Request a Quote | 375px | 1 | No | 0 | 0 |
| Industries hub | 1024px | 1 | No | 0 | 0 |

After screenshots:

- `screenshots/home-1440-after.png`
- `screenshots/home-390-after.png`
- `screenshots/products-320-after.png`
- `screenshots/detail-390-after.png`
- `screenshots/quote-375-after.png`

## Main implementation files

- `assets/site.css`
- `assets/site.js`
- `next.config.mjs`
- `proxy.js`
- `vercel.json`
- `tools/render-en-za-shared-navigation.mjs`
- `tools/render-product-discovery-pages.mjs`
- `tools/render-ui-ux-core-pages.mjs`
- `tools/render-za-product-details.mjs`
- `tools/cdp-page-qa.mjs`

## Follow-up boundary

This change does not invent product parameters, South African offices, stock, local projects, certifications or customer evidence. Product and enquiry data remain the existing real records; configuration-specific claims remain subject to project confirmation.

