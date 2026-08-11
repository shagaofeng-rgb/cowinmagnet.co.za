import crypto from "node:crypto";
import { mkdir, open, readFile, stat, unlink, writeFile } from "node:fs/promises";
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
const RELEASE_SNAPSHOT_PATHS = new Set(["articles/articles.json"]);

export class PersistentStorageError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = "PersistentStorageError";
    this.cause = cause;
  }
}

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

async function readBundledDataJson(relativePath, fallback) {
  try {
    const raw = await readFile(safeDataPath(relativePath), "utf8");
    return raw.trim() ? JSON.parse(raw.replace(/^\uFEFF/, "")) : fallback;
  } catch {
    return fallback;
  }
}

function recordKey(record, index) {
  if (!record || typeof record !== "object") return `index:${index}`;
  return String(record.id || record.slug || record.canonical_url || `index:${index}`);
}

function hasManualOverride(record) {
  return Boolean(record?.manualOverrideAt || record?.manual_override_at || record?.webhook_content_hash || record?.automation_published_at || record?.publication_run_id);
}

// Existing releases remain visible while explicit manual, webhook, or audited
// automation publications in PostgreSQL take precedence.
export function mergeReleaseSnapshot(releaseSnapshot, databaseSnapshot) {
  if (!Array.isArray(releaseSnapshot)) return databaseSnapshot ?? releaseSnapshot;
  if (!Array.isArray(databaseSnapshot)) return releaseSnapshot;

  const databaseByKey = new Map(databaseSnapshot.map((record, index) => [recordKey(record, index), record]));
  const seen = new Set();
  const merged = releaseSnapshot.map((record, index) => {
    const key = recordKey(record, index);
    seen.add(key);
    const databaseRecord = databaseByKey.get(key);
    return databaseRecord && hasManualOverride(databaseRecord) ? { ...record, ...databaseRecord } : record;
  });

  for (const [key, record] of databaseByKey) {
    if (!seen.has(key) && hasManualOverride(record)) merged.push(record);
  }
  return merged;
}

export async function readDataJson(relativePath, fallback) {
  const cleanPath = cleanDataPath(relativePath);
  if (RELEASE_SNAPSHOT_PATHS.has(cleanPath)) {
    const bundled = await readBundledDataJson(relativePath, fallback);
    try {
      return mergeReleaseSnapshot(bundled, await readDatabaseJson(relativePath));
    } catch (error) {
      const message = error?.message || String(error);
      if (databaseFailureMessages.get(relativePath) !== message) {
        databaseFailureMessages.set(relativePath, message);
        console.warn(`[content-store] Database read failed for ${relativePath}: ${message}`);
      }
      return bundled;
    }
  }

  try {
    const databaseValue = await readDatabaseJson(relativePath);
    if (databaseValue !== null) return databaseValue;
  } catch (error) {
    const message = error?.message || String(error);
    if (databaseFailureMessages.get(relativePath) !== message) {
      databaseFailureMessages.set(relativePath, message);
      console.warn(`[content-store] Database read failed for ${relativePath}: ${message}`);
    }
  }

  const bundled = await readBundledDataJson(relativePath, null);
  if (bundled !== null) return bundled;
  if (!process.env.VERCEL) return fallback;
  try {
    const raw = await readFile(safeWritableDataPath(relativePath), "utf8");
    return raw.trim() ? JSON.parse(raw.replace(/^\uFEFF/, "")) : fallback;
  } catch {
    return fallback;
  }
}

