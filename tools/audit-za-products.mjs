import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { buildTruthCard, plainText, productKind } from "./product-detail-lib.mjs";

const root = process.cwd();
const products = JSON.parse((await readFile(join(root, "data/products/products.json"), "utf8")).replace(/^\uFEFF/, ""));
const redirects = JSON.parse((await readFile(join(root, "data/seo/legacy-product-redirects.json"), "utf8")).replace(/^\uFEFF/, ""));
const reportRoot = join(root, "reports", "za-products");
const truthRoot = join(reportRoot, "product-truth-cards");
await mkdir(truthRoot, { recursive: true });

function csv(rows) {
  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const cell = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  return [headers.map(cell).join(","), ...rows.map((row) => headers.map((key) => cell(row[key])).join(","))].join("\n") + "\n";
}

const leakedTerms = [/cnmagnetics\.com/i, /chnmag\.com/i, /seo meta/i, /primary keyword/i, /search intent/i, /ai[- ]generated/i, /cms checklist/i, /no matching products/i, /\uFFFD/];
const inventory = [];
const missing = [];
const leakAudit = [];
const schemaItems = [];

for (const product of products) {
  const truth = buildTruthCard(product);
  const pagePath = join(root, "en-za", "products", product.categorySlug, product.slug, "index.html");
  let page = "";
  try { page = await readFile(pagePath, "utf8"); } catch {}
  const sourceText = [product.name, product.shortDescription, JSON.stringify(product.sourceContent || {})].join(" ");
  const pageHits = leakedTerms.filter((term) => term.test(page)).map((term) => String(term));
  const sourceHits = leakedTerms.filter((term) => term.test(sourceText)).map((term) => String(term));
  const duplicateRoutes = redirects.filter((redirect) => redirect.destination === product.canonicalUrl).map((redirect) => redirect.source);
  inventory.push({
    name: product.name,
    series: truth.series,
    model: truth.model || "To be confirmed",
    currentProductUrl: product.canonicalUrl,
    productCategory: product.category,
    productType: truth.productType,
    magnetType: truth.magnetType,
    cleaningMode: truth.cleaningMode,
    availability: truth.status,
    verifiedSpecCount: Object.keys(truth.verifiedSpecs).length,
    pendingSpecCount: truth.pendingSpecs.length,
    imageCount: truth.mediaIds.length,
    imageRights: "COWIN product media supplied through the main-site product record",
    applications: truth.applications.join(" | "),
    selectionInputs: truth.selectionInputs.join(" | "),
    supplierConfirmed: truth.supplierConfirmed ? "yes" : "project confirmation required",
    sourceStatus: product.syncStatus || "unknown",
    duplicateLegacyRoutes: duplicateRoutes.join(" | ")
  });
  for (const field of truth.pendingSpecs) {
    missing.push({ slug: product.slug, product: product.name, productType: truth.productType, missingField: field, publicTreatment: "Available on request / To be confirmed by COWIN engineering", action: "Obtain supplier-approved model data before public numeric publication" });
  }
  leakAudit.push({ url: product.canonicalUrl, slug: product.slug, publicPageFound: page ? "yes" : "no", pageLeakHits: pageHits.join(" | ") || "none", productDataLeakHits: sourceHits.join(" | ") || "none", status: page && !pageHits.length && !sourceHits.length ? "pass" : "needs review" });
  schemaItems.push({ url: product.canonicalUrl, expectedProduct: true, expectedBreadcrumbList: true, currentPageFound: Boolean(page), currentContainsProduct: /"@type":"Product"|"@type":\s*"Product"/.test(page), currentContainsBreadcrumb: /BreadcrumbList/.test(page) });
  await writeFile(join(truthRoot, `${product.slug}.json`), JSON.stringify(truth, null, 2) + "\n");
}

const redirectMap = redirects.map((redirect) => ({ oldUrl: redirect.source, newUrl: redirect.destination, permanent: redirect.permanent ? "301" : "302", reason: redirect.reason || "" }));
const schemaSummary = {
  generatedAt: new Date().toISOString(),
  scope: "/en-za/products/** only",
  productCount: products.length,
  productPagesFound: schemaItems.filter((item) => item.currentPageFound).length,
  productSchemaPresent: schemaItems.filter((item) => item.currentContainsProduct).length,
  breadcrumbPresent: schemaItems.filter((item) => item.currentContainsBreadcrumb).length,
  items: schemaItems
};
const qa = `# South Africa Product-Page QA\n\nGenerated: ${new Date().toISOString()}\n\n## Scope\n- Product data, product URLs, product images, product schemas and product-detail pages only.\n- Non-product routes, navigation, footer, news, Blog, automation and analytics were not included.\n\n## Inventory\n- Products: ${products.length}\n- Categories: ${new Set(products.map((product) => product.categorySlug)).size}\n- Product images present in product records: ${products.filter((product) => product.gallery?.length).length}/${products.length}\n- Products with public numeric/confirmed specification fields: ${products.filter((product) => Object.keys(buildTruthCard(product).verifiedSpecs).length).length}\n- Pending specification records: ${missing.length}\n\n## Pre-Rebuild Findings\n- Product pages with public Product JSON-LD: ${schemaSummary.productSchemaPresent}/${products.length}\n- Product pages with BreadcrumbList: ${schemaSummary.breadcrumbPresent}/${products.length}\n- Leak-audit rows needing review: ${leakAudit.filter((row) => row.status !== "pass").length}\n\n## Publication Rule\nOnly verified public product fields are eligible for product-page output. Pending fields remain visible only as \`Available on request\` or \`To be confirmed by COWIN engineering\`. Numeric field publication requires supplier confirmation.\n`;

await Promise.all([
  writeFile(join(reportRoot, "product-inventory.csv"), csv(inventory)),
  writeFile(join(reportRoot, "missing-product-data.csv"), csv(missing)),
  writeFile(join(reportRoot, "product-page-leak-audit.csv"), csv(leakAudit)),
  writeFile(join(reportRoot, "product-url-redirect-map.csv"), csv(redirectMap)),
  writeFile(join(reportRoot, "product-schema-validation.json"), JSON.stringify(schemaSummary, null, 2) + "\n"),
  writeFile(join(reportRoot, "product-page-qa-report.md"), qa)
]);

console.log(JSON.stringify({ products: products.length, missingFields: missing.length, leaks: leakAudit.filter((row) => row.status !== "pass").length, productSchemas: schemaSummary.productSchemaPresent }, null, 2));
