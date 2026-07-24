import crypto from "node:crypto";
import { readFile, writeFile, mkdir, open, stat, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, normalize, sep } from "node:path";
import pg from "pg";

const root = process.cwd();
const dataRoot = join(root, "data");
const writableDataRoot = join(tmpdir(), "cowinmagnet-africa-data");
const { Pool } = pg;
let pool;
let schemaReady;
const activeLocks = new Set();
const databaseFailureMessages = new Map();
const GIT_BACKED_NEWS_PATHS = new Set([
  "articles/articles.json",
  "news/news-sources.json",
  "news/news-jobs.json",
  "news/news-publication-audits.json"
]);

export class PersistentStorageError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = "PersistentStorageError";
    this.cause = cause;
  }
}

const DEFAULT_SOURCES = [
  {
    id: "mining-com",
    domain: "mining.com",
    publisher_name: "MINING.com",
    source_type: "rss",
    rss_url: "https://www.mining.com/feed/",
    language: "en",
    country: "Global",
    credibility_score: 0.84,
    enabled: false,
    allowed_for_auto_publish: false
  },
  {
    id: "recycling-today",
    domain: "recyclingtoday.com",
    publisher_name: "Recycling Today",
    source_type: "rss",
    rss_url: "https://www.recyclingtoday.com/rss/",
    language: "en",
    country: "Global",
    credibility_score: 0.78,
    enabled: true,
    allowed_for_auto_publish: true
  },
  {
    id: "cement-products",
    domain: "cementproducts.com",
    publisher_name: "Cement Products",
    source_type: "rss",
    rss_url: "https://cementproducts.com/feed/",
    language: "en",
    country: "Global",
    credibility_score: 0.72,
    enabled: true,
    allowed_for_auto_publish: true
  },
  {
    id: "international-mining",
    domain: "im-mining.com",
    publisher_name: "International Mining",
    source_type: "rss",
    rss_url: "https://im-mining.com/feed/",
    language: "en",
    country: "Global",
    credibility_score: 0.8,
    enabled: true,
    allowed_for_auto_publish: true
  },
  {
    id: "canadian-mining-journal",
    domain: "canadianminingjournal.com",
    publisher_name: "Canadian Mining Journal",
    source_type: "rss",
    rss_url: "https://www.canadianminingjournal.com/feed/",
    language: "en",
    country: "Canada",
    credibility_score: 0.77,
    enabled: true,
    allowed_for_auto_publish: true
  }
];

const DEFAULT_SETTINGS = {
  dailyTarget: Number(process.env.NEWS_DAILY_TARGET || 4),
  timezone: process.env.NEWS_TIMEZONE || process.env.TIMEZONE || "Africa/Johannesburg",
  lookbackHours: Number(process.env.NEWS_LOOKBACK_HOURS || 72),
  dedupDays: Number(process.env.NEWS_DEDUP_DAYS || 7),
  relevanceThreshold: Number(process.env.NEWS_RELEVANCE_THRESHOLD || 0.18),
  autoPublish: String(process.env.NEWS_AUTO_PUBLISH || "true").toLowerCase() !== "false",
  maxRetries: Number(process.env.NEWS_MAX_RETRIES || 3)
};

const PRODUCT_KEYWORDS = [
  "magnet",
  "magnetic",
  "separator",
  "separation",
  "mining",
  "mine",
  "ore",
  "iron",
  "copper",
  "gold",
  "coal",
  "quarry",
  "aggregate",
  "cement",
  "crusher",
  "conveyor",
  "recycling",
  "metal",
  "ferrous",
  "tramp",
  "waste",
  "material handling",
  "processing"
];

const DIRECT_PRODUCT_RELATION = /\b(magnet(?:ic)?|separator|separation|conveyor|conveying|belt|crusher|screen(?:ing)?|tramp\s+(?:iron|metal)|ferrous|iron\s+remov(?:al|er)|recycl(?:ing|ed)|scrap|ore\s+sorting|beneficiation|bulk\s+handling)\b/i;

function cleanDataPath(relativePath) {
  const clean = normalize(relativePath.replace(/^data[\\/]/, ""));
  if (clean.startsWith("..") || clean.includes(`..${sep}`)) throw new Error("Invalid data path");
  return clean;
}

function safeDataPath(relativePath) {
  return join(dataRoot, cleanDataPath(relativePath));
}

function safeWritableDataPath(relativePath) {
  return join(writableDataRoot, cleanDataPath(relativePath));
}

export function isGitBackedNewsPath(relativePath) {
  return process.env.NEWS_STORAGE_MODE !== "database" && GIT_BACKED_NEWS_PATHS.has(cleanDataPath(relativePath));
}