export async function writeDataJson(relativePath, value) {
  try {
    if (await writeDatabaseJson(relativePath, value)) return;
  } catch (error) {
    const message = error?.message || String(error);
    console.warn(`[content-store] Database write failed for ${relativePath}: ${message}`);
    if (process.env.VERCEL) {
      throw new PersistentStorageError("Persistent content storage is unavailable. No change was committed.", error);
    }
  }
  if (process.env.VERCEL) throw new PersistentStorageError("Persistent content storage is not configured. No change was committed.");
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

function hashText(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function absoluteUrl(value) {
  try {
    if (!value) return "";
    const url = new URL(value);
    if (!/^https?:$/.test(url.protocol)) return "";
    const host = url.hostname.toLowerCase();
    if (!host || host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) return "";
    if (/^(?:0|127)(?:\.\d{1,3}){3}$/.test(host) || /^10(?:\.\d{1,3}){3}$/.test(host) || /^192\.168(?:\.\d{1,3}){2}$/.test(host)) return "";
    return url.toString();
  } catch {
    return "";
  }
}

function isOwnedProductImage(value) {
  return /^\/assets\/images\/(?:source-products|products|generated)\//.test(String(value || ""));
}

export function isExternalNewsImage(value) {
  if (isOwnedProductImage(value) || String(value || "").startsWith("/assets/images/news/")) return true;
  const url = absoluteUrl(value);
  if (!url) return false;
  const parsed = new URL(url);
  const host = parsed.hostname.replace(/^www\./, "");
  return host !== "cowinmagnet.co.za" && host !== "cowinmagnet.com" && /\.(avif|webp|png|jpe?g)(?:$|[?#])/i.test(parsed.pathname + parsed.search);
}

export function isExternalEditorialImage(value) {
  const url = absoluteUrl(value);
  if (!url) return false;
  const parsed = new URL(url);
  const host = parsed.hostname.replace(/^www\./, "");
  return host !== "cowinmagnet.co.za" && host !== "cowinmagnet.com" && (
    /\.(avif|webp|png|jpe?g)(?:$|[?#])/i.test(parsed.pathname + parsed.search) ||
    /(^|\.)images\.(pexels|unsplash)\.com$/i.test(parsed.hostname)
  );
}

function isSourcedBlogImage(item) {
  const image = String(item.cover_image_url || "");
  return isExternalEditorialImage(image) || (
    image.startsWith("/assets/images/blog/") &&
    isExternalEditorialImage(item.cover_image_source_url || item.cover_image_page_url)
  );
}

export function isPublishedNewsArticle(item) {
  return (item.status || "published") === "published" &&
    (item.article_type === "news" || item.source_url || item.canonical_source_url) &&
    isExternalNewsImage(item.cover_image_url);
}

export function isPublishedBlogArticle(item) {
  return (item.status || "published") === "published" &&
    item.article_type === "blog" &&
    Boolean(item.content) &&
    isSourcedBlogImage(item);
}

export function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const internalEditorialHeading = /(?:seo\s*meta|seo\s*title|meta\s*description|url\s*slug|primary\s*keyword|secondary\s*keywords|search\s*intent|target\s*country|target\s*buyer|suggested\s*cta|ai\s*citation\s*ready\s*summary|internal\s*linking\s*suggestions|cms(?:\s+publishing)?\s*checklist)/i;

const articleUnsafeElements = /<(?:script|style|iframe|object|embed|form|input|button|textarea|select|svg|math)\b[^>]*>[\s\S]*?<\/(?:script|style|iframe|object|embed|form|input|button|textarea|select|svg|math)\s*>/gi;
const articleUnsafeVoidElements = /<(?:script|style|iframe|object|embed|form|input|button|textarea|select|svg|math)\b[^>]*\/?\s*>/gi;
const articleCodeBlocks = /(?:```[\s\S]*?```|<(?:pre|code)\b[^>]*>[\s\S]*?<\/(?:pre|code)\s*>)/gi;

function editorialHeadingText(value) {
  return String(value || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function isInternalEditorialHeading(value) {
  const heading = editorialHeadingText(value);
  return internalEditorialHeading.test(heading) || /^json-ld schema$/i.test(heading);
}

function removeInternalHeadingSections(value) {
  const html = String(value || "");
  const headings = [...html.matchAll(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi)];
  if (!headings.some((heading) => isInternalEditorialHeading(heading[1]))) return html;

  let cursor = 0;
  let cleaned = "";
  headings.forEach((heading, index) => {
    if (!isInternalEditorialHeading(heading[1])) return;
    cleaned += html.slice(cursor, heading.index);
    cursor = headings[index + 1]?.index ?? html.length;
  });
  return `${cleaned}${html.slice(cursor)}`;
}

/** Public articles may contain editorial HTML, but never executable markup or internal workflow notes. */
export function sanitizePublishedArticleHtml(value) {
  let html = stripInternalEditorialBlocks(value)
    .replace(articleCodeBlocks, "")
    .replace(articleUnsafeElements, "")
    .replace(articleUnsafeVoidElements, "");

  html = removeInternalHeadingSections(html)
    .replace(/\s+on[a-z0-9:_-]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s+style\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s+(href|src)\s*=\s*(["'])\s*(?:javascript|data):[\s\S]*?\2/gi, (_, attribute) => ` ${attribute}="#"`);

  return html.trim();
}

export function stripInternalEditorialBlocks(value) {
  let html = String(value || "").replace(/<section\b[^>]*>\s*<h[1-6][^>]*>\s*SEO\s*Meta\s*<\/h[1-6]>[\s\S]*?<\/section>\s*/gi, "");
  const headings = [...html.matchAll(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi)];
  const firstInternal = headings.findIndex((heading) => {
    const plainHeading = String(heading[1]).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    return internalEditorialHeading.test(plainHeading) || /^json-ld schema$/i.test(plainHeading);
  });
  if (firstInternal < 0) return html;
  const remainingAreInternal = headings.slice(firstInternal).every((heading) => {
    const plainHeading = String(heading[1]).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    return internalEditorialHeading.test(plainHeading) || /^json-ld schema$/i.test(plainHeading);
  });
  return remainingAreInternal ? html.slice(0, headings[firstInternal].index).trim() : html;
}
