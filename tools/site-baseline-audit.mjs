import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";

const root = process.cwd();
const siteUrl = "https://cowinmagnet.co.za";
const reportsDir = join(root, "reports");
const truthCardsDir = join(reportsDir, "product-truth-cards");
const legacyProductRedirects = JSON.parse((await readFile(join(root, "data", "seo", "legacy-product-redirects.json"), "utf8")).replace(/^\uFEFF/, ""));
const internalTerms = [
  "SEO Meta",
  "SEO Title",
  "Meta Description",
  "URL Slug",
  "Primary Keyword",
  "Secondary Keywords",
  "Search Intent",
  "Target Country",
  "Target Buyer",
  "Suggested CTA",
  "AI Citation Ready Summary",
  "Internal Linking Suggestions",
  "CMS checklist",
  "AI-generated",
  "No matching products"
];

function csv(value) {
  const text = Array.isArray(value) ? value.join("; ") : String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

function asCsv(headers, rows) {
  return [headers.map(csv).join(","), ...rows.map((row) => headers.map((key) => csv(row[key])).join(","))].join("\n") + "\n";
}

async function readJson(path) {
  return JSON.parse((await readFile(path, "utf8")).replace(/^\uFEFF/, ""));
}

async function htmlFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) return htmlFiles(fullPath);
    return entry.isFile() && entry.name === "index.html" ? [fullPath] : [];
  }));
  return nested.flat();
}

function matchOne(html, expression) {
  return html.match(expression)?.[1]?.trim() || "";
}

function productFamily(product) {
  const text = `${product.slug} ${product.name}`.toLowerCase();
  if (/(eddy|hecp|hecs)/.test(text)) return "eddy-current-separator";
  if (/(metal.detector|gjt|dls|gls)/.test(text)) return "conveyor-metal-detector";
  if (/(head.pulley)/.test(text)) return "magnetic-head-pulley";
  if (/(wet.drum|ctn|cts|ctb|ctz|cgt|rct|qcg|dcx)/.test(text)) return "wet-drum-or-wet-magnetic-separator";
  if (/(dry.drum|ctdg|hcg|dhd|dhj|ctq)/.test(text)) return "dry-magnetic-separator";
  if (/(grid|drawer|trap|pipe|pipeline|filter|rod|bar|hump|clc|cbs|cgb|cqz|cxj|cyg|rcya|rcyf|rcyg|rcyz)/.test(text)) return "magnetic-filter-or-component";
  if (/(rcda|rcdb|rcdc|rcdd|rcde|rcdf|electromagnetic)/.test(text)) {
    return /(self.dumping|self.cleaning|rcdc|rcdd|rcdf)/.test(text) ? "self-cleaning-electromagnetic-overband" : "suspended-electromagnetic-separator";
  }
  if (/(overband|self.dumping|self.cleaning|rcyd|rcye|rcydii|rcps|rbcyd)/.test(text)) return "permanent-overband-or-self-cleaning";
  if (/(suspended|rcyb|manual.iron.remover)/.test(text)) return "suspended-permanent-magnetic-separator";
  if (/(lifting.magnet|rbcdb|rbcdd)/.test(text)) return "lifting-or-special-application-equipment";
  return "unclassified-product-family";
}

function truthCard(product) {
  const family = productFamily(product);
  const sharedPending = ["confirmed model/series drawing", "application-specific dimensions", "approved performance values", "verified options and exclusions", "reviewer approval"];
  const pendingByFamily = {
    "suspended-permanent-magnetic-separator": ["installation orientation", "manual cleaning method", "suspension height"],
    "permanent-overband-or-self-cleaning": ["self-cleaning belt arrangement", "drive details where applicable", "belt speed and duty"],
    "suspended-electromagnetic-separator": ["input power", "coil/cooling configuration", "control cabinet requirements"],
    "self-cleaning-electromagnetic-overband": ["input power", "coil/cooling configuration", "self-cleaning drive details"],
    "wet-drum-or-wet-magnetic-separator": ["drum diameter and length", "tank type", "slurry and particle-size range"],
    "eddy-current-separator": ["rotor configuration", "feed-size range", "splitter adjustment"],
    "conveyor-metal-detector": ["detection aperture", "sensitivity application range", "alarm/reject interface"],
    "magnetic-head-pulley": ["pulley dimensions", "magnetic circuit grade", "conveyor integration details"]
  };
  return {
    id: product.productId || product.sourceProductId || product.slug,
    productSlug: product.slug,
    productName: product.name,
    productFamily: family,
    status: "needs-engineering-review",
    verifiedFields: {
      sourceProductId: product.sourceProductId || null,
      sourceUrl: product.sourceUrl || null,
      productImage: product.mainImage || product.image || null,
      category: product.category || null
    },
    allowedClaims: ["Product identity and image recorded in the current catalogue", "Final configuration is confirmed against actual process conditions"],
    forbiddenClaims: ["Unverified numeric performance", "Unverified South African local presence", "Unverified certification, stock, lead time, installation team, case study or customer review"],
    pendingFields: [...(pendingByFamily[family] || ["correct product family and working principle"]), ...sharedPending],
    applicationsToConfirm: Array.isArray(product.applications) ? product.applications : [],
    sourceRecord: "data/products/products.json",
    reviewer: null,
    updatedAt: new Date().toISOString()
  };
}

await mkdir(truthCardsDir, { recursive: true });
const products = await readJson(join(root, "data/products/products.json"));
const productHtml = await htmlFiles(join(root, "en-za", "products"));
const allHtml = await htmlFiles(join(root, "en-za"));

