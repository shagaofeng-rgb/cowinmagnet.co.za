import crypto from "node:crypto";
import { copyFile, mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, join, normalize, sep } from "node:path";
import { isPublishedBlogArticle, isPublishedNewsArticle, readDataJson, withDataLock, writeDataJson } from "./news-system.js";
import { submitSitemapToSearchConsole } from "./google-seo-sync.js";
import { markSitemapDirty as writeDirtyState } from "./sitemap-state.js";

const ROOT = process.cwd();
const XML_HEADER = '<?xml version="1.0" encoding="UTF-8"?>';
const URLSET_OPEN = '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">';
const URLSET_CLOSE = "</urlset>";
const INDEX_OPEN = '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">';
const INDEX_CLOSE = "</sitemapindex>";
const DEFAULT_MAX_URLS = 50_000;
const DEFAULT_MAX_BYTES = 50 * 1024 * 1024;
const EXCLUDED_PATHS = [/\/404\/?$/i, /\/search\/?$/i, /^\/admin(?:\/|$)/i, /^\/api(?:\/|$)/i];
let cachedBundle;
let cachedBundleUntil = 0;

function sha256(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

export function productionSiteUrl() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL || process.env.APP_URL || "https://cowinmagnet.co.za";
  try {
    const parsed = new URL(configured);
    if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") return "https://cowinmagnet.co.za";
    return parsed.origin.replace(/\/$/, "");
  } catch {
    return "https://cowinmagnet.co.za";
  }
}

export function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function normalizeLastmod(value, fallback = "") {
  const parsed = new Date(value || fallback);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString();
}

function canonicalPath(value) {
  try {
    const url = new URL(value, productionSiteUrl());
    url.hash = "";
    url.search = "";
    url.pathname = url.pathname === "/" ? "/" : `${url.pathname.replace(/\/+$/, "")}/`;
    return url.toString();
  } catch {
    return "";
  }
}

export function normalizeSitemapRecord(record, siteUrl = productionSiteUrl()) {
  if (!record || record.public === false || record.noindex || record.deleted || record.routeExists === false) return null;
  if (record.status && !["published", "active"].includes(String(record.status).toLowerCase())) return null;
  try {
    const sourceUrl = new URL(record.loc || record.url || "", siteUrl);
    if (sourceUrl.search || sourceUrl.hash) return null;
  } catch {
    return null;
  }
  const loc = canonicalPath(record.loc || record.url || "");
  if (!loc) return null;
  const parsed = new URL(loc);
  if (parsed.origin !== siteUrl || parsed.search || parsed.hash || EXCLUDED_PATHS.some((pattern) => pattern.test(parsed.pathname))) return null;
  const canonical = canonicalPath(record.canonical || loc);
  if (canonical !== loc) return null;
  const lastmod = normalizeLastmod(record.lastmod);
  if (!lastmod) return null;
  return {
    loc,
    lastmod,
    type: String(record.type || "pages"),
    fingerprint: String(record.fingerprint || sha256(`${loc}|${lastmod}`))
  };
}

function urlEntry(record) {
  return `  <url>\n    <loc>${escapeXml(record.loc)}</loc>\n    <lastmod>${escapeXml(record.lastmod)}</lastmod>\n  </url>`;
}

function sitemapXml(entries) {
  return `${XML_HEADER}\n${URLSET_OPEN}\n${entries.map(urlEntry).join("\n")}\n${URLSET_CLOSE}\n`;
}

export function validateSitemapXml(xml, expectedRoot = "urlset") {
  const value = String(xml || "");
  const rootOpen = expectedRoot === "sitemapindex" ? /<sitemapindex\b/ : /<urlset\b/;
  const rootClose = expectedRoot === "sitemapindex" ? /<\/sitemapindex>/ : /<\/urlset>/;
  if (!value.startsWith(XML_HEADER) || !rootOpen.test(value) || !rootClose.test(value)) return false;
  if (/<loc>[^<]*&(?!amp;|lt;|gt;|quot;|apos;)[^<]*<\/loc>/.test(value)) return false;
  if (expectedRoot === "urlset") return (value.match(/<url>/g) || []).length === (value.match(/<\/url>/g) || []).length;
  return (value.match(/<sitemap>/g) || []).length === (value.match(/<\/sitemap>/g) || []).length;
}

