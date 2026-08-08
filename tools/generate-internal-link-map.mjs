import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const products = JSON.parse((await readFile(join(root, "data", "products", "products.json"), "utf8")).replace(/^\uFEFF/, ""));
const sitePath = "/en-za";
const rows = [];

for (const product of products) {
  const source = product.canonicalUrl || `${sitePath}/products/${product.categorySlug}/${product.slug}/`;
  for (const industry of product.relatedIndustries || []) {
    rows.push({ fromUrl: source, toUrl: `${sitePath}/industries/${industry}/`, relationship: "product-to-industry", status: "generated from product truth card" });
  }
  for (const solution of product.relatedSolutions || []) {
    rows.push({ fromUrl: source, toUrl: `${sitePath}/solutions/${solution}/`, relationship: "product-to-solution", status: "generated from product truth card" });
  }
}

const headers = ["fromUrl", "toUrl", "relationship", "status"];
const csv = [headers.join(","), ...rows.map((row) => headers.map((key) => `"${String(row[key]).replaceAll('"', '""')}"`).join(","))].join("\n");
await writeFile(join(root, "reports", "internal-link-map.csv"), `${csv}\n`);
console.log(JSON.stringify({ links: rows.length, products: products.length, report: "reports/internal-link-map.csv" }, null, 2));
