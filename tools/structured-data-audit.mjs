import assert from "node:assert/strict";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";

const root = process.cwd();
const productsRoot = join(root, "en-za", "products");
const fix = process.argv.includes("--fix");
const jsonLdPattern = /\s*<script\s+type=["']application\/ld\+json["']>([\s\S]*?)<\/script>/gi;

async function htmlFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return htmlFiles(path);
    return entry.name === "index.html" ? [path] : [];
  }));
  return files.flat();
}

function nodes(value) {
  if (!value || typeof value !== "object") return [];
  const own = [value];
  if (Array.isArray(value)) return [...own, ...value.flatMap(nodes)];
  return [...own, ...Object.values(value).flatMap(nodes)];
}

function isProduct(value) {
  const type = value?.["@type"];
  return type === "Product" || (Array.isArray(type) && type.includes("Product"));
}

function validProductSnippet(value) {
  if (value.review || value.aggregateRating) return true;
  const offers = Array.isArray(value.offers) ? value.offers : value.offers ? [value.offers] : [];
  return offers.some((offer) => (
    offer?.price !== undefined ||
    offer?.priceSpecification?.price !== undefined ||
    (offer?.lowPrice !== undefined && offer?.priceCurrency)
  ));
}

const files = await htmlFiles(productsRoot);
let fixedFiles = 0;
let removedItems = 0;
const invalid = [];
const parseErrors = [];
const missingWebPage = [];

for (const file of files) {
  const html = await readFile(file, "utf8");
  let changed = false;
  let hasWebPage = false;
  const next = html.replace(jsonLdPattern, (tag, json) => {
    let data;
    try {
      data = JSON.parse(json);
    } catch (error) {
      parseErrors.push({ file: relative(root, file), error: error.message });
      return tag;
    }
    hasWebPage ||= nodes(data).some((item) => item?.["@type"] === "WebPage");
    const invalidProducts = nodes(data).filter((item) => isProduct(item) && !validProductSnippet(item));
    if (!invalidProducts.length) return tag;
    invalid.push(...invalidProducts.map((item) => ({ file: relative(root, file), name: item.name || "Unnamed product" })));
    if (!fix || isProduct(data) === false) return tag;
    changed = true;
    removedItems += invalidProducts.length;
    return "";
  });
  if (changed) {
    await writeFile(file, next, "utf8");
    fixedFiles += 1;
  }
  const relativePath = relative(productsRoot, file).replaceAll("\\", "/");
  if (relativePath.split("/").length === 3 && !hasWebPage) missingWebPage.push(relative(root, file));
}

if (!fix) {
  assert.deepEqual(parseErrors, [], `Invalid JSON-LD found: ${JSON.stringify(parseErrors)}`);
  assert.deepEqual(invalid, [], `Product snippet markup is missing truthful offers/reviews: ${JSON.stringify(invalid.slice(0, 10))}`);
  assert.deepEqual(missingWebPage, [], `Product detail pages are missing WebPage structured data: ${JSON.stringify(missingWebPage.slice(0, 10))}`);
}

console.log(JSON.stringify({
  scannedFiles: files.length,
  invalidItems: invalid.length,
  fixedFiles,
  removedItems,
  parseErrors: parseErrors.length,
  missingWebPage: missingWebPage.length
}, null, 2));
