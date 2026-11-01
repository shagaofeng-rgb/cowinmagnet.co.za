# South Africa indexing remediation — 2026-11-01

Scope: only `shagaofeng-rgb/cowinmagnet.co.za` and Vercel project `cowinmagnet.co.za`.

## Evidence and denominator

GSC Page Indexing report updated 2026-10-23, read 2026-11-01: indexed 115; excluded 109. These are classifications, not 109 confirmed defects. Breakdown: crawled/not indexed 62, 404 10, discovered/not indexed 24, redirects 6, canonical alternatives 3, noindex 4. Failed validation for crawled and 404 began 2026-08-13 and failed 2026-09-05. Crawled validation shows 27 pending and 35 failed; 404 validation shows 8 pending and 2 failed.

`gsc-export.json` contains all 62 affected URLs and their GSC last-crawl dates (raw UI cell content retained). Templates: products 40 (35 detail + 5 hub), industries 8, news 6 (including RSS), markets 4, technical support 1, solution 1, about 1, blog 1.

`stored-inspection.json` is a read-only export of the site's rolling inspection record, last updated 2026-10-26, cycle started 2026-09-08. Its 147 indexed/14 crawled-not-indexed counts do NOT supersede the Page Indexing report; individual results have different inspection ages. Four historical noindex URLs are cookie-policy, downloads, privacy-policy and terms-and-conditions. Current public checks return 200 and no HTTP noindex. Their GSC last crawls are in July, so they remain waiting for recrawl; no indexability change was made to these pages.

Browser access recovered after repeated timeouts. `gsc-extra.json` now contains the remaining 37 live UI rows: discovered 24, redirects 6, canonical alternatives 3, noindex 4. Together with the 62-row export and the 10 observed 404 rows, all 109 exclusions are represented in the disposition table. The 6 redirects all lead to 200 targets (root default-language normalization and 5 historical product-category corrections). The 3 canonical alternatives are product-prefill query URLs for the quote form and correctly canonicalize to the unparameterized quote form. These 9 exclusions are intentional. The 4 noindex UI rows match the stored inspection paths; live HTTP checks show no HTTP noindex and they await recrawl.

## Confirmed findings and changes

- Current sitemap: 191 unique URLs, all 200/self-canonical, no noindex or redirect. Additional linked pages outside the sitemap had no 404 in the crawl. Baseline results: `public-pages.json`, `links-outside-sitemap.json`.
- 171 sitemap pages used an unrelated global homepage as x-default. Runtime normalization now points x-default at that page's South Africa canonical; en-ZA/self-canonical remains unchanged. Other sites were read only for comparison.
- Regional product guidance now distinguishes wet processing, filters, lifting/hazardous-area and conveyor duties. It adds South Africa project inputs and links within the existing overview tab. It makes no new local inventory, installation, certification or performance claims.
- Selected affected industry, region, support, category and crusher-protection templates now provide distinct project requirements and relevant technical/product links. No existing content was deleted and News automation remains disabled.
- The explicit `/en-za/404/` document now returns HTTP 404/noindex instead of 200. Genuine nonexistent article paths continue returning 404.
- All 10 URLs in the GSC 404 category have no current article record and no sitemap entry; keep real 404. Five other deleted news URLs appear in the historical crawled category and receive the same disposition. RSS is intentionally not an index landing page. No unrelated homepage redirects were added.

## Cross-site comparison

`cross-site-comparison.json`: 35 affected product details compared with the verified global source URL and the matching Chile English path (70 attempts). All 35 global URLs and 26 Chile URLs returned 200; 9 Chile counterparts were unavailable. Word-set Jaccard overlap: global 0.424–0.524, Chile 0.258–0.305. This indicates shared terminology and product families, not proof of exact duplication or the reason Google withheld indexing. Regional technical context was improved without changing verified product specifications.

## Deliverables and acceptance

`url-dispositions.csv` / `.json`: URL, source, last crawl, template, HTTP status, sitemap inclusion and disposition. “已修复” means a code/content repair; it does not mean Google has reindexed the URL. “等待重抓” is a pending Google outcome. Missing evidence is explicitly identified above.

Local checks: direct route checks for product, industry and explicit 404 status passed; 13 sitemap/Google API/weekly cron tests passed. Build and production acceptance are recorded in `release.json` after deployment.

GSC crawled-not-indexed validation was restarted after production acceptance: Validation Started, 2026-11-01; Pending 62, Failed 0. This is not an indexing success. Existing discovered/noindex validation remains in progress. The 404 validation outcome is recorded in release.json. Intentional deleted articles remain legitimate 404 and must not be described as restored or as a passed Google validation.

Final disposition totals for 109 URLs: 60 code/content repairs awaiting Google's reassessment, 24 waiting for recrawl, 25 intentionally excluded (15 deleted news, 1 RSS feed, 6 redirects and 3 quote-form canonical alternatives). Every row identifies its evidence source and GSC last-crawl date; N/A means Google has not reported a crawl. No missing crawl dates are invented.

Rollback: Git tag `backup/indexing-20261101-before-fix`; revert the route/helper change and redeploy this South Africa project. Production database was read only; no customer or article data was changed.