async function readBundledDataJson(relativePath, fallback) {
  try {
    const raw = await readFile(safeDataPath(relativePath), "utf8");
    if (!raw.trim()) return fallback;
    return JSON.parse(raw.replace(/^\uFEFF/, ""));
  } catch {
    return fallback;
  }
}

function databaseConnectionString() {
  if (!process.env.DATABASE_URL) return "";
  try {
    const url = new URL(process.env.DATABASE_URL);
    url.searchParams.delete("ssl");
    url.searchParams.delete("sslmode");
    return url.toString();
  } catch {
    return process.env.DATABASE_URL;
  }
}

function getPool() {
  if (!process.env.DATABASE_URL) return null;
  if (!pool) {
    const connectionString = databaseConnectionString();
    pool = new Pool({
      connectionString,
      ssl: connectionString.includes("localhost") ? false : { rejectUnauthorized: false }
    });
  }
  return pool;
}

async function ensureDatabaseSchema() {
  const db = getPool();
  if (!db) return false;
  if (!schemaReady) {
    schemaReady = db.query(`
      CREATE TABLE IF NOT EXISTS africa_json_documents (
        path TEXT PRIMARY KEY,
        payload JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `).then(() => true);
  }
  return schemaReady;
}

async function readDatabaseJson(relativePath) {
  const db = getPool();
  if (!db) return null;
  await ensureDatabaseSchema();
  const result = await db.query("SELECT payload FROM africa_json_documents WHERE path = $1", [relativePath]);
  return result.rows[0]?.payload ?? null;
}

async function writeDatabaseJson(relativePath, value) {
  const db = getPool();
  if (!db) return false;
  await ensureDatabaseSchema();
  await db.query(
    `INSERT INTO africa_json_documents (path, payload, updated_at)
     VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (path) DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()`,
    [relativePath, JSON.stringify(value)]
  );
  return true;
}

export async function readDataJson(relativePath, fallback) {
  // Scheduled news is committed by GitHub Actions, then delivered with the Vercel build.
  // Prefer that durable release snapshot over the quota-limited generic JSON database.
  if (isGitBackedNewsPath(relativePath)) return readBundledDataJson(relativePath, fallback);
  try {
    const databaseValue = await readDatabaseJson(relativePath);
    if (databaseValue !== null) return databaseValue;
  } catch (error) {
    const message = error?.message || String(error);
    // A quota or network failure must not turn public news, feeds or sitemaps into 500 pages.
    if (databaseFailureMessages.get(relativePath) !== message) {
      databaseFailureMessages.set(relativePath, message);
      console.warn(`[news-store] Database read failed for ${relativePath}: ${message}`);
    }
  }
  const bundled = await readBundledDataJson(relativePath, null);
  if (bundled !== null) return bundled;
  if (!process.env.VERCEL) return fallback;
  try {
    const raw = await readFile(safeWritableDataPath(relativePath), "utf8");
    if (!raw.trim()) return fallback;
    return JSON.parse(raw.replace(/^\uFEFF/, ""));
  } catch {
    return fallback;
  }
}

export async function writeDataJson(relativePath, value) {
  try {
    if (await writeDatabaseJson(relativePath, value)) return;
  } catch (error) {
    const message = error?.message || String(error);
    console.warn(`[news-store] Database write failed for ${relativePath}: ${message}`);
    if (process.env.VERCEL) {
      throw new PersistentStorageError("Persistent news storage is unavailable. No publication was committed.", error);
    }
  }
  if (process.env.VERCEL) {
    throw new PersistentStorageError("Persistent news storage is not configured. No publication was committed.");
  }
  const filePath = safeDataPath(relativePath);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function withDataLock(name, callback, options = {}) {
  const timeoutMs = Number(options.timeoutMs || 15 * 60 * 1000);
  const db = getPool();
  if (db) {
    const client = await db.connect();
    try {
      const result = await client.query("SELECT pg_try_advisory_lock(hashtext($1)) AS acquired", [name]);
      if (!result.rows[0]?.acquired) throw new Error(`${name} is already running`);
      try {
        return await callback();
      } finally {
        await client.query("SELECT pg_advisory_unlock(hashtext($1))", [name]);
      }
    } finally {
      client.release();
    }
  }
  if (activeLocks.has(name)) throw new Error(`${name} is already running`);
  activeLocks.add(name);
  const lockPath = join(writableDataRoot, ".locks", `${hashText(name).slice(0, 24)}.lock`);
  await mkdir(dirname(lockPath), { recursive: true });
  let handle;
  try {
    try {
      handle = await open(lockPath, "wx");
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      const info = await stat(lockPath).catch(() => null);
      if (!info || Date.now() - info.mtimeMs <= timeoutMs) throw new Error(`${name} is already running`);
      await unlink(lockPath).catch(() => {});
      handle = await open(lockPath, "wx");
    }
    await handle.writeFile(JSON.stringify({ name, pid: process.pid, startedAt: new Date().toISOString() }));
    return await callback();
  } finally {
    await handle?.close().catch(() => {});
    await unlink(lockPath).catch(() => {});
    activeLocks.delete(name);
  }
}

export function hashText(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

export function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 88);
}

