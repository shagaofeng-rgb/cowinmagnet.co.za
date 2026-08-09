# Product UX and Image Remediation Report

Generated: 2026-08-09

## Scope and Safety

This change preserves the existing `/en-za/` language prefix, product slugs, quote endpoints, product records, canonical URLs and real product media. No enquiry was submitted during testing.

## Navigation Fix

### Root cause

The previous header rendered `Products` and `Industries` as single JavaScript buttons. A user could only open a mega menu; there was no independent, semantic link to the product or industry overview. The static page copies also carried a legacy image-heavy mega menu on every page.

### Implementation

- `assets/site.js` now renders a real Products link to `/en-za/products/` and a separate chevron button for `#mega-products`. Industries follows the same pattern.
- Mobile navigation now has a direct Products/Industries link plus independent disclosure buttons with `aria-expanded` and `aria-controls`.
- Escape and backdrop close menus, restore focus to the trigger when appropriate, and mobile opening moves focus into the panel.
- `tools/upgrade-en-za-navigation.mjs` updates all 189 English South Africa static pages and removes legacy mega-menu images from their source markup. The runtime menu is concise and contains only real category links, including `View All Products`.

## Product Discovery and Detail Layout

- `tools/render-product-discovery-pages.mjs` rebuilds the catalogue and five category pages from the real `data/products/products.json` records.
- The catalogue provides category discovery, keyword/category/type/cleaning/application filters, 88 real-product cards, product-level links and quote paths.
- Category pages use a category-specific process-context image, real product cards, industry/solution links and selection inputs.
- `tools/render-za-product-details.mjs` keeps real product images as the Hero. Because every current product record has one distinct real image, the new template displays a single Hero image and no fake thumbnail strip.
- Details add product-type-specific HTML process diagrams, a compact verified-specification table, one consolidated project-configuration row for unknown values, linked labels in the enquiry form, responsive two-column/one-column form layouts and existing hidden product/source/UTM fields.

## Image Audit and Remediation

- Before: 12,284 static image references across the repository; 96 unique paths.
- After: 11,362 static image references; 101 unique paths.
- The primary English South Africa site no longer ships repeated image-heavy legacy mega-menu images in every static page source.
- Five independent, WebP-compressed AI auxiliary images were added only for category/process context. They never replace a product photo and are not used as fake product galleries:
  - `mining-conveyor-tramp-iron-protection.webp`
  - `coal-wash-plant-wet-magnetic-separation.webp`
  - `recycling-eddy-current-metal-recovery.webp`
  - `process-pipeline-magnetic-filtration.webp`
  - `mineral-screening-control-environment.webp`
- Their prompt direction is recorded in `IMAGE_AUDIT_AFTER.md`. Images have specific English alt text and use lazy loading outside the relevant hero context.
- The remaining high repetition in the repository is explicitly listed in `IMAGE_AUDIT_AFTER.md`; it is mainly legacy translated static copies outside the active English South Africa route. They were not silently represented as resolved.

## Verification Evidence

### Static and data checks

| Check | Result |
| --- | --- |
| Product detail QA | 88 products; 0 failures |
| Product structured data audit | 95 files scanned; 0 invalid items; 0 parse errors |
| Static internal-link audit | 189 English South Africa pages; 17,038 checks; 0 broken links |
| Node syntax check | `assets/site.js` passed |
| Automated tests | 12 passed; 0 failed |
| Production build | Next.js 16.3.0 build completed successfully |

There are no configured `lint` or `typecheck` package scripts in this repository. The Next.js build ran its TypeScript validation successfully.

### Browser checks

Browser evidence is stored in `reports/visual-qa/product-ux-browser-test.json`.

| Width | Page tested | Viewport result |
| ---: | --- | --- |
| 320px | RCYD product detail | 320px scroll width; no horizontal overflow |
| 375px | Magnetic separation category | 375px scroll width; no horizontal overflow |
| 390px | DLS product detail | 390px scroll width; no horizontal overflow |
| 768px | Product catalogue | 768px scroll width; no horizontal overflow |
| 1024px | Components and filters category | 1024px scroll width; no horizontal overflow |
| 1280px | Product catalogue | 1265px content scroll width; no horizontal overflow |
| 1440px | Wet drum product detail | 1425px content scroll width; no horizontal overflow |

Interaction results:

- Products text navigated to `/en-za/products/`.
- Desktop chevron opened the product menu; Escape closed it and restored focus.
- Mobile Products link targeted `/en-za/products/`; its disclosure opened the category links; Escape closed the panel and removed the scroll lock.
- With the mobile panel open, a Tab key press from the last active item was prevented and returned focus to the first item.
- Filtering `wet drum` returned one product and clearing it restored all 88 cards.

Screenshots: `reports/visual-qa/product-detail-320-final.png` and `reports/visual-qa/products-1440-final.png`.

## Follow-up Media Needed

All 88 current products have a single distinct real product image in the existing data. The layout intentionally avoids duplicate thumbnails. To enable a genuine multi-image gallery, add approved alternate-angle, installation or detail photographs to each relevant product's `gallery` record; the existing renderer will then expose only those distinct assets.

## Main Files Changed

- `assets/site.js`
- `assets/site.css`
- `tools/upgrade-en-za-navigation.mjs`
- `tools/render-product-discovery-pages.mjs`
- `tools/render-za-product-details.mjs`
- `tools/qa-za-product-pages.mjs`
- `tools/image-audit.mjs`
- `tools/remediate-en-za-home-images.mjs`
- `IMAGE_AUDIT_BEFORE.md`
- `IMAGE_AUDIT_AFTER.md`