const productBySlug = new Map(products.map((product) => [product.slug, product]));
const inventory = [];
const missing = [];
for (const filePath of productHtml) {
  const html = await readFile(filePath, "utf8");
  const urlPath = `/en-za/${relative(join(root, "en-za"), filePath).split(sep).slice(0, -1).join("/")}/`.replace(/\/+/g, "/");
  const slug = urlPath.split("/").filter(Boolean).at(-1);
  const product = productBySlug.get(slug);
  const family = product ? productFamily(product) : "unmatched-static-route";
  const pageRisks = [
    /No matching products/i.test(html) ? "empty-result message present" : "",
    /Drive motor power|Magnet power|Cooling method|Control cabinet/i.test(html) && family === "suspended-permanent-magnetic-separator" ? "mixed electromagnetic specification fields" : "",
    !product ? "static page has no product data record" : ""
  ].filter(Boolean);
  if (!product) continue;
  inventory.push({
    url: `${siteUrl}${urlPath}`,
    slug,
    h1: matchOne(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i).replace(/<[^>]+>/g, ""),
    seriesOrModel: product?.sourceProductId || "",
    category: product?.category || "",
    currentStatus: product?.productStatus || "static route only",
    mainImage: product?.mainImage || product?.image || "",
    parameterSource: product?.sourceUrl || "not recorded",
    contentMissing: product ? truthCard(product).pendingFields : ["product data record"],
    duplicateRisk: pageRisks.join("; "),
    needsSplit: /mixed electromagnetic specification fields/.test(pageRisks.join("; ")) ? "yes" : "review",
    productFamily: family
  });
  const card = truthCard(product);
  await writeFile(join(truthCardsDir, `${product.slug}.json`), `${JSON.stringify(card, null, 2)}\n`);
  for (const field of card.pendingFields) missing.push({ productSlug: product.slug, productName: product.name, productFamily: family, requiredField: field, source: card.sourceRecord, status: "needs COWIN engineering confirmation" });
}

const canonicalAudit = [];
const visibilityRows = [];
for (const filePath of allHtml) {
  const html = await readFile(filePath, "utf8");
  const route = `/en-za/${relative(join(root, "en-za"), filePath).split(sep).slice(0, -1).join("/")}/`.replace(/\/+/g, "/");
  const title = matchOne(html, /<title>([\s\S]*?)<\/title>/i);
  const description = matchOne(html, /<meta\s+name=['"]description['"]\s+content=['"]([^'"]*)/i);
  const canonical = matchOne(html, /<link\s+rel=['"]canonical['"]\s+href=['"]([^'"]*)/i);
  const hreflang = [...html.matchAll(/<link\s+rel=['"]alternate['"]\s+hreflang=['"]([^'"]*)['"]\s+href=['"]([^'"]*)/gi)].map((match) => `${match[1]}=${match[2]}`);
  canonicalAudit.push({ url: `${siteUrl}${route}`, title, description, canonical, hreflang: hreflang.join("; "), canonicalStatus: canonical === `${siteUrl}${route}` ? "valid" : "review", indexStatus: matchOne(html, /<meta\s+name=['"]robots['"]\s+content=['"]([^'"]*)/i) || "not set" });
  for (const term of internalTerms) {
    if (html.toLowerCase().includes(term.toLowerCase())) visibilityRows.push({ url: `${siteUrl}${route}`, term, location: relative(root, filePath), status: term === "No matching products" ? "must remove from public HTML" : "must investigate and remove if public" });
  }
}

const seoAudit = canonicalAudit.map((row) => ({
  url: row.url,
  titleStatus: row.title ? "present" : "missing",
  descriptionStatus: row.description ? "present" : "missing",
  canonicalStatus: row.canonicalStatus,
  hreflangStatus: row.hreflang ? "present" : "missing",
  priority: row.canonicalStatus === "valid" && row.title && row.description ? "review" : "P0"
}));

await writeFile(join(reportsDir, "product-inventory-before.csv"), asCsv(["url", "slug", "h1", "seriesOrModel", "category", "currentStatus", "mainImage", "parameterSource", "contentMissing", "duplicateRisk", "needsSplit", "productFamily"], inventory));
await writeFile(join(reportsDir, "missing-product-data.csv"), asCsv(["productSlug", "productName", "productFamily", "requiredField", "source", "status"], missing));
await writeFile(join(reportsDir, "url-canonical-hreflang-audit.csv"), asCsv(["url", "title", "description", "canonical", "hreflang", "canonicalStatus", "indexStatus"], canonicalAudit));
await writeFile(join(reportsDir, "redirect-map.csv"), asCsv(
  ["oldUrl", "newUrl", "httpStatus", "reason", "verification"],
  legacyProductRedirects.map((redirect) => ({
    oldUrl: redirect.source,
    newUrl: redirect.destination,
    httpStatus: redirect.permanent ? "308" : "307",
    reason: redirect.reason || "Legacy route compatibility",
    verification: "configured in next.config.mjs; production verification pending deployment"
  }))
));
await writeFile(join(reportsDir, "content-visibility-audit.csv"), asCsv(["url", "term", "location", "status"], visibilityRows));
await writeFile(join(reportsDir, "seo-audit-before.csv"), asCsv(["url", "titleStatus", "descriptionStatus", "canonicalStatus", "hreflangStatus", "priority"], seoAudit));

console.log(JSON.stringify({ productPages: productHtml.length, productRecords: products.length, visibilityFindings: visibilityRows.length, canonicalRows: canonicalAudit.length, reportsDir: relative(root, reportsDir) }, null, 2));