export function normalizeTitle(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&amp;/g, "and")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function canonicalizeUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return "";
    if (isBlockedHostname(url.hostname)) return "";
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|fbclid$|gclid$|mc_|yclid$|igshid$|ref$|ref_src$)/i.test(key)) url.searchParams.delete(key);
    }
    url.pathname = url.pathname.replace(/\/+$/, "/");
    return url.toString();
  } catch {
    return "";
  }
}

function xmlDecode(value = "") {
  return String(value)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_match, decimal) => String.fromCodePoint(Number.parseInt(decimal, 10)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tag(block, name) {
  const match = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "i"));
  return xmlDecode(match?.[1] || "");
}

function attrTag(block, tagName, attrName) {
  const match = block.match(new RegExp(`<${tagName}[^>]*${attrName}=["']([^"']+)["'][^>]*>`, "i"));
  return xmlDecode(match?.[1] || "");
}

function absoluteUrl(value, baseUrl) {
  try {
    if (!value) return "";
    const url = new URL(value, baseUrl || undefined);
    if (url.protocol !== "https:" && url.protocol !== "http:") return "";
    if (isBlockedHostname(url.hostname)) return "";
    return url.toString();
  } catch {
    return "";
  }
}

function isBlockedHostname(value) {
  const host = String(value || "").toLowerCase().replace(/^\[|\]$/g, "");
  if (!host || host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) return true;
  return /^(?:0|127)(?:\.\d{1,3}){3}$/.test(host) ||
    /^10(?:\.\d{1,3}){3}$/.test(host) ||
    /^192\.168(?:\.\d{1,3}){2}$/.test(host) ||
    /^172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}$/.test(host) ||
    host === "::1" || host.startsWith("fe80:") || host.startsWith("fc") || host.startsWith("fd");
}

function sourceUrlAllowed(value, source) {
  const url = absoluteUrl(value);
  if (!url || !source?.domain) return false;
  const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  const allowed = String(source.domain).toLowerCase().replace(/^www\./, "");
  return host === allowed || host.endsWith(`.${allowed}`);
}

export function isOwnedProductImage(value) {
  return /^\/assets\/images\/(?:source-products|products|generated)\//.test(String(value || ""));
}

