import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";

const root = process.cwd();
const output = "reports/full-site-audit-20260831/product-sync-audit.json";
const readJson = async (path) => JSON.parse((await readFile(join(root, path), "utf8")).replace(/^\uFEFF/, ""));
const products = await readJson("data/products/products.json");
const sourceProducts = await readJson("data/source-sync/main-site-products.json");
const searchIndex = await readJson("data/search-index.json");
const redirects = await readJson("data/seo/legacy-product-redirects.json");

const failures = [];
const push = (condition, check, detail = "") => { if (!condition) failures.push({ check, detail }); };
const unique = (values) => new Set(values).size === values.length;
push(products.length === sourceProducts.length, "release/source product counts match", `${products.length}/${sourceProducts.length}`);
push(unique(products.map((item) => item.slug)), "product slugs are unique");
push(unique(products.map((item) => item.canonicalUrl)), "product canonical URLs are unique");
push(unique(products.map((item) => item.seoTitle)), "product SEO titles are unique");
push(unique(products.map((item) => item.seoDescription)), "product SEO descriptions are unique");

const sourceBySlug = new Map(sourceProducts.map((item) => [item.slug, item]));
for (const product of products) {
  const source = sourceBySlug.get(product.slug);
  push(Boolean(source), "source record exists", product.slug);
  push(source?.sourceUrl === product.sourceUrl, "source URL matches release record", product.slug);
  push(searchIndex.some((item) => item.url === product.canonicalUrl), "product is present in search index", product.slug);
  try { await access(join(root, "en-za", "products", product.categorySlug, product.slug, "index.html")); } catch { failures.push({ check: "product page exists", detail: product.slug }); }
  for (const image of product.gallery || []) {
    try { await access(join(root, image.replace(/^\//, ""))); } catch { failures.push({ check: "product image exists", detail: `${product.slug}: ${image}` }); }
  }
}

const normalized = (item) => JSON.stringify({
  name: item.name,
  categorySlug: item.categorySlug,
  shortDescription: item.shortDescription,
  sourceContent: item.sourceContent,
  sourceImages: item.sourceImages
});
const fingerprints = new Map();
for (const product of products) {
  const fingerprint = createHash("sha256").update(normalized(product).toLowerCase()).digest("hex");
  fingerprints.set(fingerprint, [...(fingerprints.get(fingerprint) || []), product.slug]);
}
const semanticDuplicates = [...fingerprints.values()].filter((items) => items.length > 1);
push(!semanticDuplicates.length, "no semantically duplicate products", JSON.stringify(semanticDuplicates));
push(redirects.some((item) => item.source.endsWith("/dcz-type-dry-fully-automatic-magnetic-separation/") && item.destination.endsWith("/dcz-type-dry-fully-automatic-magnetic-separator/") && item.permanent), "duplicate DCZ route has permanent canonical redirect");

const sourceChecks = [];
for (const product of products) {
  try {
    const response = await fetch(product.sourceUrl, { redirect: "follow", signal: AbortSignal.timeout(15_000), headers: { "user-agent": "Cowinmagnet Africa source-sync audit" } });
    sourceChecks.push({ slug: product.slug, url: product.sourceUrl, status: response.status });
    push(response.status === 200, "supplier source URL is available", `${product.slug}: ${response.status}`);
  } catch (error) {
    sourceChecks.push({ slug: product.slug, url: product.sourceUrl, status: 0, error: error?.message || String(error) });
    failures.push({ check: "supplier source URL is available", detail: `${product.slug}: ${error?.message || error}` });
  }
}

const report = { generatedAt: new Date().toISOString(), passed: !failures.length, productCount: products.length, categoryCount: new Set(products.map((item) => item.categorySlug)).size, sourceChecks, semanticDuplicates, failures };
await mkdir(dirname(join(root, output)), { recursive: true });
await writeFile(join(root, output), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ output, passed: report.passed, products: products.length, sourceFailures: sourceChecks.filter((item) => item.status !== 200).length, failures: failures.length }, null, 2));
if (failures.length) process.exitCode = 1;
