import { access, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { buildTruthCard, productKind } from "./product-detail-lib.mjs";

const root = process.cwd();
const products = JSON.parse((await readFile(join(root, "data/products/products.json"), "utf8")).replace(/^\uFEFF/, ""));
const reportPath = join(root, "reports", "za-products", "product-page-qa-report.md");
const requiredModules = ["Product overview", "How it works", "Key features", "Typical applications", "What it helps solve", "Installation and selection guide", "Technical specifications", "Options and customisation", "Operation and maintenance", "Questions buyers ask", "Request a project-specific review"];
const fields = ["productName", "productRequired", "model", "country", "industry", "material", "contamination", "beltWidth", "beltSpeed", "particleSize", "suspensionHeight", "powerSupply", "environment", "sourceUrl", "utm_source", "utm_medium", "utm_campaign"];
const terms = [/cnmagnetics\.com/i, /chnmag\.com/i, /seo meta/i, /primary keyword/i, /search intent/i, /ai[- ]generated/i, /cms checklist/i, /no matching products/i, /\uFFFD/];
const forbidden = {
  permanent_manual: [/input power/i, /cooling configuration/i, /discharge belt drive/i],
  permanent_self_cleaning: [/input power/i, /cooling configuration/i],
  electromagnetic_manual: [/discharge belt drive/i, /belt speed<\/span><strong>Available on request/i],
  wet_magnetic: [/recommended suspension height/i, /material burden depth/i],
  filter: [/recommended suspension height/i, /conveyor belt width/i],
  metal_detection: [/magnetic field configuration/i, /gauss/i],
  eddy_current: [/guaranteed recovery/i]
};

const failures = [];
const uniqueTitles = new Set();
const uniqueDescriptions = new Set();
const productUrls = new Set(products.map((product) => product.canonicalUrl));
const categoryUrls = new Set(products.map((product) => `/en-za/products/${product.categorySlug}/`));
for (const product of products) {
  const truth = buildTruthCard(product);
  const path = join(root, "en-za", "products", product.categorySlug, product.slug, "index.html");
  const html = await readFile(path, "utf8");
  const test = (condition, name) => { if (!condition) failures.push({ url: product.canonicalUrl, check: name }); };
  test(/<h1>[^<]+<\/h1>/.test(html), "H1");
  test(requiredModules.every((module) => html.includes(module)), "required modules");
  test(/"@type":"Product"/.test(html), "Product JSON-LD");
  test(/BreadcrumbList/.test(html), "BreadcrumbList JSON-LD");
  test(html.includes(`<link rel="canonical" href="https://cowinmagnet.co.za${product.canonicalUrl}">`), "canonical");
  test(fields.every((field) => html.includes(`name='${field}'`)), "product enquiry fields");
  const labelTargets = [...html.matchAll(/<label for='([^']+)'/g)].map((match) => match[1]);
  test(labelTargets.length >= 15 && labelTargets.every((id) => html.includes(`id='${id}'`)), "product enquiry labels");
  const galleryImageCount = new Set(product.gallery || []).size;
  test(galleryImageCount > 1 || !html.includes("data-gallery-thumb"), "single-image gallery has no duplicate thumbnails");
  test(html.includes("product-process-diagram"), "product-specific process diagram");
  test(!terms.some((term) => term.test(html)), "public leak scan");
  test(!forbidden[productKind(product)]?.some((term) => term.test(html)), "product-type attribute mix");
  for (const image of product.gallery || []) {
    try { await access(join(root, image.replace(/^\//, ""))); } catch { failures.push({ url: product.canonicalUrl, check: `image exists: ${image}` }); }
  }
  for (const match of html.matchAll(/href='(\/en-za\/products\/[^']+\/)'/g)) test(productUrls.has(match[1]) || categoryUrls.has(match[1]) || match[1] === "/en-za/products/", `related product URL: ${match[1]}`);
  const title = (html.match(/<title>([^<]+)<\/title>/i) || [])[1];
  const description = (html.match(/<meta name="description" content="([^"]+)">/i) || [])[1];
  const heroOverview = (html.match(/<div class='product-hero-copy'>[\s\S]*?<h1>[^<]+<\/h1><p>([\s\S]*?)<\/p>/i) || [])[1] || "";
  const heroWords = heroOverview.replace(/<[^>]*>/g, " ").trim().split(/\s+/).filter(Boolean).length;
  test(heroWords >= 60 && heroWords <= 160, `hero overview word count: ${heroWords}`);
  test(Boolean(title) && !uniqueTitles.has(title), "unique title");
  test(Boolean(description) && !uniqueDescriptions.has(description), "unique meta description");
  if (title) uniqueTitles.add(title);
  if (description) uniqueDescriptions.add(description);
}

const result = { generatedAt: new Date().toISOString(), productCount: products.length, passed: failures.length === 0, failures };
await writeFile(join(root, "reports", "za-products", "product-page-qa.json"), JSON.stringify(result, null, 2) + "\n");
const prior = await readFile(reportPath, "utf8");
const after = `\n## Post-Rebuild Verification\n- Product pages checked: ${products.length}\n- Product pages with Product + BreadcrumbList JSON-LD: ${products.length - failures.filter((item) => /JSON-LD/.test(item.check)).length}/${products.length}\n- Product enquiry forms with product context and UTM fields: ${products.length - failures.filter((item) => item.check === "product enquiry fields").length}/${products.length}\n- Product image file checks: ${products.length - failures.filter((item) => item.check.startsWith("image exists")).length}/${products.length}\n- Attribute-mix checks: ${products.length - failures.filter((item) => item.check === "product-type attribute mix").length}/${products.length}\n- Canonical/title/meta uniqueness checks: ${products.length - failures.filter((item) => /canonical|unique/.test(item.check)).length}/${products.length}\n- Result: ${result.passed ? "PASS" : `FAIL (${failures.length} checks)`}\n`;
await writeFile(reportPath, prior.replace(/\n## Post-Rebuild Verification[\s\S]*/m, "") + after);
console.log(JSON.stringify({ products: products.length, failures: failures.length }, null, 2));
if (failures.length) process.exitCode = 1;