export function isExternalNewsImage(value) {
  if (isOwnedProductImage(value)) return true;
  if (String(value || "").startsWith("/assets/images/news/")) return true;
  const url = absoluteUrl(value);
  if (!url) return false;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");
    if (host === "cowinmagnet.co.za" || host === "cowinmagnet.com") return false;
    return /^https?:$/.test(parsed.protocol) && /\.(avif|webp|png|jpe?g)(?:$|[?#])/i.test(parsed.pathname + parsed.search);
  } catch {
    return false;
  }
}

export function isExternalEditorialImage(value) {
  const url = absoluteUrl(value);
  if (!url) return false;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");
    if (host === "cowinmagnet.co.za" || host === "cowinmagnet.com") return false;
    return /^https?:$/.test(parsed.protocol) && (
      /\.(avif|webp|png|jpe?g)(?:$|[?#])/i.test(parsed.pathname + parsed.search) ||
      /(^|\.)images\.(pexels|unsplash)\.com$/i.test(parsed.hostname)
    );
  } catch {
    return false;
  }
}

function isSourcedBlogImage(item) {
  const image = String(item.cover_image_url || "");
  if (isExternalEditorialImage(image)) return true;
  return (
    image.startsWith("/assets/images/blog/") &&
    isExternalEditorialImage(item.cover_image_source_url || item.cover_image_page_url)
  );
}

export function isPublishedNewsArticle(item) {
  return (
    (item.status || "published") === "published" &&
    (item.article_type === "news" || item.source_url || item.canonical_source_url) &&
    isExternalNewsImage(item.cover_image_url)
  );
}

export function isPublishedBlogArticle(item) {
  return (
    (item.status || "published") === "published" &&
    item.article_type === "blog" &&
    Boolean(item.content) &&
    isSourcedBlogImage(item)
  );
}

function imageFromFeedBlock(block) {
  return (
    attrTag(block, "media:content", "url") ||
    attrTag(block, "media:thumbnail", "url") ||
    attrTag(block, "enclosure", "url") ||
    attrTag(block, "image", "href")
  );
}

function extractImageFromSourceHtml(html, baseUrl) {
  const patterns = [
    /<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url)?["']/i,
    /<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image(?::src)?["']/i,
    /"image"\s*:\s*"(https?:\/\/[^"]+\.(?:avif|webp|png|jpe?g)(?:\?[^"]*)?)"/i,
    /<img[^>]+src=["']([^"']+\.(?:avif|webp|png|jpe?g)(?:\?[^"']*)?)["']/i
  ];
  for (const pattern of patterns) {
    const match = String(html || "").match(pattern);
    const url = absoluteUrl(match?.[1], baseUrl);
    if (isExternalNewsImage(url)) return url;
  }
  return "";
}

async function imageResponds(url) {
  if (!isExternalNewsImage(url)) return false;
  const headers = { "user-agent": "CowinMagnetNewsBot/1.0 (+https://cowinmagnet.co.za)" };
  try {
    const head = await fetch(url, { method: "HEAD", headers, signal: AbortSignal.timeout(8000) });
    const type = head.headers.get("content-type") || "";
    if (head.ok && type.startsWith("image/")) return true;
  } catch {}
  try {
    const get = await fetch(url, { headers: { ...headers, range: "bytes=0-2048" }, signal: AbortSignal.timeout(8000) });
    const type = get.headers.get("content-type") || "";
    return get.ok && type.startsWith("image/");
  } catch {
    return false;
  }
}

export async function resolveCandidateImage(candidate, relatedProducts = []) {
  const product = relatedProducts.find((item) => isOwnedProductImage(item.image));
  if (!product) {
    return { url: "", sourceUrl: "", pageUrl: candidate.canonical_source_url || candidate.source_url, alt: "", status: "missing-owned-image" };
  }
  return {
    url: product.image,
    sourceUrl: product.url,
    pageUrl: product.url,
    alt: `Related Cowin Magnet product image: ${product.name}. This is not an image of the reported event.`,
    status: "owned-product-image"
  };
}

function parseFeed(xml, source) {
  const items = [];
  const itemBlocks = [...String(xml).matchAll(/<item\b[\s\S]*?<\/item>/gi)].map((match) => match[0]);
  const entryBlocks = [...String(xml).matchAll(/<entry\b[\s\S]*?<\/entry>/gi)].map((match) => match[0]);
  for (const block of itemBlocks) {
    items.push({
      source_title: tag(block, "title"),
      summary: tag(block, "description") || tag(block, "content:encoded"),
      source_url: tag(block, "link") || attrTag(block, "link", "href"),
      source_author: tag(block, "dc:creator") || tag(block, "author"),
      source_published_at: tag(block, "pubDate") || tag(block, "published") || tag(block, "updated"),
      source_language: source.language || "en",
      feed_image_url: imageFromFeedBlock(block)
    });
  }
  for (const block of entryBlocks) {
    items.push({
      source_title: tag(block, "title"),
      summary: tag(block, "summary") || tag(block, "content"),
      source_url: attrTag(block, "link", "href") || tag(block, "id"),
      source_author: tag(block, "name") || tag(block, "author"),
      source_published_at: tag(block, "published") || tag(block, "updated"),
      source_language: source.language || "en",
      feed_image_url: imageFromFeedBlock(block)
    });
  }
  return items
    .map((item) => normalizeCandidate(item, source))
    .filter((item) => item.source_title && item.canonical_source_url && item.source_published_at);
}

function normalizeCandidate(item, source) {
  const canonical = canonicalizeUrl(item.source_url);
  const published = new Date(item.source_published_at);
  const normalizedTitle = normalizeTitle(item.source_title);
  return {
    id: hashText(`${canonical}|${normalizedTitle}|${source.id}`).slice(0, 16),
    source_title: item.source_title,
    source_author: item.source_author || "",
    source_publisher: source.publisher_name || source.domain,
    source_url: item.source_url,
    canonical_source_url: canonical,
    source_language: item.source_language || source.language || "en",
    source_published_at: Number.isNaN(published.getTime()) ? "" : published.toISOString(),
    source_fetched_at: new Date().toISOString(),
    source_timezone: "source-provided",
    feed_image_url: absoluteUrl(item.feed_image_url, canonical),
    normalized_title: normalizedTitle,
    summary: sourceFactSummary(item.summary),
    credibility_score: Number(source.credibility_score || 0.5),
    source_id: source.id,
    source_domain: source.domain,
    source_fingerprint: hashText(`${canonical}|${normalizedTitle}`).slice(0, 32),
    content_hash: hashText(`${normalizedTitle}|${item.summary || ""}`).slice(0, 32),
    event_fingerprint: hashText(normalizedTitle.split(" ").slice(0, 12).join(" ")).slice(0, 32)
  };
}

function isRecentEnough(candidate, now, lookbackHours) {
  const published = new Date(candidate.source_published_at).getTime();
  return Number.isFinite(published) && now - published <= lookbackHours * 60 * 60 * 1000 && published <= now + 15 * 60 * 1000;
}

function sourceFactSummary(value) {
  const summary = xmlDecode(value)
    .replace(/\bthe post\s+.+?\s+appeared first on\s+.+?(?:\.|$)/i, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!summary || /[\uFFFD]/.test(summary)) return "";
  return summary.slice(0, 420);
}

function tokenSet(value) {
  return new Set(
    String(value || "")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length > 2)
  );
}

function overlapScore(a, b) {
  const aa = tokenSet(a);
  const bb = tokenSet(b);
  if (!aa.size || !bb.size) return 0;
  let hit = 0;
  for (const word of aa) if (bb.has(word)) hit += 1;
  return hit / Math.max(aa.size, 1);
}

export function scoreProducts(candidate, products) {
  const text = `${candidate.source_title} ${candidate.summary}`.toLowerCase();
  if (!DIRECT_PRODUCT_RELATION.test(text)) return [];
  const keywordHits = PRODUCT_KEYWORDS.filter((word) => text.includes(word)).length;
  return products
    .map((product) => {
      const productText = [
        product.name,
        product.category,
        product.categorySlug,
        product.shortDescription,
        ...(product.applications || []),
        ...(product.features || [])
      ].join(" ");
      const directHits = (productText.toLowerCase().match(DIRECT_PRODUCT_RELATION) || []).length;
      const score = Math.min(1, overlapScore(text, productText) + keywordHits * 0.02 + directHits * 0.02);
      return {
        product_id: product.productId || product.sourceProductId || product.slug,
        slug: product.slug,
        name: product.name,
        category: product.category,
        categorySlug: product.categorySlug,
        image: product.image || product.mainImage || "/assets/images/hero-mining-conveyor-magnet.webp",
        url: `/en-za/products/${product.categorySlug || "products"}/${product.slug}/`,
        relevance_score: Number(score.toFixed(3)),
        relationship_reason: `Related to ${product.category || "magnetic separation"} and African material handling applications.`
      };
    })
    .filter((item) => item.relevance_score > 0)
    .sort((a, b) => b.relevance_score - a.relevance_score)
    .slice(0, 3);
}

export function isDuplicate(candidate, articles, dedupDays, now = Date.now()) {
  const windowStart = now - dedupDays * 24 * 60 * 60 * 1000;
  return articles.some((article) => {
    const usedAt = new Date(article.first_used_at || article.published_at || article.date || 0).getTime();
    if (!Number.isFinite(usedAt) || usedAt < windowStart) return false;
    if (article.canonical_source_url && article.canonical_source_url === candidate.canonical_source_url) return true;
    if (article.source_fingerprint && article.source_fingerprint === candidate.source_fingerprint) return true;
    if (article.event_fingerprint && article.event_fingerprint === candidate.event_fingerprint) return true;
    return overlapScore(article.normalized_title || article.title, candidate.normalized_title) > 0.82;
  });
}

function pickCategory(candidate) {
  const text = `${candidate.source_title} ${candidate.summary}`.toLowerCase();
  if (/recycl|waste|scrap/.test(text)) return "Recycling";
  if (/cement|aggregate|quarry|limestone/.test(text)) return "Cement and Aggregates";
  if (/coal|power/.test(text)) return "Coal Handling";
  if (/copper|gold|iron|ore|mining|mine/.test(text)) return "Mining";
  return "Industry News";
}

export function createArticle(candidate, relatedProducts, settings = DEFAULT_SETTINGS) {
  const product = relatedProducts[0];
  const imageUrl = isOwnedProductImage(candidate.cover_image_url) ? candidate.cover_image_url : "";
  const titleBase = candidate.source_title.replace(/\s+/g, " ").trim();
  const title = `${titleBase}: Magnetic Separation View`;
  const slugBase = slugify(`${titleBase} ${new Date(candidate.source_published_at).toISOString().slice(0, 10)}`);
  const date = new Date().toISOString().slice(0, 10);
  const sourceDate = new Date(candidate.source_published_at).toISOString();
  const productLinks = relatedProducts.map((item) => `<a href="${item.url}">${escapeHtml(item.name)}</a>`).join(", ");
  const sourceSummary = candidate.summary || `The source headline is: ${candidate.source_title}. Please refer to the original publisher for reporting details.`;
  const content = [
    `<p><strong>Direct answer:</strong> This news is relevant to African buyers because it may influence mining, quarrying, cement, recycling or bulk material handling decisions where tramp metal control, crusher protection and magnetic separation equipment are part of plant reliability planning.</p>`,
    `<h2>Key Takeaways</h2><ul><li>The original source was published within the configured ${settings.lookbackHours}-hour news window.</li><li>The story is connected to Cowin Magnet products through material handling, separation, mining, cement, quarry or recycling context.</li><li>This article summarizes the public source and adds Cowin Magnet's equipment-selection perspective.</li><li>Buyers should verify site operating data before selecting magnetic separation equipment.</li></ul>`,
    `<h2>Original News Facts</h2><p>${escapeHtml(sourceSummary)}</p><p>The source publisher is ${escapeHtml(candidate.source_publisher)}. The original publication time recorded by this system is ${sourceDate}. This page does not reproduce the source article in full.</p>`,
    `<h2>Why This Matters for African Industrial Buyers</h2><p>Many African mining, quarry, cement and recycling sites operate with long conveyor lines, abrasive material, variable moisture and limited maintenance windows. A market or project development in these sectors can affect how buyers plan crusher protection, ferrous contamination control, plant uptime and equipment maintenance.</p>`,
    `<h2>Cowin Magnet View</h2><p>Our view is that news in mineral processing, bulk handling, cement production and recycling should be translated into practical operating questions: what material is being conveyed, where tramp metal can enter the line, how deep the burden is, and whether manual or self-cleaning separation is suitable. Those questions matter more than generic equipment labels.</p>`,
    `<h2>How We Can Help</h2><p>Cowin Magnet can support equipment selection for related applications using real operating data. Relevant products may include ${productLinks || "overband magnetic separators, suspended magnets, wet drum magnetic separators and metal detection equipment"} depending on the material stream and installation point.</p>`,
    `<h2>Related Products</h2><p>${productLinks || "Product matching will be confirmed after reviewing the application."}</p>`,
    `<h2>Information Source</h2><p>This article is based on public source information and independent analysis. Original reporting copyright belongs to the original publisher.</p>`
  ].join("\n");
  const excerpt = `${candidate.source_publisher} reported ${candidate.source_title}. Cowin Magnet explains why the development matters for African magnetic separation and material handling buyers.`;
  const keywords = [...new Set(["magnetic separator", "mining equipment", "crusher protection", product?.name, pickCategory(candidate)].filter(Boolean))];
  return {
    id: `NEWS-${hashText(candidate.source_fingerprint).slice(0, 12)}`,
    slug: slugBase,
    title,
    excerpt,
    summary: excerpt,
    content,
    article_type: "news",
    status: settings.autoPublish && imageUrl && relatedProducts.length ? "published" : "draft",
    language: "en-ZA",
    category: pickCategory(candidate),
    tags: keywords,
    cover_image_url: imageUrl,
    cover_image_source_url: candidate.cover_image_source_url || product?.url || "",
    cover_image_page_url: candidate.cover_image_page_url || product?.url || "",
    cover_image_alt: candidate.cover_image_alt || `Related Cowin Magnet product image: ${product?.name || "magnetic separation equipment"}. This is not an image of the reported event.`,
    cover_image_caption: `Related Cowin Magnet product image: ${product?.name || "magnetic separation equipment"}. It is shown for application context and does not depict the reported event.`,
    cover_image_status: candidate.cover_image_status || "owned-product-image",
    cover_image_fetched_at: candidate.cover_image_fetched_at || new Date().toISOString(),
    cover_image_hash: candidate.cover_image_hash || hashText(imageUrl).slice(0, 32),
    author_name: "Cowin Magnet South Africa",
    date,
    published_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    seo_title: title.slice(0, 65),
    seo_description: excerpt.slice(0, 155),
    seoTitle: title.slice(0, 65),
    seoDescription: excerpt.slice(0, 155),
    canonical_url: `/en-za/news/${slugBase}/`,
    primary_keyword: keywords[0],
    secondary_keywords: keywords.slice(1),
    geo_summary: `${candidate.source_publisher} reported a recent development related to ${pickCategory(candidate)}. Cowin Magnet connects the facts to African material handling and magnetic separation equipment selection.`,
    key_takeaways: [
      "Recent public source within 72 hours at collection time.",
      "Relevant to African industrial material handling buyers.",
      "Includes source facts, Cowin Magnet analysis and related products.",
      "Links users to real Cowin Magnet product pages."
    ],
    source_title: candidate.source_title,
    source_author: candidate.source_author,
    source_publisher: candidate.source_publisher,
    sourceUrl: candidate.source_url,
    source_url: candidate.source_url,
    canonical_source_url: candidate.canonical_source_url,
    source_language: candidate.source_language,
    source_published_at: candidate.source_published_at,
    source_fetched_at: candidate.source_fetched_at,
    source_timezone: candidate.source_timezone,
    source_fingerprint: candidate.source_fingerprint,
    event_fingerprint: candidate.event_fingerprint,
    content_hash: candidate.content_hash,
    normalized_title: candidate.normalized_title,
    first_used_at: new Date().toISOString(),
    relevance_score: relatedProducts[0]?.relevance_score || 0,
    credibility_score: candidate.credibility_score,
    generation_model: "deterministic-fact-summary-v2",
    generation_prompt_version: "news-v2",
    related_products: relatedProducts,
    product_ids: relatedProducts.map((item) => item.product_id),
    created_at: new Date().toISOString()
  };
}

export function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function collectNewsCandidates(settings = DEFAULT_SETTINGS) {
  const sources = await readDataJson("data/news/news-sources.json", DEFAULT_SOURCES);
  const enabledSources = sources.filter((source) => source.enabled && source.allowed_for_auto_publish && source.rss_url);
  const candidates = [];
  const errors = [];
  const sourceHealth = [];
  for (const source of enabledSources) {
    try {
      if (!sourceUrlAllowed(source.rss_url, source)) throw new Error("Source URL is outside its configured domain allowlist");
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12000);
      const res = await fetch(source.rss_url, {
        headers: { "user-agent": "CowinMagnetNewsBot/1.0 (+https://cowinmagnet.co.za)" },
        signal: controller.signal,
        redirect: "error"
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const contentLength = Number(res.headers.get("content-length") || 0);
      if (contentLength > 2_000_000) throw new Error("RSS response exceeds 2 MB limit");
      const buffer = await res.arrayBuffer();
      if (buffer.byteLength > 2_000_000) throw new Error("RSS response exceeds 2 MB limit");
      const parsed = parseFeed(Buffer.from(buffer).toString("utf8"), source)
        .filter((candidate) => sourceUrlAllowed(candidate.canonical_source_url, source));
      candidates.push(...parsed);
      sourceHealth.push({ id: source.id, ok: true, fetched_at: new Date().toISOString(), candidate_count: parsed.length });
    } catch (error) {
      const message = error?.message || String(error);
      errors.push({ source: source.id, error: message });
      sourceHealth.push({ id: source.id, ok: false, fetched_at: new Date().toISOString(), error: message });
    }
  }
  const now = Date.now();
  return {
    candidates: candidates.filter((candidate) => isRecentEnough(candidate, now, settings.lookbackHours)),
    errors,
    sourceHealth,
    sources
  };
}

function dayKey(value, timezone) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(value));
}

function applySourceHealth(sources, sourceHealth) {
  const results = new Map(sourceHealth.map((item) => [item.id, item]));
  return sources.map((source) => {
    const health = results.get(source.id);
    if (!health) return source;
    if (health.ok) {
      return { ...source, last_fetched_at: health.fetched_at, last_success_at: health.fetched_at, failure_count: 0, last_error: "" };
    }
    return {
      ...source,
      last_fetched_at: health.fetched_at,
      failure_count: Number(source.failure_count || 0) + 1,
      last_error: health.error
    };
  });
}

async function sendNewsAlert(payload) {
  const endpoint = String(process.env.NEWS_ALERT_WEBHOOK_URL || "").trim();
  if (!endpoint) return { delivered: false, reason: "No NEWS_ALERT_WEBHOOK_URL configured" };
  const url = absoluteUrl(endpoint);
  if (!url || !url.startsWith("https://")) return { delivered: false, reason: "Alert webhook must use HTTPS" };
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": "CowinMagnetNewsBot/1.0" },
      body: JSON.stringify({ service: "cowinmagnet.co.za news automation", occurred_at: new Date().toISOString(), ...payload }),
      signal: AbortSignal.timeout(8000),
      redirect: "error"
    });
    return { delivered: response.ok, status: response.status };
  } catch (error) {
    return { delivered: false, reason: error?.message || String(error) };
  }
}