function splitEntries(entries, maxUrls, maxBytes) {
  const chunks = [];
  let current = [];
  let bytes = Buffer.byteLength(`${XML_HEADER}\n${URLSET_OPEN}\n\n${URLSET_CLOSE}\n`, "utf8");
  for (const entry of entries) {
    const entryBytes = Buffer.byteLength(`${urlEntry(entry)}\n`, "utf8");
    if (current.length && (current.length >= maxUrls || bytes + entryBytes > maxBytes)) {
      chunks.push(current);
      current = [];
      bytes = Buffer.byteLength(`${XML_HEADER}\n${URLSET_OPEN}\n\n${URLSET_CLOSE}\n`, "utf8");
    }
    current.push(entry);
    bytes += entryBytes;
  }
  if (current.length) chunks.push(current);
  return chunks;
}

function latestLastmod(entries) {
  return entries.reduce((latest, entry) => entry.lastmod > latest ? entry.lastmod : latest, "");
}

export function buildSitemapBundle(groupedRecords, options = {}) {
  const siteUrl = options.siteUrl || productionSiteUrl();
  const maxUrls = Number(options.maxUrls || DEFAULT_MAX_URLS);
  const maxBytes = Number(options.maxBytes || DEFAULT_MAX_BYTES);
  const files = [];
  const seen = new Set();
  const manifest = [];
  for (const type of ["pages", "products", "categories", "posts"]) {
    const normalized = (groupedRecords[type] || [])
      .map((record) => normalizeSitemapRecord({ ...record, type }, siteUrl))
      .filter(Boolean)
      .filter((record) => {
        if (seen.has(record.loc)) return false;
        seen.add(record.loc);
        return true;
      })
      .sort((a, b) => a.loc.localeCompare(b.loc));
    manifest.push(...normalized);
    const chunks = splitEntries(normalized, maxUrls, maxBytes);
    chunks.forEach((entries, index) => {
      const name = `${type}-${index + 1}.xml`;
      const xml = sitemapXml(entries);
      if (!validateSitemapXml(xml)) throw new Error(`Generated invalid XML for ${name}`);
      files.push({ name, type, entries, xml, bytes: Buffer.byteLength(xml, "utf8"), lastmod: latestLastmod(entries) });
    });
  }
  const indexRows = files.map((file) => `  <sitemap>\n    <loc>${escapeXml(`${siteUrl}/sitemaps/${file.name}`)}</loc>\n    <lastmod>${escapeXml(file.lastmod)}</lastmod>\n  </sitemap>`);
  const indexXml = `${XML_HEADER}\n${INDEX_OPEN}\n${indexRows.join("\n")}\n${INDEX_CLOSE}\n`;
  if (!validateSitemapXml(indexXml, "sitemapindex")) throw new Error("Generated invalid sitemap index XML");
  return {
    siteUrl,
    indexXml,
    files,
    manifest,
    totalUrls: manifest.length,
    split: files.some((file) => file.name.endsWith("-2.xml")),
    fingerprint: sha256(manifest.map((entry) => `${entry.loc}|${entry.lastmod}|${entry.fingerprint}`).join("\n"))
  };
}

function tagAttribute(html, tag, attribute) {
  const tags = String(html || "").match(new RegExp(`<${tag}\\b[^>]*>`, "gi")) || [];
  for (const value of tags) {
    const match = value.match(new RegExp(`${attribute}=["']([^"']+)["']`, "i"));
    if (match) return match[1];
  }
  return "";
}

function staticFileForPath(pathname) {
  const clean = normalize(decodeURIComponent(pathname).replace(/^[/\\]+/, ""));
  if (clean.startsWith("..") || clean.includes(`..${sep}`)) return null;
  return join(ROOT, clean, "index.html");
}

