import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";

const root = process.cwd();
const sourceBase = "https://www.cowinmagnet.com";
const productsUrl = `${sourceBase}/en/products`;
const sourceDir = join(root, "data", "source-sync");
const imageDir = join(root, "assets", "images", "source-products");
const categoryDir = join(root, "data", "categories");

function decode(value = "") {
  return String(value)
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)));
}

function text(html = "") {
  return decode(String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim());
}

function first(html, pattern) {
  return text((String(html).match(pattern) || ["", ""])[1]);
}

function all(html, pattern) {
  return [...String(html).matchAll(pattern)].map((match) => text(match[1])).filter(Boolean);
}

function absolute(path) {
  return new URL(path, sourceBase).toString();
}

function productSchema(html) {
  for (const match of String(html).matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const parsed = JSON.parse(match[1]);
      const candidates = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.["@graph"]) ? parsed["@graph"] : [parsed];
      const found = candidates.find((item) => item?.["@type"] === "Product");
      if (found) return found;
    } catch {
      // Ignore a non-JSON metadata script and continue scanning this public page.
    }
  }
  return null;
}

function sectionContent(html) {
  const sections = [];
  const expression = /<section\s+class=["']product-detail-section\s+([^"']+)["'][^>]*>([\s\S]*?)<\/section>/gi;
  for (const match of String(html).matchAll(expression)) {
    const key = (match[1].match(/product-([a-z-]+)-section/i) || ["", "content"])[1];
    const body = match[2];
    const rows = [];
    for (const row of body.matchAll(/<div[^>]*role=["']row["'][^>]*>([\s\S]*?)<\/div>/gi)) {
      const cells = all(row[1], /<(?:span|strong)[^>]*>([\s\S]*?)<\/(?:span|strong)>/gi);
      if (cells.length >= 2 && cells[0].toLowerCase() !== "parameter") rows.push(cells);
    }
    const cards = [];
    for (const card of body.matchAll(/<article[^>]*>([\s\S]*?)<\/article>/gi)) {
      const title = first(card[1], /<h3[^>]*>([\s\S]*?)<\/h3>/i);
      const description = first(card[1], /<p[^>]*>([\s\S]*?)<\/p>/i);
      if (title || description) cards.push({ title, description });
    }
    for (const detail of body.matchAll(/<details[^>]*>\s*<summary[^>]*>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>/gi)) {
      const title = text(detail[1]);
      const description = first(detail[2], /<p[^>]*>([\s\S]*?)<\/p>/i) || text(detail[2]);
      if (title || description) cards.push({ title, description });
    }
    const taggedItems = [];
    for (const group of body.matchAll(/<(?:div|ol)[^>]*class=["'][^"']*(?:product-tag-list|product-options-grid)[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|ol)>/gi)) {
      taggedItems.push(...all(group[1], /<span[^>]*>([\s\S]*?)<\/span>/gi));
    }
    if (key === "options") {
      const optionStart = body.search(/<div[^>]*class=["'][^"']*product-options-grid[^"']*["'][^>]*>/i);
      if (optionStart >= 0) taggedItems.push(...all(body.slice(optionStart), /<span[^>]*>([\s\S]*?)<\/span>/gi));
    }
    const paragraphs = all(body, /<p[^>]*>([\s\S]*?)<\/p>/gi);
    const items = [...all(body, /<li[^>]*>([\s\S]*?)<\/li>/gi), ...taggedItems];
    sections.push({
      key,
      eyebrow: first(body, /<span[^>]*class=["'][^"']*eyebrow[^"']*["'][^>]*>([\s\S]*?)<\/span>/i),
      title: first(body, /<h2[^>]*>([\s\S]*?)<\/h2>/i),
      introduction: first(body, /<div[^>]*class=["'][^"']*product-detail-section-heading[^"']*["'][^>]*>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/i),
      paragraphs: cards.length || (items.length && !first(body, /<div[^>]*class=["'][^"']*product-detail-section-heading[^"']*["'][^>]*>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/i)) ? [] : paragraphs,
      items: [...new Set(items)],
      cards,
      rows
    });
  }
  return sections.filter((section) => section.title || section.paragraphs.length || section.items.length || section.rows.length);
}

function productContent(html) {
  const hero = (String(html).match(/<section\s+class=["']product-detail-hero["'][^>]*>([\s\S]*?)<\/section>/i) || ["", ""])[1];
  const highlightList = (hero.match(/<ul[^>]*class=["'][^"']*product-key-points[^"']*["'][^>]*>([\s\S]*?)<\/ul>/i) || ["", ""])[1];
  const quickFacts = [];
  for (const match of hero.matchAll(/<dt[^>]*>([\s\S]*?)<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/gi)) {
    quickFacts.push({ label: text(match[1]), value: text(match[2]) });
  }
  return {
    hero: {
      summary: first(hero, /<h1[^>]*>[\s\S]*?<\/h1>\s*<p[^>]*>([\s\S]*?)<\/p>/i),
      highlights: all(highlightList, /<li[^>]*>([\s\S]*?)<\/li>/gi),
      quickFacts
    },
    sections: sectionContent(html)
  };
}

async function fetchText(url) {
  const response = await fetch(url, { headers: { "user-agent": "Cowinmagnet Africa product synchronizer" } });
  if (!response.ok) throw new Error(`Unable to fetch ${url}: ${response.status}`);
  return response.text();
}

async function downloadImage(url, slug, index) {
  const response = await fetch(url, { headers: { "user-agent": "Cowinmagnet Africa product synchronizer" } });
  if (!response.ok) throw new Error(`Unable to download ${url}: ${response.status}`);
  const pathname = new URL(url).pathname;
  const ext = extname(pathname) || ".jpg";
  const filename = `${slug}-${String(index + 1).padStart(2, "0")}${ext.toLowerCase()}`;
  await writeFile(join(imageDir, filename), Buffer.from(await response.arrayBuffer()));
  return `/assets/images/source-products/${filename}`;
}

function productPaths(listingHtml) {
  return [...String(listingHtml).matchAll(/href=["'](\/en\/products\/[^"'#?]+)["']/gi)]
    .map((match) => match[1].replace(/\/$/, ""))
    .filter((path) => path !== "/en/products" && !path.includes("/category/"))
    .filter((path, index, paths) => paths.indexOf(path) === index);
}

function categoriesFromListing(listingHtml) {
  const categories = [];
  const productCategoryByPath = new Map();
  const expression = /<div\s+class=["']product-category-block["']\s+id=["']category-([^"']+)["'][^>]*>([\s\S]*?)(?=<div\s+class=["']product-category-block["']|<\/section>)/gi;
  for (const match of String(listingHtml).matchAll(expression)) {
    const slug = match[1];
    const block = match[2];
    const name = first(block, /<h2[^>]*>([\s\S]*?)<\/h2>/i);
    const description = first(block, /<p[^>]*>([\s\S]*?)<\/p>/i);
    if (!name) continue;
    categories.push({ slug, name, description, sourceUrl: `${productsUrl}#category-${slug}`, sourceSite: "cowinmagnet.com" });
    for (const path of productPaths(block)) productCategoryByPath.set(path, { slug, name });
  }
  return { categories, productCategoryByPath };
}

async function main() {
  await Promise.all([mkdir(sourceDir, { recursive: true }), mkdir(categoryDir, { recursive: true })]);
  await rm(imageDir, { recursive: true, force: true });
  await mkdir(imageDir, { recursive: true });
  const listingHtml = await fetchText(productsUrl);
  const { categories, productCategoryByPath } = categoriesFromListing(listingHtml);
  const paths = productPaths(listingHtml);
  if (!paths.length || !categories.length) throw new Error("The main-site product directory did not return verifiable products and categories.");
  const records = [];
  const failures = [];
  for (const path of paths) {
    const sourceUrl = absolute(path);
    process.stdout.write(`Syncing ${sourceUrl}\n`);
    try {
      const html = await fetchText(sourceUrl);
      const schema = productSchema(html);
      const content = productContent(html);
      const category = productCategoryByPath.get(path);
      const slug = path.split("/").filter(Boolean).at(-1);
      const name = first(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i) || text(schema?.name);
       const description = content.hero.summary || text(schema?.description);
      const sourceImages = [...new Set((Array.isArray(schema?.image) ? schema.image : schema?.image ? [schema.image] : []).map(absolute))];
      const images = [];
      for (const [index, image] of sourceImages.entries()) images.push(await downloadImage(image, slug, index));
      if (!name || !category || !description || !content.sections.length || !images.length) throw new Error("Missing a required public product field.");
      const specificationSection = content.sections.find((section) => section.key === "specification");
      records.push({
        productId: `CW-AF-${slug}`,
        slug,
        name,
        category: category.name,
        categorySlug: category.slug,
        sourceProductId: slug,
        sourceSite: "www.cowinmagnet.com",
        sourceUrl,
        sourceVersion: new Date().toISOString(),
        importedAt: new Date().toISOString(),
        lastSyncedAt: new Date().toISOString(),
        syncStatus: "synced-main-site-public-content",
        productStatus: "published",
        sortOrder: records.length + 1,
        image: images[0],
        mainImage: images[0],
        images,
        gallery: images,
        sourceImages,
        shortDescription: description,
        fullDescription: content.hero.summary,
        sourceContent: content,
        technicalSpecifications: (specificationSection?.rows || []).map((row, index) => ({ parameter: row[0], value: row[1], confirmation: row[2] || "", sortOrder: (index + 1) * 10, visible: true })),
        dataProvenance: "main-site-public-content-sync",
        truthCardStatus: "synced-from-main-site",
        canonicalUrl: `/en-za/products/${category.slug}/${slug}/`,
        seoTitle: `${name} | COWIN MAGNET South Africa`,
        seoDescription: description,
        applications: [],
        features: content.hero.highlights,
        relatedProducts: [],
        relatedIndustries: [],
        relatedSolutions: []
      });
    } catch (error) {
      failures.push({ path, sourceUrl, error: error.message });
    }
  }
  await writeFile(join(sourceDir, "main-site-products.json"), JSON.stringify(records, null, 2));
  await writeFile(join(root, "data", "products", "products.json"), JSON.stringify(records, null, 2));
  await writeFile(join(categoryDir, "categories.json"), JSON.stringify(categories, null, 2));
  const redirectPath = join(root, "data", "seo", "legacy-product-redirects.json");
  try {
    const redirects = JSON.parse((await readFile(redirectPath, "utf8")).replace(/^\uFEFF/, ""));
    const canonicalBySlug = new Map(records.map((record) => [record.slug, record.canonicalUrl]));
    const normalized = [];
    const seenSources = new Set();
    for (const redirect of redirects) {
      const sourceSlug = redirect.source.split("/").filter(Boolean).at(-1);
      const destinationSlug = redirect.destination.split("/").filter(Boolean).at(-1);
      const canonical = canonicalBySlug.get(sourceSlug) || canonicalBySlug.get(destinationSlug);
      if (!canonical) {
        if (!seenSources.has(redirect.source)) normalized.push(redirect);
        seenSources.add(redirect.source);
        continue;
      }
      const legacySource = redirect.source === canonical ? redirect.destination : redirect.source;
      if (legacySource === canonical || seenSources.has(legacySource)) continue;
      normalized.push({
        ...redirect,
        source: legacySource,
        destination: canonical,
        reason: "Product classification route synchronized from the main-site catalogue"
      });
      seenSources.add(legacySource);
    }
    await writeFile(redirectPath, JSON.stringify(normalized, null, 2) + "\n");
  } catch (error) {
    throw new Error(`Unable to normalize legacy product redirects: ${error.message}`);
  }
  await writeFile(join(sourceDir, "main-site-products-sync-report.json"), JSON.stringify({ generatedAt: new Date().toISOString(), source: productsUrl, productCount: records.length, categoryCount: categories.length, failures }, null, 2));
  if (failures.length) throw new Error(`${failures.length} product records were not synced. Product data was not generated for those records.`);
  console.log(`Synced ${records.length} verified product pages and ${categories.length} categories from ${productsUrl}`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