export async function runNewsAutomation(options = {}) {
  const settings = { ...DEFAULT_SETTINGS, ...options };
  const startedAt = new Date().toISOString();
  const [articles, products] = await Promise.all([
    readDataJson("data/articles/articles.json", []),
    readDataJson("data/products/products.json", [])
  ]);
  const today = dayKey(new Date(), settings.timezone);
  const publishedToday = articles.filter((item) => isPublishedNewsArticle(item) && dayKey(item.published_at || item.date, settings.timezone) === today);
  const need = Math.max(0, settings.dailyTarget - publishedToday.length);
  const job = {
    id: `JOB-${Date.now()}-${hashText(startedAt).slice(0, 6)}`,
    job_type: "daily-news-publish",
    status: "running",
    scheduled_at: startedAt,
    started_at: startedAt,
    retry_count: 0,
    metadata: { target: settings.dailyTarget, publishedToday: publishedToday.length, need }
  };
  const jobs = await readDataJson("data/news/news-jobs.json", []);
  jobs.unshift(job);
  try {
    await writeDataJson("data/news/news-jobs.json", jobs.slice(0, 500));
  } catch (error) {
    job.status = "blocked";
    job.completed_at = new Date().toISOString();
    job.error_message = error instanceof PersistentStorageError ? error.message : "Unable to create a durable news job record.";
    await sendNewsAlert({ severity: "critical", type: "news-storage-unavailable", message: job.error_message, target: settings.dailyTarget, published_today: publishedToday.length });
    return { published: [], need, errors: [{ source: "storage", error: job.error_message }], job };
  }
  if (!need) {
    job.status = "completed";
    job.completed_at = new Date().toISOString();
    job.metadata.message = "Daily target already met";
    await finishJob(job);
    await auditDay(today, settings, articles);
    return { published: [], need: 0, errors: [], job };
  }
  const { candidates, errors, sourceHealth, sources } = await collectNewsCandidates(settings);
  await writeDataJson("data/news/news-sources.json", applySourceHealth(sources, sourceHealth));
  const newArticles = [];
  let missingImages = 0;
  const rejected = { duplicate: 0, low_relevance: 0, missing_owned_image: 0 };
  for (const candidate of candidates) {
    if (newArticles.length >= need) break;
    if (isDuplicate(candidate, [...articles, ...newArticles], settings.dedupDays)) {
      rejected.duplicate += 1;
      continue;
    }
    const related = scoreProducts(candidate, products);
    if (!related.length || related[0].relevance_score < settings.relevanceThreshold) {
      rejected.low_relevance += 1;
      continue;
    }
    const resolvedImage = await resolveCandidateImage(candidate, related);
    if (!resolvedImage.url) {
      missingImages += 1;
      rejected.missing_owned_image += 1;
      continue;
    }
    const candidateWithImage = {
      ...candidate,
      cover_image_url: resolvedImage.url,
      cover_image_source_url: resolvedImage.sourceUrl,
      cover_image_page_url: resolvedImage.pageUrl,
      cover_image_alt: resolvedImage.alt,
      cover_image_status: resolvedImage.status,
      cover_image_fetched_at: new Date().toISOString(),
      cover_image_hash: hashText(resolvedImage.url).slice(0, 32)
    };
    const article = createArticle(candidateWithImage, related, settings);
    let slug = article.slug;
    let suffix = 2;
    while ([...articles, ...newArticles].some((item) => item.slug === slug)) slug = `${article.slug}-${suffix++}`;
    article.slug = slug;
    article.canonical_url = `/en-za/news/${slug}/`;
    newArticles.push(article);
  }
  const updatedArticles = [...newArticles, ...articles];
  if (newArticles.length) await writeDataJson("data/articles/articles.json", updatedArticles);
  job.status = newArticles.length >= need ? "completed" : "failed";
  job.completed_at = new Date().toISOString();
  job.error_message = newArticles.length >= need ? "" : `Published ${newArticles.length} of ${need} required articles`;
  job.metadata = { ...job.metadata, collected: candidates.length, published: newArticles.length, missingImages, sourceErrors: errors, sourceHealth, rejected };
  await finishJob(job);
  const audit = await auditDay(today, settings, updatedArticles);
  if (audit.status !== "complete" || errors.length) {
    await sendNewsAlert({ severity: audit.status === "complete" ? "warning" : "critical", type: audit.status === "complete" ? "news-source-health" : "news-daily-target-missed", date: today, target: settings.dailyTarget, published: audit.published_count, source_errors: errors.map((item) => item.source) });
  }
  return { published: newArticles, need, errors, job };
}