async function inspectStaticRoute(pathname, expectedUrl) {
  const file = staticFileForPath(pathname);
  if (!file) return { exists: false };
  try {
    const html = await readFile(file, "utf8");
    const linkTags = html.match(/<link\b[^>]*>/gi) || [];
    const canonicalTag = linkTags.find((tag) => /rel=["']canonical["']/i.test(tag));
    const canonical = canonicalTag ? tagAttribute(canonicalTag, "link", "href") : "";
    const metaTags = html.match(/<meta\b[^>]*>/gi) || [];
    const robotsTag = metaTags.find((tag) => /name=["']robots["']/i.test(tag));
    const robots = robotsTag ? tagAttribute(robotsTag, "meta", "content") : "";
    const incomplete = /local prototype|prepared for deployment|pending production|verified translation is pending/i.test(html);
    return {
      exists: true,
      canonicalSelf: canonicalPath(canonical) === canonicalPath(expectedUrl),
      noindex: /(^|[,\s])noindex([,\s]|$)/i.test(robots) || incomplete,
      fingerprint: sha256(html)
    };
  } catch {
    return { exists: false };
  }
}

async function readJsonFile(relativePath, fallback) {
  try {
    return JSON.parse((await readFile(join(ROOT, relativePath), "utf8")).replace(/^\uFEFF/, ""));
  } catch {
    return fallback;
  }
}

async function staticPageSeeds() {
  const xml = await readFile(join(ROOT, "sitemap.xml"), "utf8");
  return [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => match[1]);
}

function modelLastmod(item, fallback = "") {
  return normalizeLastmod(
    item.updatedAt || item.updated_at || item.lastSyncedAt || item.published_at || item.date || item.importedAt || item.createdAt || item.created_at,
    fallback
  );
}

async function staticRecord(pathname, lastmod, type, fingerprint = "") {
  const loc = canonicalPath(`${productionSiteUrl()}${pathname}`);
  const inspected = await inspectStaticRoute(pathname, loc);
  return {
    loc,
    canonical: loc,
    lastmod,
    type,
    public: inspected.exists,
    noindex: inspected.noindex,
    routeExists: inspected.exists && inspected.canonicalSelf,
    fingerprint: fingerprint || inspected.fingerprint
  };
}

export async function collectSitemapRecords() {
  const siteUrl = productionSiteUrl();
  const [products, categories, articles, dates, seeds] = await Promise.all([
    readDataJson("data/products/products.json", []),
    readDataJson("data/categories/categories.json", []),
    readDataJson("data/articles/articles.json", []),
    readJsonFile("data/seo/static-page-dates.json", {}),
    staticPageSeeds()
  ]);
  const pages = [];
  for (const seed of seeds) {
    let pathname = "";
    try {
      const parsed = new URL(seed);
      if (parsed.origin !== siteUrl || !parsed.pathname.startsWith("/en-za/")) continue;
      pathname = parsed.pathname;
    } catch {
      continue;
    }
    if (EXCLUDED_PATHS.some((pattern) => pattern.test(pathname))) continue;
    if (pathname.startsWith("/en-za/products/") || pathname.startsWith("/en-za/news/") || pathname.startsWith("/en-za/blog/")) continue;
    const pageDate = dates[pathname]?.lastmod || dates[pathname] || "2026-07-08T00:00:00.000Z";
    pages.push(await staticRecord(pathname, pageDate, "pages", dates[pathname]?.hash));
  }

  const productRecords = [];
  for (const product of products) {
    if (product.deletedAt || String(product.productStatus || "published").toLowerCase() !== "published") continue;
    const pathname = product.canonicalUrl || `/en-za/products/${product.categorySlug}/${product.slug}/`;
    productRecords.push(await staticRecord(pathname, modelLastmod(product, "2026-07-08"), "products", sha256(JSON.stringify(product))));
  }

  const categoryRecords = [await staticRecord("/en-za/products/", dates["/en-za/products/"]?.lastmod || "2026-07-08", "categories")];
  for (const category of categories) {
    if (category.deletedAt || ["disabled", "draft", "private"].includes(String(category.status || "active").toLowerCase())) continue;
    const pathname = category.canonicalUrl || `/en-za/products/${category.slug}/`;
    categoryRecords.push(await staticRecord(pathname, modelLastmod(category, "2026-07-08"), "categories", sha256(JSON.stringify(category))));
  }

  const publishedArticles = articles.filter((item) => isPublishedNewsArticle(item) || isPublishedBlogArticle(item));
  const postRecords = publishedArticles.map((item) => {
    const section = item.article_type === "blog" ? "blog" : "news";
    const loc = canonicalPath(`${siteUrl}/en-za/${section}/${item.slug}/`);
    return {
      loc,
      canonical: item.canonical_url ? canonicalPath(`${siteUrl}${item.canonical_url}`) : loc,
      lastmod: modelLastmod(item, "2026-07-08"),
      status: item.status || "published",
      type: "posts",
      fingerprint: sha256(JSON.stringify(item))
    };
  });
  for (const section of ["news", "blog"]) {
    const relevant = publishedArticles.filter((item) => (item.article_type === "blog" ? "blog" : "news") === section);
    const latest = latestLastmod(relevant.map((item) => ({ lastmod: modelLastmod(item, "2026-07-08") }))) || "2026-07-08T00:00:00.000Z";
    postRecords.push({ loc: `${siteUrl}/en-za/${section}/`, canonical: `${siteUrl}/en-za/${section}/`, lastmod: latest, type: "posts" });
  }
  return { pages, products: productRecords, categories: categoryRecords, posts: postRecords };
}

export async function generateSitemapBundle(options = {}) {
  const cacheMs = Number(options.cacheMs ?? 30_000);
  if (!options.force && cachedBundle && Date.now() < cachedBundleUntil) return cachedBundle;
  const bundle = buildSitemapBundle(await collectSitemapRecords(), options);
  cachedBundle = bundle;
  cachedBundleUntil = Date.now() + cacheMs;
  return bundle;
}

function manifestDiff(previous = [], current = []) {
  const before = new Map(previous.map((item) => [item.loc, item]));
  const after = new Map(current.map((item) => [item.loc, item]));
  return {
    added: current.filter((item) => !before.has(item.loc)).map((item) => item.loc),
    modified: current.filter((item) => before.has(item.loc) && (
      before.get(item.loc).lastmod !== item.lastmod || before.get(item.loc).fingerprint !== item.fingerprint
    )).map((item) => item.loc),
    deleted: previous.filter((item) => !after.has(item.loc)).map((item) => item.loc)
  };
}

export async function markSitemapDirty(event) {
  cachedBundle = undefined;
  cachedBundleUntil = 0;
  return writeDirtyState(event, { read: readDataJson, write: writeDataJson });
}

export async function atomicWriteXml(target, xml, options = {}) {
  if (!validateSitemapXml(xml, options.expectedRoot || "urlset")) throw new Error(`Invalid XML for ${target}`);
  await mkdir(dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
  const backup = `${target}.bak`;
  await writeFile(temporary, xml, "utf8");
  try {
    if (options.beforeCommit) await options.beforeCommit(temporary);
    try {
      await stat(target);
      await copyFile(target, backup);
    } catch {}
    await rename(temporary, target);
  } catch (error) {
    await unlink(temporary).catch(() => {});
    throw error;
  }
}

export async function writeSitemapBundle(bundle, outputDir) {
  await mkdir(outputDir, { recursive: true });
  await atomicWriteXml(join(outputDir, "sitemap.xml"), bundle.indexXml, { expectedRoot: "sitemapindex" });
  for (const file of bundle.files) await atomicWriteXml(join(outputDir, file.name), file.xml);
}

export async function runSitemapAudit(options = {}) {
  return withDataLock("cowinmagnet-sitemap", async () => {
    const startedAt = new Date();
    const previous = await readDataJson("data/seo/sitemap-manifest.json", { fingerprint: "", entries: [] });
    const bundle = await generateSitemapBundle(options);
    const diff = manifestDiff(previous?.entries || [], bundle.manifest);
    const changed = options.force || previous?.fingerprint !== bundle.fingerprint;
    let submission = { attempted: false, submitted: false, reason: "not-requested" };
    if (options.submit) {
      try {
        submission = await submitSitemapToSearchConsole({ sitemapUrl: `${bundle.siteUrl}/sitemap.xml` });
      } catch (error) {
        submission = { attempted: true, submitted: false, error: String(error?.message || error).slice(0, 500) };
      }
    }
    const finishedAt = new Date();
    const run = {
      id: `SITEMAP-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`,
      trigger: String(options.trigger || "manual"),
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      changed,
      dryRun: Boolean(options.dryRun),
      totalUrls: bundle.totalUrls,
      successfulUrls: bundle.totalUrls,
      skippedUrls: 0,
      errorCount: 0,
      files: bundle.files.map((file) => ({ name: file.name, urls: file.entries.length, bytes: file.bytes })),
      split: bundle.split,
      added: diff.added,
      modified: diff.modified,
      deleted: diff.deleted,
      searchConsole: submission
    };
    if (!options.dryRun) {
      if (options.outputDir) await writeSitemapBundle(bundle, options.outputDir);
      await writeDataJson("data/seo/sitemap-manifest.json", {
        generatedAt: finishedAt.toISOString(),
        fingerprint: bundle.fingerprint,
        entries: bundle.manifest
      });
      const runs = await readDataJson("data/seo/sitemap-runs.json", []);
      await writeDataJson("data/seo/sitemap-runs.json", [run, ...runs].slice(0, 200));
      const state = await readDataJson("data/seo/sitemap-state.json", {});
      await writeDataJson("data/seo/sitemap-state.json", {
        ...state,
        dirty: false,
        lastGeneratedAt: finishedAt.toISOString(),
        lastRunId: run.id,
        lastFingerprint: bundle.fingerprint,
        lastUrlCount: bundle.totalUrls,
        lastSubmission: submission
      });
    }
    return { run, bundle };
  }, { timeoutMs: Number(options.lockTimeoutMs || 15 * 60 * 1000) });
}
