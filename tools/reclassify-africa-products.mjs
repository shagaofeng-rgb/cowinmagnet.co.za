import { readFile, writeFile } from "node:fs/promises";

const readJson = async (file) => JSON.parse((await readFile(file, "utf8")).replace(/^\uFEFF/, ""));
const writeJson = (file, value) => writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");

const groups = {
  iron: {
    slug: "suspended-and-self-unloading-iron-removers",
    name: "Suspended & Self-Cleaning Iron Removers",
    description: "Suspended permanent, electromagnetic and self-cleaning iron removers for conveyor tramp iron control and crusher protection."
  },
  separation: {
    slug: "magnetic-separation-equipment",
    name: "Magnetic Separation Equipment",
    description: "Drum, wet, dry, high-gradient and conveyor magnetic separation equipment for mineral processing and material recovery."
  },
  metal: {
    slug: "metal-detection-and-recycling-sorting",
    name: "Metal Detection & Recovery Sorting",
    description: "Metal detection and eddy-current sorting equipment for ferrous and non-ferrous recovery."
  },
  components: {
    slug: "magnetic-components-and-filters",
    name: "Magnetic Components & Filters",
    description: "Magnetic bars, grids, filters, traps and pipeline solutions for fine iron removal from material streams."
  }
};

function classify(slug) {
  if (/(^rc(d|y|p)|^rbc|suspended-|permanent-overband|electromagnet-separator|control-box)/.test(slug) && !/rcyz-type-pipeline/.test(slug)) return groups.iron;
  if (/(dls|gjt|eddy|hecp|hecs|stainless-steel)/.test(slug)) return groups.metal;
  if (/(filter|magnetic-grid|magnetic-rod|drawer-magnet|hump-magnet|magnetic-trap|rotary-pipe|rcyz-type-pipeline)/.test(slug)) return groups.components;
  return groups.separation;
}

function productCard(product) {
  const href = product.canonicalUrl;
  return `<a class="card" href="${href}"><img src="${product.image || product.mainImage || "/assets/images/hero-mining-conveyor-magnet.webp"}" alt="${product.name} image" loading="lazy"><p class="eyebrow">${product.category}</p><h3>${product.name}</h3><p>${product.shortDescription || "Selection is confirmed from material, capacity and installation conditions."}</p></a>`;
}

async function renderCategory(group, products) {
  const file = `en-za/products/${group.slug}/index.html`;
  const source = await readFile(file, "utf8");
  const main = `<main><section class="page-hero"><nav class="breadcrumbs"><a href="/en-za/">Home</a> / <a href="/en-za/products/">Products</a> / ${group.name}</nav><p class="eyebrow">Product family</p><h1>${group.name}</h1><p>${group.description}</p></section><section class="section"><div class="section-heading"><h2>Equipment in this family</h2><p>Choose a model after confirming material, capacity, conveyor or process conditions, and the required separation objective.</p></div><div class="grid">${products.map(productCard).join("")}</div></section><section class="section band"><div class="panel"><h2>Need product selection support?</h2><p>Send material details, capacity, particle size and installation conditions for a practical recommendation.</p><a class="button primary" href="/en-za/request-a-quote/">Request a Quote</a></div></section></main>`;
  await writeFile(file, source.replace(/<main>[\s\S]*?<\/main>/, main), "utf8");
}

async function updateProductBreadcrumb(product) {
  const file = `${product.canonicalUrl.replace(/^\//, "")}index.html`;
  const source = await readFile(file, "utf8");
  const updated = source.replace(
    /(<a href=['"]\/en-za\/products\/['"]>Products<\/a>\s*\/\s*)<a href=['"][^'"]+['"]>[^<]+<\/a>/,
    `$1<a href='/en-za/products/${product.categorySlug}/'>${product.category}</a>`
  );
  await writeFile(file, updated, "utf8");
}

const products = await readJson("data/products/products.json");
for (const product of products) {
  const originalCategory = product.categorySlug;
  const group = classify(product.slug);
  product.canonicalUrl ||= `/en-za/products/${originalCategory}/${product.slug}/`;
  product.categorySlug = group.slug;
  product.category = group.name;
}

const bySlug = new Map(Object.values(groups).map((group) => [group.slug, []]));
for (const product of products) bySlug.get(product.categorySlug).push(product);
for (const items of bySlug.values()) items.sort((a, b) => a.name.localeCompare(b.name));

await writeJson("data/products/products.json", products);
await writeJson("data/categories/categories.json", Object.values(groups).map((group) => ({ name: group.name, slug: group.slug, description: group.description, canonicalUrl: `/en-za/products/${group.slug}/` })));
for (const group of Object.values(groups)) await renderCategory(group, bySlug.get(group.slug));
for (const product of products) await updateProductBreadcrumb(product);

const searchIndex = await readJson("data/search-index.json");
const productByUrl = new Map(products.map((product) => [product.canonicalUrl, product]));
for (const item of searchIndex) {
  const product = productByUrl.get(item.url);
  if (!product) continue;
  item.summary = `${product.category} - ${(product.applications || []).join(", ")}`;
}
await writeJson("data/search-index.json", searchIndex);

console.log(JSON.stringify(Object.fromEntries([...bySlug.entries()].map(([slug, items]) => [slug, items.length])), null, 2));