async function finishJob(job) {
  const jobs = await readDataJson("data/news/news-jobs.json", []);
  const index = jobs.findIndex((item) => item.id === job.id);
  if (index >= 0) jobs[index] = job;
  else jobs.unshift(job);
  await writeDataJson("data/news/news-jobs.json", jobs.slice(0, 500));
}

async function auditDay(date, settings, articles) {
  const published = articles.filter((item) => isPublishedNewsArticle(item) && dayKey(item.published_at || item.date, settings.timezone) === date);
  const audits = await readDataJson("data/news/news-publication-audits.json", []);
  const record = {
    id: `AUDIT-${date}`,
    date,
    timezone: settings.timezone,
    target_count: settings.dailyTarget,
    published_count: published.length,
    missing_count: Math.max(0, settings.dailyTarget - published.length),
    status: published.length >= settings.dailyTarget ? "complete" : "missing",
    checked_at: new Date().toISOString()
  };
  const existing = audits.findIndex((item) => item.id === record.id);
  if (existing >= 0) audits[existing] = record;
  else audits.unshift(record);
  await writeDataJson("data/news/news-publication-audits.json", audits.slice(0, 370));
  return record;
}

export async function getNewsState() {
  const [articles, sources, jobs, audits] = await Promise.all([
    readDataJson("data/articles/articles.json", []),
    readDataJson("data/news/news-sources.json", DEFAULT_SOURCES),
    readDataJson("data/news/news-jobs.json", []),
    readDataJson("data/news/news-publication-audits.json", [])
  ]);
  return { settings: DEFAULT_SETTINGS, articles, sources, jobs, audits };
}
