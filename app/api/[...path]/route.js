import crypto from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, normalize, sep } from "node:path";
import pg from "pg";
import { cookies, headers } from "next/headers";
import { after, NextResponse } from "next/server";
import { readDataJson, writeDataJson, withDataLock, isPublishedBlogArticle, isPublishedNewsArticle, sanitizePublishedArticleHtml } from "../../lib/news-system.js";
import { googleSeoConfig, inspectGoogleUrls, runGoogleSeoSync } from "../../lib/google-seo-sync.js";
import { markSitemapDirty, productionSiteUrl, runSitemapAudit } from "../../lib/sitemap-system.js";
import { newsAutomationStatus, queueNewsSource, reviewNewsDraft, runNewsAutomation } from "../../lib/news-automation.js";
import { analyticsHealth, getAnalyticsExclusionRules, getAnalyticsReport, getAnalyticsVisitorJourney, recordAnalyticsEvent, saveAnalyticsExclusionRule, updateAnalyticsVisitor } from "../../lib/analytics-system.js";
import { ADMIN_TIMEZONE, InvalidDateRangeError, reportDateBounds } from "../../lib/admin-date-range.js";
import { ENQUIRIES_PATH, EnquiryError, enquiryAttachment, expireEnquiryUploads, readUploadPart, saveEnquiry, saveUploadPart, startEnquiryUpload, updateEnquiry } from "../../lib/enquiry-store.js";
import { enquiryMailConfigured, notificationDue, processEnquiryNotification, queuedNotification } from "../../lib/enquiry-notifications.js";
import { EDITORIAL_PATH, editorialLimits, updateProductEditorial } from "../../lib/product-editorial.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const root = process.cwd();
const dataRoot = join(root, "data");
const writableDataRoot = join(tmpdir(), "cowinmagnet-africa-data");
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
const adminEmail = (process.env.ADMIN_EMAIL || process.env.ADMIN_USER || "info@cowinmagnet.com").trim().toLowerCase();
const adminUser = process.env.ADMIN_USER || adminEmail;
const adminLoginAliases = [...new Set([
  adminEmail,
  adminUser,
  ...String(process.env.ADMIN_LOGIN_ALIASES || "").split(","),
  // The established main-site administrator remains a valid identity for the
  // Africa property while both sites use the same managed administrator.
  "davidsha@cowinmagnet.com",
  "info@cowinmagnet.com"
].map((value) => String(value || "").trim().toLowerCase()).filter(Boolean))];
const { Pool } = pg;
let pool;
let schemaReady;
const enquiryRateWindowMs = 60 * 1000;
const enquiryRateLimit = 8;
const recentEnquiryRequests = new Map();

function enquiryRequestKey(request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0];
  return String(forwarded || request.headers.get("x-real-ip") || "unknown").trim().slice(0, 128);
}

function enquiryRateLimitExceeded(request) {
  const key = enquiryRequestKey(request);
  const now = Date.now();
  const active = (recentEnquiryRequests.get(key) || []).filter((time) => now - time < enquiryRateWindowMs);
  active.push(now);
  recentEnquiryRequests.set(key, active);
  return active.length > enquiryRateLimit;
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
    `).then(() => true).catch((error) => {
      schemaReady = undefined;
      throw error;
    });
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

async function enquiryPool() {
  const db = getPool();
  if (!db) throw new EnquiryError(503, "Enquiry storage is temporarily unavailable. Please contact us by email or WhatsApp.");
  await ensureDatabaseSchema();
  return db;
}

async function readEnquiryItems() {
  if (!getPool()) {
    if (process.env.VERCEL) throw new EnquiryError(503, "Enquiry storage is temporarily unavailable.");
    return readJson(ENQUIRIES_PATH);
  }
  const items = await readDatabaseJson(ENQUIRIES_PATH);
  if (items === null) return readJson(ENQUIRIES_PATH);
  if (!Array.isArray(items)) throw new Error("Unexpected enquiries document");
  return items;
}

function storageMode() {
  return getPool() ? "database" : (process.env.VERCEL ? "vercel-tmp" : "local-file");
}

function sessionSecret() {
  return (
    process.env.ADMIN_JWT_SECRET ||
    process.env.ADMIN_SESSION_SECRET ||
    process.env.ADMIN_PASSWORD_HASH ||
    process.env.ADMIN_PASSWORD ||
    process.env.ADMIN_DEFAULT_PASSWORD ||
    ""
  );
}

const jsonFiles = new Map([
  ["data/cms/enquiries.json", []],
  ["data/cms/audit-logs.json", []],
  ["data/cms/analytics-events.json", []],
  ["data/cms/users.json", [
    { id: "USR-admin", email: adminEmail, name: "David Sha", role: "Super Admin", status: "active", lastLoginAt: "", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
  ]],
  ["data/cms/roles.json", [
    { id: "ROLE-super-admin", name: "Super Admin", description: "Full access to all admin modules.", permissions: ["*"], status: "active" },
    { id: "ROLE-admin", name: "Admin", description: "Manage content, enquiries, SEO data and sync tasks.", permissions: ["dashboard:view", "products:*", "categories:*", "news:*", "forms:*", "analytics:view", "seo:*", "media:*", "sync:*", "logs:view", "settings:view"], status: "active" },
    { id: "ROLE-editor", name: "Editor", description: "Maintain products, categories, news and media assets.", permissions: ["products:view", "products:edit", "categories:view", "categories:edit", "news:*", "media:*"], status: "active" },
    { id: "ROLE-sales", name: "Sales", description: "View and follow up customer enquiry forms.", permissions: ["forms:*", "products:view", "analytics:view"], status: "active" },
    { id: "ROLE-readonly", name: "Viewer", description: "Read-only access to content and reports.", permissions: ["dashboard:view", "products:view", "categories:view", "news:view", "analytics:view", "seo:view"], status: "active" }
  ]],
  ["data/media/assets.json", []],
  ["data/seo/google-search-console.json", null],
  ["data/seo/google-seo-jobs.json", []],
  ["data/cms/settings.json", {
    companyName: "Quzhou Qiying Import & Export Co., Ltd.",
    brandName: "Cowinmagnet",
    globalWebsite: "https://www.cowinmagnet.com",
    africaWebsite: "https://cowinmagnet.co.za/en-za/",
    email: "info@cowinmagnet.com",
    whatsapp: "+86 156 6513 5205",
    defaultLanguage: "en-za",
    supportedLanguages: ["en-za", "af-za", "zu-za", "xh-za", "st-za", "tn-za"],
    marketCoverage: ["South Africa", "Botswana", "Namibia", "Zimbabwe", "Zambia", "Mozambique", "Angola", "Ghana", "Nigeria", "Kenya", "Tanzania", "Democratic Republic of the Congo"],
    updatedAt: new Date().toISOString()
  }]
]);
function response(data, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: {
      "cache-control": "no-store",
      "x-robots-tag": "noindex, nofollow"
    }
  });
}

function token(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}

function hash(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function slugifyAdmin(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function listParams(request) {
  const url = new URL(request.url);
  const page = Math.max(1, Math.min(100000, Number.parseInt(url.searchParams.get("page"), 10) || 1));
  const pageSize = Math.min(100, Math.max(20, Number.parseInt(url.searchParams.get("pageSize") || url.searchParams.get("limit"), 10) || 20));
  const q = String(url.searchParams.get("q") || "").trim().toLowerCase();
  const status = String(url.searchParams.get("status") || "").trim().toLowerCase();
  const sort = String(url.searchParams.get("sort") || "updatedAt");
  const dir = String(url.searchParams.get("dir") || "desc").toLowerCase() === "asc" ? "asc" : "desc";
  const range = ["all", "today", "7d", "15d", "week", "month", "custom"].includes(String(url.searchParams.get("range") || "all")) ? String(url.searchParams.get("range") || "all") : "all";
  const from = String(url.searchParams.get("from") || "").trim();
  const to = String(url.searchParams.get("to") || "").trim();
  const timeField = String(url.searchParams.get("timeField") || "").trim();
  return { page, pageSize, q, status, sort, dir, range, from, to, timeField };
}

function itemTimestamp(item, fields) {
  for (const field of fields) {
    const value = item?.[field];
    const timestamp = Date.parse(value || "");
    if (!Number.isNaN(timestamp)) return timestamp;
  }
  return null;
}

function filterList(items, request, options = {}) {
  const params = listParams(request);
  const searchFields = options.searchFields || [];
  const statusField = options.statusField || "status";
  const dateFields = options.dateFields || ["updatedAt", "updated_at", "createdAt", "created_at", "submissionTime", "publishedAt", "published_at", "date", "time"];
  const selectedDateFields = params.timeField && dateFields.includes(params.timeField) ? [params.timeField] : dateFields;
  const bounds = reportDateBounds(params.range, params.from, params.to);
  let rows = Array.isArray(items) ? [...items] : [];
  if (!options.includeDeleted) rows = rows.filter((item) => !item.deletedAt);
  if (params.q) rows = rows.filter((item) => searchFields.some((field) => String(item?.[field] || "").toLowerCase().includes(params.q)));
  if (params.status) rows = rows.filter((item) => String(item?.[statusField] || "").toLowerCase() === params.status);
  if (bounds) rows = rows.filter((item) => {
    const timestamp = itemTimestamp(item, selectedDateFields);
    return timestamp !== null && timestamp >= bounds.from && timestamp < bounds.before;
  });
  rows.sort((a, b) => {
    const av = String(a?.[params.sort] ?? a?.updatedAt ?? a?.createdAt ?? a?.submissionTime ?? a?.publishedAt ?? a?.time ?? "");
    const bv = String(b?.[params.sort] ?? b?.updatedAt ?? b?.createdAt ?? b?.submissionTime ?? b?.publishedAt ?? b?.time ?? "");
    return params.dir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
  });
  return { rows, params, dateFields: selectedDateFields };
}

function paginate(items, request, options = {}) {
  const { rows, params, dateFields } = filterList(items, request, options);
  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / params.pageSize));
  const page = Math.min(params.page, totalPages);
  const start = (page - 1) * params.pageSize;
  return {
    items: rows.slice(start, start + params.pageSize),
    page,
    pageSize: params.pageSize,
    total,
    totalPages,
    filters: { range: params.range, from: params.from, to: params.to, timeField: params.timeField, dateFields }
  };
}

function csvResponse(filename, rows) {
  const keys = [...new Set((rows || []).flatMap((row) => Object.keys(row || {}).filter((key) => typeof row[key] !== "object")))];
  const cell = (value) => {
    const text = String(value ?? "");
    const safe = typeof value === "string" && /^[\s\uFEFF]*[=+\-@\r\n\t]/.test(text) ? "'" + text : text;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  const csv = [keys.map(cell).join(","), ...(rows || []).map((row) => keys.map((key) => cell(row[key])).join(","))].join("\r\n");
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "cache-control": "private, no-store",
      "content-disposition": `attachment; filename="${filename}"`,
      "x-robots-tag": "noindex, nofollow"
    }
  });
}

function hashAdminPassword(password) {
  return hash(`${password}:${sessionSecret()}`);
}

function isAdminAuthConfigured() {
  return Boolean(process.env.ADMIN_PASSWORD_HASH || process.env.ADMIN_PASSWORD || process.env.ADMIN_DEFAULT_PASSWORD);
}

function passwordVariants(password) {
  return [String(password || "")];
}
function verifyAdminCredentials(identifier, password) {
  const normalized = String(identifier || "").trim().toLowerCase();
  const validIdentity = adminLoginAliases.includes(normalized);
  if (!validIdentity || !password || !isAdminAuthConfigured()) return false;

  const variants = passwordVariants(password);
  const expectedHash = process.env.ADMIN_PASSWORD_HASH;
  if (expectedHash) return variants.some((item) => hashAdminPassword(item) === expectedHash);
  if (process.env.ADMIN_PASSWORD) return variants.includes(process.env.ADMIN_PASSWORD);
  if (process.env.ADMIN_DEFAULT_PASSWORD) return variants.includes(process.env.ADMIN_DEFAULT_PASSWORD);
  return false;
}

async function readJson(relativePath) {
  const cleanPath = normalize(relativePath.replace(/^data[\\/]/, ""));
  if (cleanPath.startsWith("..") || cleanPath.includes(`..${sep}`)) return jsonFiles.get(relativePath) ?? null;
  // Published News and Blog content is read from the release snapshot unless a
  // verified manual or webhook update exists in PostgreSQL.
  if (cleanPath === "articles/articles.json" && process.env.NEWS_STORAGE_MODE !== "database") {
    return readDataJson(relativePath, jsonFiles.get(relativePath) ?? []);
  }
  try {
    const databaseValue = await readDatabaseJson(relativePath);
    if (databaseValue !== null) return databaseValue;
  } catch (error) {
    console.warn(`[africa-json-store] Database read failed for ${relativePath}: ${error?.message || error}`);
  }
  const writablePath = join(writableDataRoot, cleanPath);
  const filePath = join(dataRoot, cleanPath);
  try {
    const raw = (await readFile(writablePath, "utf8")).replace(/^\uFEFF/, "");
    if (raw.trim()) return JSON.parse(raw);
  } catch {}
  try {
    const raw = (await readFile(filePath, "utf8")).replace(/^\uFEFF/, "");
    if (!raw.trim()) return jsonFiles.get(relativePath) ?? null;
    return JSON.parse(raw);
  } catch {
    const fallback = jsonFiles.get(relativePath);
    return Array.isArray(fallback) ? [] : fallback ?? null;
  }
}

async function writeJson(relativePath, value) {
  const cleanPath = normalize(relativePath.replace(/^data[\\/]/, ""));
  if (cleanPath.startsWith("..") || cleanPath.includes(`..${sep}`)) throw new Error("Invalid data path");
  try {
    if (await writeDatabaseJson(relativePath, value)) return;
  } catch (error) {
    console.warn(`[africa-json-store] Database write failed for ${relativePath}: ${error?.message || error}`);
  }
  // Serverless temporary storage disappears between invocations. Returning a
  // successful admin response after writing there would falsely imply that a
  // production change was durable.
  if (process.env.VERCEL) throw new Error("Persistent storage is unavailable. No change was committed.");
  const filePath = join(dataRoot, cleanPath);
  const payload = `${JSON.stringify(value, null, 2)}\n`;
  try {
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, payload, "utf8");
    return;
  } catch (error) {
    if (!["EROFS", "EACCES", "EPERM"].includes(error?.code)) throw error;
  }
  const writablePath = join(writableDataRoot, cleanPath);
  await mkdir(dirname(writablePath), { recursive: true });
  await writeFile(writablePath, payload, "utf8");
}

function scheduleSitemapAudit(event) {
  after(async () => {
    try {
      await markSitemapDirty(event);
      await runSitemapAudit({ trigger: "content-change" });
    } catch (error) {
      console.error(`[sitemap] content-change audit failed: ${error?.message || error}`);
    }
  });
}

async function bodyJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function pluginResponse(code, msg, status = 200) {
  return NextResponse.json({ code, msg }, {
    status,
    headers: {
      "cache-control": "no-store",
      "x-robots-tag": "noindex, nofollow"
    }
  });
}

function operationalLog(event, fields = {}) {
  // Keep production logs useful for incident review without exposing request bodies or secrets.
  console.info(JSON.stringify({ event, at: new Date().toISOString(), ...fields }));
}

async function bodyFields(request) {
  const type = request.headers.get("content-type") || "";
  if (type.includes("application/json")) {
    const body = await bodyJson(request);
    return Object.fromEntries(Object.entries(body || {}).map(([key, value]) => [key, String(value ?? "")]));
  }
  if (type.includes("multipart/form-data") || type.includes("application/x-www-form-urlencoded")) {
    try {
      const form = await request.formData();
      return Object.fromEntries([...form.entries()].map(([key, value]) => [key, typeof value === "string" ? value : value.name || ""]));
    } catch {
      return {};
    }
  }
  const text = await request.text().catch(() => "");
  if (!text) return {};
  try {
    const parsed = JSON.parse(text);
    return Object.fromEntries(Object.entries(parsed || {}).map(([key, value]) => [key, String(value ?? "")]));
  } catch {
    return Object.fromEntries(new URLSearchParams(text).entries());
  }
}

function safeEqualText(a, b) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function validCoverImage(value) {
  const url = String(value || "").trim();
  return /^\/assets\/images\/[a-z0-9_./-]+$/i.test(url) ? url : "";
}

function articleWebhookSign() {
  return String(process.env.WEBHOOK_ARTICLE_SIGN || "");
}

function plainText(value) {
  return String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isVerificationOnly(fields) {
  const title = plainText(fields.title);
  const content = plainText(fields.content);
  if (!title || !content) return true;
  if (content.length < 20) return true;
  return /^(test|testing|demo|placeholder|验证|测试)$/i.test(title) || /^(test|testing|demo|placeholder|验证|测试)$/i.test(content);
}

function isSupportedWebhookClass(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "blog" || normalized === "31";
}

function makeWebhookBlogArticle(fields, existingArticles) {
  const now = new Date().toISOString();
  const title = String(fields.title || "").trim();
  const baseSlug = slugifyAdmin(title).slice(0, 88) || `plugin-blog-${Date.now()}`;
  let slug = baseSlug;
  let suffix = 2;
  while (existingArticles.some((item) => item.slug === slug)) slug = `${baseSlug}-${suffix++}`;
  const content = sanitizePublishedArticleHtml(fields.content);
  const imageUrl = validCoverImage(fields.image_url) || "/assets/images/hero-mining-conveyor-magnet.webp";
  const excerpt = String(content)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 155) || title;
  const webhookContentHash = hash(`${title}\n${plainText(content)}`);
  const category = String(fields.class_id || "").trim() || "blog";
  return {
    id: `BLOG-WEBHOOK-${hash(`${title}:${now}`).slice(0, 14)}`,
    article_type: "blog",
    slug,
    title,
    excerpt,
    summary: excerpt,
    content,
    status: "published",
    language: "en-ZA",
    category: category === "31" || category.toLowerCase() === "blog" ? "Blog" : category,
    tags: ["plugin-published", "blog"],
    cover_image_url: imageUrl,
    cover_image_source_url: "",
    cover_image_page_url: "",
    cover_image_alt: title,
    cover_image_caption: "COWIN product media selected for this article.",
    cover_image_status: "owned-media",
    author_id: String(fields.author_id || ""),
    author_name: String(fields.author_id || "admin"),
    date: now.slice(0, 10),
    published_at: now,
    updated_at: now,
    seo_title: title.slice(0, 65),
    seo_description: excerpt,
    seoTitle: title.slice(0, 65),
    seoDescription: excerpt,
    canonical_url: `/en-za/blog/${slug}/`,
    primary_keyword: title.toLowerCase(),
    secondary_keywords: [],
    geo_summary: excerpt,
    key_takeaways: [],
    related_products: [],
    product_ids: [],
    webhook_content_hash: webhookContentHash,
    manualOverrideAt: now,
    created_at: now
  };
}

async function handleArticleWebhook(request) {
  if (request.method !== "POST") return pluginResponse(0, "Only POST requests are supported", 405);
  const startedAt = Date.now();
  const fields = await bodyFields(request);
  const expectedSign = articleWebhookSign();
  if (!isSupportedWebhookClass(fields.class_id)) {
    operationalLog("blog_webhook_rejected", { reason: "unsupported-class", classId: String(fields.class_id || "") });
    return pluginResponse(0, "Only the Blog category is supported");
  }
  if (!expectedSign) {
    operationalLog("blog_webhook_rejected", { reason: "secret-not-configured" });
    return pluginResponse(0, "Publishing secret is not configured");
  }
  if (!safeEqualText(fields.sign, expectedSign)) {
    operationalLog("blog_webhook_rejected", { reason: "invalid-secret", classId: String(fields.class_id || "") });
    return pluginResponse(0, "Invalid secret");
  }
  if (isVerificationOnly(fields)) return pluginResponse(1, "\u9a8c\u8bc1\u6210\u529f");

  try {
    const article = await withDataLock("article-webhook-publish", async () => {
      const articles = await readDataJson("data/articles/articles.json", []);
      const draft = makeWebhookBlogArticle(fields, articles);
      const duplicate = articles.find((item) => item.webhook_content_hash && item.webhook_content_hash === draft.webhook_content_hash);
      if (duplicate) return duplicate;
      await writeDataJson("data/articles/articles.json", [draft, ...articles]);
      const updatedArticles = await readDataJson("data/articles/articles.json", []);
      const persisted = updatedArticles.find((item) => item.slug === draft.slug);
      if (!persisted) throw new Error("Published article was not readable after database write");
      return draft;
    });
    try {
      scheduleSitemapAudit({ source: "article-webhook", action: "created", objectId: article.slug, url: article.canonical_url });
    } catch (auditError) {
      console.warn(`[article-webhook] Sitemap audit scheduling failed: ${auditError?.message || auditError}`);
    }
    operationalLog("blog_webhook_published", {
      slug: article.slug,
      classId: String(fields.class_id || ""),
      durationMs: Date.now() - startedAt
    });
    await writeDataJson("data/cms/blog-webhook-state.json", {
      status: "published", slug: article.slug, at: new Date().toISOString(), durationMs: Date.now() - startedAt
    }).catch(() => {});
    return pluginResponse(1, "\u53d1\u5e03\u6210\u529f");
  } catch (error) {
    await writeDataJson("data/cms/blog-webhook-state.json", {
      status: "failed", at: new Date().toISOString(), durationMs: Date.now() - startedAt
    }).catch(() => {});
    operationalLog("blog_webhook_failed", {
      reason: error?.message || "database-insert-failed",
      classId: String(fields.class_id || ""),
      durationMs: Date.now() - startedAt
    });
    return pluginResponse(0, error?.message || "Database insert failed, please retry");
  }
}
function teamCredentials() {
  try { return JSON.parse(process.env.ADMIN_TEAM_CREDENTIALS || "{}") || {}; } catch { return {}; }
}

function teamCredential(email) {
  const credentials = teamCredentials();
  const value = Object.hasOwn(credentials, email) ? credentials[email] : "";
  return typeof value === "string" && /^[0-9a-f]{32}:[0-9a-f]{128}$/i.test(value) ? value : "";
}

async function staffAccess(email) {
  if (!teamCredential(email)) return null;
  const users = await readDatabaseJson("data/cms/users.json");
  const user = Array.isArray(users) && users.find((row) => row.email === email && row.status === "active");
  if (!user || user.role === "Super Admin") return null;
  const roles = await readAdminRoles();
  const role = roles.find((row) => row.name === user.role && row.status === "active");
  return role ? { email, role: role.name, permissions: role.permissions } : null;
}

async function readAdminRoles() {
  const path = "data/cms/roles.json";
  const stored = await readDatabaseJson(path);
  const roles = Array.isArray(stored) ? stored : jsonFiles.get(path);
  return roles.filter((role) => Array.isArray(role.permissions)).map((role) => ({
    ...role, status: role.status || "active",
    permissions: role.permissions.filter((value) => typeof value === "string").map((value) => value.replace(/^enquiries:/, "forms:"))
  }));
}

async function authenticateAdmin(identifier, password) {
  if (verifyAdminCredentials(identifier, password)) return { email: adminEmail, role: "Super Admin" };
  const email = String(identifier || "").trim().toLowerCase();
  if (adminLoginAliases.includes(email) || !password || password.length > 1024) return null;
  const credential = teamCredential(email);
  if (!credential) return null;
  const [salt, expected] = credential.split(":");
  const actual = crypto.scryptSync(password, Buffer.from(salt, "hex"), 64).toString("hex");
  return safeEqualText(expected, actual) ? staffAccess(email) : null;
}

function makeSessionCookie(csrf, identity) {
  const payload = {
    user: identity.email,
    email: identity.email,
    role: identity.role,
    csrf,
    expiresAt: new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString()
  };
  const payload64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${payload64}.${crypto.createHmac("sha256", sessionSecret()).update(payload64).digest("hex")}.v2`;
}

function isSecureRequest(request) {
  const forwardedProto = request.headers.get("x-forwarded-proto");
  if (forwardedProto) return forwardedProto.split(",")[0].trim() === "https";
  try {
    return new URL(request.url).protocol === "https:";
  } catch {
    return process.env.NODE_ENV === "production" && !request.url.includes("localhost");
  }
}

async function getSession() {
  const secret = sessionSecret();
  if (!secret) return null;
  const cookieStore = await cookies();
  let value = cookieStore.get("cowin_admin_session")?.value;
  if (!value) {
    const headerStore = await headers();
    const rawCookie = headerStore.get("cookie") || "";
    value = rawCookie
      .split(";")
      .map((item) => item.trim())
      .find((item) => item.startsWith("cowin_admin_session="))
      ?.slice("cowin_admin_session=".length);
  }
  if (!value) return null;

  const [payload64, signature, version] = value.split(".");
  const expected = version === "v2" ? crypto.createHmac("sha256", secret).update(payload64).digest("hex")
    : version === "v1" ? hash(`${payload64}.${secret}`) : "";
  if (!payload64 || !signature || !expected || !safeEqualText(signature, expected)) return null;

  try {
    const payload = JSON.parse(Buffer.from(payload64, "base64url").toString("utf8"));
    if (!(Date.parse(payload.expiresAt) > Date.now())) return null;
    if (payload.role === "Super Admin" && payload.email === adminEmail) return { ...payload, permissions: ["*"] };
    if (version !== "v2") return null;
    const staff = await staffAccess(payload.email);
    return staff ? { ...payload, ...staff } : null;
  } catch {
    return null;
  }
}

function permits(session, permission) {
  if (!permission) return false;
  return session.permissions?.some((value) => value === "*" || value === permission || value === permission.split(":")[0] + ":*");
}

function adminPermission(path, method) {
  const section = path.split("/")[1];
  const module = ({
    enquiries: "forms", "news-automation": "news", blog: "news",
    "google-seo": "seo", sitemap: "seo", links: "seo", "audit-logs": "logs", "storage-status": "sync",
    products: "products", categories: "categories", news: "news", analytics: "analytics", dashboard: "dashboard",
    seo: "seo", media: "media", users: "users", sync: "sync", settings: "settings", content: "dashboard"
  })[section];
  if (!module) return null;
  const action = path.includes("/attachments/") ? "download" : path.endsWith("/export") ? "export"
    : path.endsWith("/publish") ? "publish" : ["GET", "HEAD"].includes(method) ? "view" : "edit";
  return `${module}:${action}`;
}

async function requireAdmin(request, path) {
  const session = await getSession();
  if (!session) {
    return { error: response({ success: false, error: "Unauthorized", requestId: token(8) }, 401) };
  }

  if (!["GET", "HEAD"].includes(request.method)) {
    const csrf = request.headers.get("x-csrf-token");
    if (!csrf || !safeEqualText(csrf, session.csrf)) {
      return { error: response({ success: false, error: "CSRF validation failed", requestId: token(8) }, 403) };
    }
  }

  if (session.role !== "Super Admin" && !permits(session, adminPermission(path, request.method))) {
    return { error: response({ success: false, error: "当前账号没有此操作权限。", requestId: token(8) }, 403) };
  }
  return { session };
}

async function audit(user, action, object, objectId, summary) {
  const path = "data/cms/audit-logs.json";
  const entry = {
    id: token(10),
    user,
    action,
    object,
    objectId,
    summary,
    time: new Date().toISOString(),
    ip: "next-api"
  };
  if (getPool()) {
    await ensureDatabaseSchema();
    await getPool().query(`
      INSERT INTO africa_json_documents (path, payload) VALUES ($1, jsonb_build_array($2::jsonb))
      ON CONFLICT (path) DO UPDATE SET
        payload = (CASE WHEN jsonb_array_length(africa_json_documents.payload) >= 500
          THEN africa_json_documents.payload - 0 ELSE africa_json_documents.payload END) || EXCLUDED.payload,
        updated_at = NOW()`, [path, JSON.stringify(entry)]);
    return;
  }
  const logs = await readJson(path);
  await writeJson(path, [...logs, entry].slice(-500));
}

async function analyticsSummary(request) {
  // Historical fixture imports are not part of the enterprise reporting path.
  // Returning an error rather than invented zeroes keeps the interface honest.
  return getAnalyticsReport(request?.url || "https://cowinmagnet.co.za/api/admin/analytics?range=7d");
}

function productUrl(product) {
  return `/en-za/products/${product.categorySlug || "products"}/${product.slug || ""}/`;
}

async function seoSummary() {
  const [products, articles, categories, industries, solutions, markets, sitemap] = await Promise.all([
    readJson("data/products/products.json"),
    readJson("data/articles/articles.json"),
    readJson("data/categories/categories.json"),
    readJson("data/industries/industries.json"),
    readJson("data/solutions/solutions.json"),
    readJson("data/markets/markets.json"),
    readDataJson("data/seo/sitemap-state.json", {})
  ]);

  const rows = [
    ...products.map((item) => ({
      page: productUrl(item),
      title: item.seoTitle ? "OK" : "Missing",
      description: item.seoDescription ? "OK" : "Missing",
      image: item.image || item.mainImage ? "OK" : "Missing",
      canonical: item.canonicalUrl || productUrl(item),
      status: item.productStatus || "published"
    })),
    ...articles
      .filter((item) => isPublishedNewsArticle(item) || isPublishedBlogArticle(item))
      .map((item) => {
        const section = item.article_type === "blog" ? "blog" : "news";
        return {
      page: `/en-za/${section}/${item.slug}/`,
      title: item.seoTitle || item.title ? "OK" : "Missing",
      description: item.seoDescription || item.summary ? "OK" : "Missing",
      image: item.cover_image_url || item.image || item.openGraphImage ? "OK" : "Pending",
      canonical: item.canonicalUrl || item.canonical_url || `/en-za/${section}/${item.slug}/`,
      status: item.status || "published"
    };
      }),
    ...[["products", categories], ["industries", industries], ["solutions", solutions], ["markets", markets]].flatMap(([section, items]) => items.map((item) => ({
      page: item.slug ? `/en-za/${section}/${item.slug}/` : "",
      title: item.name || item.title ? "OK" : "Missing",
      description: item.description || item.summary ? "OK" : "Missing",
      image: item.image ? "OK" : "Pending",
      canonical: item.canonicalUrl || "",
      status: item.status || "published"
    })))
  ];

  const issues = rows.flatMap((row) => [
    ...(row.title === "Missing" ? [{ page: row.page, type: "标题", message: "内容记录没有标题" }] : []),
    ...(row.description === "Missing" ? [{ page: row.page, type: "摘要", message: "内容记录没有摘要" }] : []),
    ...(row.image === "Missing" ? [{ page: row.page, type: "图片", message: "产品记录没有主图" }] : [])
  ]);
  return {
    total: rows.length,
    sitemapTotal: Number.isInteger(sitemap.lastUrlCount) ? sitemap.lastUrlCount : null,
    issues,
    missingTitle: rows.filter((row) => row.title !== "OK").length,
    missingDescription: rows.filter((row) => row.description !== "OK").length,
    missingImage: rows.filter((row) => row.image === "Missing").length,
    rows
  };
}

async function googleSeoState() {
  const [latest, jobs, inspection, sitemapRuns] = await Promise.all([
    readJson("data/seo/google-search-console.json"),
    readJson("data/seo/google-seo-jobs.json"),
    readJson("data/seo/gsc-url-inspection.json"),
    readDataJson("data/seo/sitemap-runs.json", [])
  ]);
  const config = googleSeoConfig();
  return {
    enabled: config.enabled,
    configured: config.configured,
    propertyUrl: config.propertyUrl,
    serviceAccountEmail: config.clientEmail,
    latest,
    inspection,
    sitemapSubmission: sitemapRuns.find((run) => run.searchConsole?.attempted) || null,
    jobs: (jobs || []).slice(0, 20)
  };
}

async function runGoogleUrlInspection() {
  const manifest = await readDataJson("data/seo/sitemap-manifest.json", { entries: [] });
  const urls = [...new Set((manifest.entries || []).map((item) => item.url || item.loc).filter(Boolean))];
  if (!urls.length) throw new Error("Sitemap manifest contains no inspectable URLs");
  const priorState = await readDataJson("data/seo/gsc-url-inspection-state.json", {});
  const batchSize = Math.min(24, Math.max(1, Number.parseInt(process.env.GSC_INSPECTION_BATCH_SIZE, 10) || 24));
  const start = Number(priorState.nextOffset || 0) % urls.length;
  const previous = await readDataJson("data/seo/gsc-url-inspection.json", {});
  const retryQueue = priorState.retryQueue || (previous.results || [])
    .filter((item) => item.verdict === "ERROR" && item.retryable !== false)
    .map((item) => ({ url: item.url, attempts: 0 }));
  const retries = retryQueue.filter((item) => item.attempts < 3 && urls.includes(item.url)).slice(0, Math.min(4, batchSize - 1));
  const retryUrls = retries.map((item) => item.url);
  const rotation = Array.from({ length: Math.min(batchSize - retries.length, urls.length) }, (_, index) => urls[(start + index) % urls.length]);
  const batch = [...new Set([...retryUrls, ...rotation])];
  const batchReport = await inspectGoogleUrls(batch, { concurrency: 3 });
  const resultsByUrl = new Map((previous.results || []).map((item) => [item.url, item]));
  const waiting = new Map(retryQueue.filter((item) => urls.includes(item.url)).map((item) => [item.url, item]));
  for (const result of batchReport.results) {
    if (result.verdict === "ERROR") {
      const last = resultsByUrl.get(result.url);
      resultsByUrl.set(result.url, last && last.verdict !== "ERROR" ? { ...last, latestError: result.error, lastAttemptAt: result.inspectedAt } : result);
      if (result.retryable) waiting.set(result.url, { url: result.url, attempts: (waiting.get(result.url)?.attempts || 0) + 1 });
      else waiting.delete(result.url);
    } else {
      resultsByUrl.set(result.url, result);
      waiting.delete(result.url);
    }
  }
  const results = urls.map((url) => resultsByUrl.get(url)).filter(Boolean);
  const group = (key) => Object.fromEntries(Object.entries(results.reduce((counts, item) => {
    const value = item[key] || "Unknown";
    counts[value] = (counts[value] || 0) + 1;
    return counts;
  }, {})).sort((left, right) => right[1] - left[1]));
  const report = {
    ...batchReport,
    total: urls.length,
    inspectedThisRun: batch.length,
    nextOffset: (start + rotation.length) % urls.length,
    retryPending: [...waiting.values()].filter((item) => item.attempts < 3).length,
    retryExhausted: [...waiting.values()].filter((item) => item.attempts >= 3).length,
    cycleStartedAt: start === 0 ? new Date().toISOString() : priorState.cycleStartedAt || "",
    byVerdict: group("verdict"),
    byCoverageState: group("coverageState"),
    results
  };
  await writeDataJson("data/seo/gsc-url-inspection.json", report);
  await writeDataJson("data/seo/gsc-url-inspection-state.json", {
    nextOffset: report.nextOffset,
    cycleStartedAt: report.cycleStartedAt,
    lastRunAt: report.inspectedAt,
    lastBatchSize: batch.length,
    retryQueue: [...waiting.values()],
    totalUrls: urls.length
  });
  return report;
}

async function syncGoogleSeo(user = "cron") {
  const jobs = await readJson("data/seo/google-seo-jobs.json");
  const job = {
    id: `GSC-${Date.now()}-${token(5)}`,
    status: "running",
    started_at: new Date().toISOString(),
    requested_by: user
  };
  jobs.unshift(job);
  await writeJson("data/seo/google-seo-jobs.json", jobs.slice(0, 200));
  try {
    const data = await runGoogleSeoSync();
    await writeJson("data/seo/google-search-console.json", data);
    job.status = "completed";
    job.completed_at = new Date().toISOString();
    job.propertyUrl = data.propertyUrl;
    job.clicks = data.summary.clicks;
    job.impressions = data.summary.impressions;
    job.rows = {
      topPages: data.topPages.length,
      topQueries: data.topQueries.length,
      pageQueries: data.pageQueries.length
    };
    await writeJson("data/seo/google-seo-jobs.json", jobs.slice(0, 200));
    return { job, data };
  } catch (error) {
    job.status = "failed";
    job.completed_at = new Date().toISOString();
    job.error_message = error?.message || String(error);
    await writeJson("data/seo/google-seo-jobs.json", jobs.slice(0, 200));
    throw error;
  }
}

async function linksSummary() {
  const [products, categories, industries, solutions, markets, articles, downloads] = await Promise.all([
    readJson("data/products/products.json"),
    readJson("data/categories/categories.json"),
    readJson("data/industries/industries.json"),
    readJson("data/solutions/solutions.json"),
    readJson("data/markets/markets.json"),
    readJson("data/articles/articles.json"),
    readJson("data/downloads/downloads.json")
  ]);

  const rows = [
    { module: "Products", count: products.length, status: products.length ? "OK" : "Empty", note: "Product detail routes and category routes" },
    { module: "Categories", count: categories.length, status: categories.length ? "OK" : "Empty", note: "Product mega menu and category pages" },
    { module: "Industries", count: industries.length, status: industries.length ? "OK" : "Empty", note: "Industry hub and internal links" },
    { module: "Solutions", count: solutions.length, status: solutions.length ? "OK" : "Empty", note: "Solution pages and resource menu" },
    { module: "Markets", count: markets.length, status: markets.length ? "OK" : "Empty", note: "African market pages" },
    { module: "News", count: articles.filter(isPublishedNewsArticle).length, status: articles.filter(isPublishedNewsArticle).length ? "OK" : "Empty", note: "News list and detail pages" },
    { module: "Blog", count: articles.filter(isPublishedBlogArticle).length, status: articles.filter(isPublishedBlogArticle).length ? "OK" : "Empty", note: "Blog list, detail pages and RSS feed" },
    { module: "Downloads", count: downloads.length, status: downloads.length ? "Review" : "Empty", note: "PDF paths should be verified before publication" }
  ];

  return {
    internal: products.length + categories.length + industries.length + solutions.length + markets.length + articles.filter((item) => isPublishedNewsArticle(item) || isPublishedBlogArticle(item)).length,
    external: markets.length + downloads.length,
    empty: rows.filter((row) => row.status === "Empty").length,
    warnings: rows.filter((row) => row.status !== "OK").length,
    rows
  };
}

async function adminCategories(request, session) {
  const categories = await readJson("data/categories/categories.json");
  if (request.method === "GET") {
    return response({ success: true, data: paginate(categories, request, { searchFields: ["name", "title", "slug", "description"], includeDeleted: new URL(request.url).searchParams.get("deleted") === "1" }), requestId: token(8) });
  }
  const body = await bodyJson(request);
  const slug = slugifyAdmin(body.slug || body.name || body.title);
  if (!slug || !(body.name || body.title)) return response({ success: false, error: "分类名称和 Slug 必填", requestId: token(8) }, 400);
  if (body.parentSlug && body.parentSlug === slug) return response({ success: false, error: "分类不能将自己设置为父级", requestId: token(8) }, 400);
  const existing = categories.find((item) => item.slug === slug);
  const now = new Date().toISOString();
  const payload = {
    slug,
    name: String(body.name || body.title || ""),
    title: String(body.title || body.name || ""),
    englishName: String(body.englishName || body.name || body.title || ""),
    parentSlug: String(body.parentSlug || ""),
    description: String(body.description || ""),
    image: String(body.image || ""),
    icon: String(body.icon || ""),
    sortOrder: Number(body.sortOrder || body.order || 0),
    status: String(body.status || "active"),
    navVisible: body.navVisible !== false,
    seoTitle: String(body.seoTitle || body.name || body.title || ""),
    seoDescription: String(body.seoDescription || body.description || ""),
    canonicalUrl: String(body.canonicalUrl || ""),
    updatedAt: now,
    updatedBy: session.user
  };
  if (existing) Object.assign(existing, payload);
  else categories.push({ ...payload, createdAt: now, createdBy: session.user });
  await writeJson("data/categories/categories.json", categories);
  scheduleSitemapAudit({ source: "categories", action: existing ? "updated" : "created", objectId: slug, url: `/en-za/products/${slug}/` });
  await audit(session.user, existing ? "Category Updated" : "Category Created", "Category", slug, `Product category ${existing ? "updated" : "created"}`);
  return response({ success: true, data: { slug }, requestId: token(8) });
}

async function adminCategoryAction(request, session, slug, action) {
  const categories = await readJson("data/categories/categories.json");
  const item = categories.find((entry) => entry.slug === slug);
  if (!item) return response({ success: false, error: "分类不存在", requestId: token(8) }, 404);
  if (action === "delete") item.deletedAt = new Date().toISOString();
  if (action === "restore") delete item.deletedAt;
  if (action === "disable") item.status = "disabled";
  if (action === "enable") item.status = "active";
  item.updatedAt = new Date().toISOString();
  item.updatedBy = session.user;
  await writeJson("data/categories/categories.json", categories);
  scheduleSitemapAudit({ source: "categories", action, objectId: slug, url: `/en-za/products/${slug}/` });
  await audit(session.user, `Category ${action}`, "Category", slug, `Category ${action}`);
  return response({ success: true, data: item, requestId: token(8) });
}

async function adminEnquiriesList(request) {
  const items = await readEnquiryItems();
  const url = new URL(request.url);
  let rows = items;
  const country = String(url.searchParams.get("country") || "").toLowerCase();
  const product = String(url.searchParams.get("product") || "").toLowerCase();
  const source = String(url.searchParams.get("source") || "").toLowerCase();
  if (country) rows = rows.filter((item) => String(item.country || item.region || "").toLowerCase().includes(country));
  if (product) rows = rows.filter((item) => String(item.product || item.productRequired || "").toLowerCase().includes(product));
  if (source) rows = rows.filter((item) => `${item.sourcePage || ""} ${item.utm?.source || ""} ${item.utm?.medium || ""}`.toLowerCase().includes(source));
  const customerCounts = new Map();
  for (const item of (Array.isArray(items) ? items : [])) {
    const email = String(item.email || "").trim().toLowerCase();
    if (email) customerCounts.set(email, (customerCounts.get(email) || 0) + 1);
  }
  rows = rows.map((item) => ({
    ...item,
    customerInquiryCount: customerCounts.get(String(item.email || "").trim().toLowerCase()) || 1
  }));
  return response({ success: true, data: paginate(rows, request, { searchFields: ["id", "name", "company", "email", "phone", "whatsapp", "country", "product", "sourcePage", "status"], statusField: "status", includeDeleted: true, dateFields: ["submissionTime", "createdAt"] }), requestId: token(8) });
}

async function adminEnquiryDetail(id) {
  const items = await readEnquiryItems();
  const enquiry = (Array.isArray(items) ? items : []).find((item) => item.id === id);
  if (!enquiry) return null;
  let visitor = null;
  if (enquiry.analyticsVisitorId) {
    try {
      visitor = await getAnalyticsVisitorJourney(enquiry.analyticsVisitorId);
    } catch (error) {
      // A saved customer enquiry remains available even if historic analytics
      // storage is temporarily unavailable.
      visitor = { unavailable: true };
    }
  }
  const customerEmail = String(enquiry.email || "").trim().toLowerCase();
  const relatedEnquiries = customerEmail
    ? items.filter((item) => String(item.email || "").trim().toLowerCase() === customerEmail)
      .sort((left, right) => new Date(right.submissionTime || 0) - new Date(left.submissionTime || 0))
      .map((item) => ({ id: item.id, submissionTime: item.submissionTime, product: item.product, status: item.status, sourcePage: item.sourcePage }))
    : [];
  return { enquiry, visitor, customer: { enquiryCount: relatedEnquiries.length, enquiries: relatedEnquiries } };
}

async function adminUsers(request, session) {
  const [users, roles] = await Promise.all([readJson("data/cms/users.json"), readAdminRoles()]);
  if (request.method === "GET") return response({ success: true, data: { users: paginate(users.map((user) => ({
    ...user, loginEnabled: user.status === "active" && (adminLoginAliases.includes(user.email) || Boolean(teamCredential(user.email)))
  })), request, { searchFields: ["email", "name", "role", "status"], includeDeleted: true }), roles }, requestId: token(8) });
  const body = await bodyJson(request);
  const email = String(body.email || "").trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return response({ success: false, error: "请输入有效邮箱", requestId: token(8) }, 400);
  if (adminLoginAliases.includes(email)) return response({ success: false, error: "主账号不可在此变更角色或停用。" }, 400);
  if (!roles.some((role) => role.name === body.role && role.status === "active" && role.name !== "Super Admin")) {
    return response({ success: false, error: "请选择可用的团队角色。" }, 400);
  }
  const now = new Date().toISOString();
  const existing = users.find((item) => item.email === email);
  const payload = {
    id: existing?.id || `USR-${token(6)}`,
    email,
    name: String(body.name || email),
    role: body.role,
    status: body.status === "disabled" ? "disabled" : "active",
    updatedAt: now,
    updatedBy: session.user
  };
  if (existing) Object.assign(existing, payload);
  else users.push({ ...payload, createdAt: now, createdBy: session.user });
  await writeJson("data/cms/users.json", users);
  await audit(session.user, existing ? "User Updated" : "User Created", "User", email, `Admin user ${existing ? "updated" : "created"}`);
  return response({ success: true, data: payload, requestId: token(8) });
}

async function adminMedia(request, session) {
  const assets = await readJson("data/media/assets.json");
  if (request.method === "GET") return response({ success: true, data: paginate(assets, request, { searchFields: ["id", "filename", "url", "alt", "category", "mimeType"], includeDeleted: new URL(request.url).searchParams.get("deleted") === "1" }), requestId: token(8) });
  const body = await bodyJson(request);
  const now = new Date().toISOString();
  const id = String(body.id || `MED-${token(7)}`);
  const existing = assets.find((item) => item.id === id);
  const payload = {
    id,
    title: String(body.title || body.filename || body.name || ""),
    filename: String(body.filename || body.title || body.name || ""),
    url: String(body.url || ""),
    alt: String(body.alt || ""),
    caption: String(body.caption || ""),
    category: String(body.category || "general"),
    mimeType: String(body.mimeType || ""),
    size: Number(body.size || 0),
    usedBy: Array.isArray(body.usedBy) ? body.usedBy : [],
    updatedAt: now,
    updatedBy: session.user
  };
  if (!payload.url) return response({ success: false, error: "媒体 URL 必填", requestId: token(8) }, 400);
  if (existing) Object.assign(existing, payload);
  else assets.unshift({ ...payload, createdAt: now, createdBy: session.user });
  await writeJson("data/media/assets.json", assets);
  await audit(session.user, existing ? "Media Updated" : "Media Registered", "Media", id, `Media asset ${existing ? "updated" : "registered"}`);
  return response({ success: true, data: payload, requestId: token(8) });
}

async function adminSyncState(request) {
  const [googleSeo, googleJobs, sitemapState, sitemapRuns, storage, newsState, inspection, blog] = await Promise.all([
    readJson("data/seo/google-search-console.json"),
    readJson("data/seo/google-seo-jobs.json"),
    readDataJson("data/seo/sitemap-state.json", {}),
    readDataJson("data/seo/sitemap-runs.json", []),
    persistentStorageState(),
    newsAutomationStatus(),
    readDataJson("data/seo/gsc-url-inspection.json", {}),
    readDataJson("data/cms/blog-webhook-state.json", {})
  ]);
  const latestSubmission = (sitemapRuns || []).find((run) => run.searchConsole?.attempted);
  const googleDue = googleSeo?.syncedAt && Date.now() - Date.parse(googleSeo.syncedAt) > 9 * 86_400_000;
  const jobs = [
    ...(newsState.latestRun ? [{ ...newsState.latestRun, type: "news", time: newsState.latestRun.startedAt, status: newsState.latestRun.result, message: (newsState.latestRun.blockers || []).join(" ") }] : []),
    ...(Array.isArray(googleJobs) ? googleJobs.map((job) => ({ ...job, type: "google-seo", time: job.started_at || job.completed_at || "" })) : [])
  ];
  return {
    sources: [
      { id: "news", name: "新闻自动发布", status: newsState.enabled ? (newsState.productionReady ? "已启用" : "待核验") : "已停用", lastSync: newsState.latestRun?.startedAt || "" },
      { id: "blog", name: "第三方博客发布", status: !articleWebhookSign() ? "未配置" : blog.status === "published" ? "已确认入库" : blog.status === "failed" ? "最近投递失败" : "已接入，等待投递回执", lastSync: blog.at || "", durationMs: blog.durationMs },
      { id: "google-seo", name: "Google 搜索表现", status: !googleSeoConfig().configured ? "未配置" : googleJobs?.[0]?.status === "failed" ? "最近同步失败" : googleDue ? "超过预期同步间隔" : googleSeo?.syncedAt ? "已同步" : "待同步", lastSync: googleSeo?.syncedAt || "" },
      { id: "google-sitemap", name: "Google 站点地图提交", status: !latestSubmission ? "无提交回执" : latestSubmission.searchConsole.submitted ? `Google 已接收（HTTP ${latestSubmission.searchConsole.status || 204}）` : "最近提交失败", lastSync: latestSubmission?.finishedAt || "", durationMs: latestSubmission?.durationMs },
      { id: "google-inspection", name: "Google URL 检查", status: !inspection.inspectedAt ? "无检查回执" : `本轮 ${inspection.inspectedThisRun || 0} 页 · 待重试 ${inspection.retryPending ?? inspection.byVerdict?.ERROR ?? 0}`, lastSync: inspection.inspectedAt || "" },
      { id: "enquiry-email", name: "询盘邮件通知", status: enquiryMailConfigured() ? "已配置，回执见询盘详情" : "邮件服务待配置" },
      { id: "storage", name: "后台持久化存储", status: storage.status, lastSync: storage.lastWriteAt, durationMs: storage.durationMs }
    ],
    newsState,
    googleSeo,
    googleJobs,
    sitemapState,
    sitemapRuns: (sitemapRuns || []).slice(0, 20),
    jobs: paginate(jobs, request, { searchFields: ["type", "status", "message", "requested_by"], dateFields: ["time", "started_at", "completed_at"] }),
    storage,
    timezone: ADMIN_TIMEZONE
  };
}

async function persistentStorageState() {
  const db = getPool();
  if (!db) return { mode: storageMode(), databaseConfigured: false, status: "未配置" };
  const startedAt = Date.now();
  try {
    await ensureDatabaseSchema();
    const { rows: [state] } = await db.query("SELECT MAX(updated_at) AS latest FROM africa_json_documents");
    return { mode: "database", databaseConfigured: true, status: "可读取", lastWriteAt: state.latest || null, durationMs: Date.now() - startedAt };
  } catch {
    return { mode: "database", databaseConfigured: true, status: "读取失败", durationMs: Date.now() - startedAt };
  }
}

async function publicNewsList(request) {
  const url = new URL(request.url);
  const page = Math.max(1, Number(url.searchParams.get("page") || 1));
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") || 12)));
  const category = String(url.searchParams.get("category") || "").toLowerCase();
  const tag = String(url.searchParams.get("tag") || "").toLowerCase();
  const articles = (await readJson("data/articles/articles.json"))
    .filter(isPublishedNewsArticle)
    .filter((item) => !category || String(item.category || "").toLowerCase() === category)
    .filter((item) => !tag || (item.tags || []).some((value) => String(value).toLowerCase() === tag));
  const offset = (page - 1) * limit;
  return response({
    success: true,
    data: {
      items: articles.slice(offset, offset + limit),
      page,
      limit,
      total: articles.length
    },
    requestId: token(8)
  });
}

async function publicNewsDetail(slug) {
  const articles = await readJson("data/articles/articles.json");
  const article = articles.find((item) => item.slug === slug && isPublishedNewsArticle(item));
  if (!article) return response({ success: false, error: "News article not found", requestId: token(8) }, 404);
  return response({ success: true, data: article, requestId: token(8) });
}

async function publicNewsCategories() {
  const articles = (await readJson("data/articles/articles.json")).filter(isPublishedNewsArticle);
  const categories = [...new Set(articles.map((item) => item.category || "Industry News"))].sort();
  const tags = [...new Set(articles.flatMap((item) => item.tags || []))].sort();
  return response({ success: true, data: { categories, tags }, requestId: token(8) });
}

async function publicProductNews(productId) {
  const articles = (await readJson("data/articles/articles.json")).filter(isPublishedNewsArticle);
  const rows = articles.filter((item) => {
    const products = item.related_products || [];
    return products.some((product) => product.product_id === productId || product.slug === productId);
  });
  return response({ success: true, data: rows, requestId: token(8) });
}

async function publicBlogList(request) {
  const url = new URL(request.url);
  const page = Math.max(1, Number(url.searchParams.get("page") || 1));
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") || 12)));
  const q = String(url.searchParams.get("q") || "").trim().toLowerCase();
  const articles = (await readDataJson("data/articles/articles.json", []))
    .filter(isPublishedBlogArticle)
    .filter((item) => !q || `${item.title} ${item.excerpt || ""} ${item.summary || ""}`.toLowerCase().includes(q))
    .sort((a, b) => String(b.published_at || b.date || "").localeCompare(String(a.published_at || a.date || "")));
  const offset = (page - 1) * limit;
  return response({ success: true, data: { items: articles.slice(offset, offset + limit), page, limit, total: articles.length }, requestId: token(8) });
}

async function publicBlogDetail(slug) {
  const articles = await readDataJson("data/articles/articles.json", []);
  const article = articles.find((item) => item.slug === slug && isPublishedBlogArticle(item));
  if (!article) return response({ success: false, error: "Blog article not found", requestId: token(8) }, 404);
  return response({ success: true, data: article, requestId: token(8) });
}

async function publicProductBlog(productId) {
  const articles = (await readDataJson("data/articles/articles.json", [])).filter(isPublishedBlogArticle);
  const rows = articles.filter((item) => (item.related_products || []).some((product) => product.product_id === productId || product.slug === productId));
  return response({ success: true, data: rows, requestId: token(8) });
}

function validCronRequest(request) {
  const secret = process.env.CRON_SECRET || "";
  if (!secret) return !process.env.VERCEL && process.env.NODE_ENV !== "production";
  const header = request.headers.get("authorization") || request.headers.get("x-cron-secret") || "";
  return header === secret || header === `Bearer ${secret}`;
}

async function handleCronGoogleSeo(request) {
  if (!validCronRequest(request)) return response({ success: false, error: "Unauthorized cron request", requestId: token(8) }, 401);
  const startedAt = Date.now();
  let sitemap;
  try {
    sitemap = await runSitemapAudit({ trigger: "daily-google-seo-cron", submit: true });
    const googleSeo = await syncGoogleSeo("cron");
    operationalLog("google_seo_cron_completed", {
      durationMs: Date.now() - startedAt,
      sitemapSubmitted: Boolean(sitemap.run.searchConsole?.submitted),
      sitemapStatus: sitemap.run.searchConsole?.status || 0,
      clicks: googleSeo.data.summary.clicks,
      impressions: googleSeo.data.summary.impressions
    });
    return response({ success: true, data: { sitemap: sitemap.run, googleSeo }, requestId: token(8) });
  } catch (error) {
    operationalLog("google_seo_cron_failed", {
      durationMs: Date.now() - startedAt,
      phase: sitemap ? "search-console-sync" : "sitemap-submission",
      sitemapSubmitted: Boolean(sitemap?.run.searchConsole?.submitted),
      reason: error?.message || String(error)
    });
    return response({
      success: false,
      data: { sitemap: sitemap?.run || null, googleSeo: null },
      error: "Google SEO cron failed",
      requestId: token(8)
    }, 500);
  }
}

async function handleCronGscInspection(request) {
  if (!validCronRequest(request)) return response({ success: false, error: "Unauthorized cron request", requestId: token(8) }, 401);
  if (new URL(request.url).searchParams.get("summary") === "1") {
    const report = await readDataJson("data/seo/gsc-url-inspection.json", {});
    const samples = Object.fromEntries(Object.keys(report.byCoverageState || {}).map((coverageState) => [
      coverageState,
      (report.results || [])
        .filter((item) => item.coverageState === coverageState)
        .slice(0, 10)
        .map((item) => ({
          url: item.url,
          verdict: item.verdict,
          robotsTxtState: item.robotsTxtState,
          indexingState: item.indexingState,
          pageFetchState: item.pageFetchState,
          googleCanonical: item.googleCanonical,
          userCanonical: item.userCanonical,
          lastCrawlTime: item.lastCrawlTime,
          error: item.error
        }))
    ]));
    return response({
      success: true,
      data: {
        inspectedAt: report.inspectedAt,
        propertyUrl: report.propertyUrl,
        total: report.total || 0,
        byVerdict: report.byVerdict || {},
        byCoverageState: report.byCoverageState || {},
        samples
      },
      requestId: token(8)
    });
  }
  try {
    const report = await runGoogleUrlInspection();
    operationalLog("gsc_inspection_completed", {
      total: report.total || 0,
      inspectedThisRun: report.inspectedThisRun || 0,
      nextOffset: report.nextOffset || 0
    });
    return response({ success: true, data: report, requestId: token(8) });
  } catch (error) {
    operationalLog("gsc_inspection_failed", { reason: error?.message || String(error) });
    return response({ success: false, error: "Google URL inspection failed", requestId: token(8) }, 500);
  }
}

async function handleCronNewsAutomation(request) {
  if (!validCronRequest(request)) return response({ success: false, error: "Unauthorized cron request", requestId: token(8) }, 401);
  try {
    const result = await runNewsAutomation("vercel-cron");
    return response({ success: true, data: result, requestId: token(8) });
  } catch (error) {
    return response({ success: false, error: error?.message || String(error), requestId: token(8) }, 500);
  }
}

function sourceFromReferrer(referrer) {
  if (/google|bing|yahoo|duckduckgo/i.test(referrer)) return "Search";
  if (/linkedin|facebook|tiktok|twitter|x\.com/i.test(referrer)) return "Social";
  if (referrer) return "Referral";
  return "Direct";
}

function anonymizeIp(value) {
  const ip = String(value || "").trim();
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(ip)) return ip.replace(/\.\d+$/, ".0");
  if (ip.includes(":")) return `${ip.split(":").slice(0, 4).join(":")}::`;
  return "unknown";
}

async function parseLoginBody(request) {
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    return {
      identifier: String(formData.get("email") || formData.get("username") || ""),
      password: String(formData.get("password") || ""),
      form: true
    };
  }
  const body = await bodyJson(request);
  return {
    identifier: String(body.email || body.username || ""),
    password: String(body.password || ""),
    form: false
  };
}

async function handleLogin(request, options = {}) {
  const body = await parseLoginBody(request);
  const wantsRedirect = options.redirect || body.form;
  const url = new URL(request.url);
  if (!sessionSecret() || (!isAdminAuthConfigured() && !Object.keys(teamCredentials()).length)) {
    if (wantsRedirect) return NextResponse.redirect(new URL("/admin/login/?error=not-configured", url), 303);
    return response({ success: false, error: "Admin password is not configured", requestId: token(8) }, 503);
  }

  const identity = await authenticateAdmin(body.identifier, body.password);
  if (identity) {
    const csrf = token(24);
    const res = wantsRedirect
      ? NextResponse.redirect(new URL("/admin/dashboard", url), 303)
      : response({ success: true, data: { user: identity.email, role: identity.role, csrf }, requestId: token(8) });
    res.cookies.set("cowin_admin_session", makeSessionCookie(csrf, identity), {
      httpOnly: true,
      sameSite: "lax",
      secure: isSecureRequest(request),
      path: "/",
      maxAge: SESSION_TTL_SECONDS
    });
    await audit(identity.email, "Login", "Session", "next", "Admin signed in to Cowinmagnet Africa admin").catch(() => {});
    return res;
  }
  if (wantsRedirect) return NextResponse.redirect(new URL("/admin/login/?error=invalid", url), 303);
  return response({ success: false, error: "Invalid username or password", requestId: token(8) }, 401);
}

async function handleSession() {
  const session = await getSession();
  if (!session) return response({ success: false, error: "Unauthorized", requestId: token(8) }, 401);
  return response({ success: true, data: { user: session.user, email: session.email || session.user, role: session.role, permissions: session.permissions, csrf: session.csrf }, requestId: token(8) });
}

function handleLogout() {
  const res = response({ success: true, data: { loggedOut: true }, requestId: token(8) });
  res.cookies.set("cowin_admin_session", "", { path: "/", maxAge: 0 });
  return res;
}

function verifyEnquiryOrigin(request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    throw new EnquiryError(403, "Please send the enquiry from the South Africa website.");
  }
}

function sourcePageOf(value) {
  const site = productionSiteUrl();
  try {
    const url = new URL(value || "/en-za/request-a-quote/", site);
    if (url.origin === site && url.pathname.startsWith("/en-za/")) return site + url.pathname;
  } catch {}
  return site + "/en-za/request-a-quote/";
}

async function handleEnquiryUpload(request, partMatch) {
  verifyEnquiryOrigin(request);
  const db = await enquiryPool();
  if (!partMatch) {
    const input = await bodyJson(request);
    const data = await startEnquiryUpload(db, input, enquiryRequestKey(request));
    return response({ success: true, data }, 201);
  }
  if (request.headers.get("content-type") !== "application/octet-stream") {
    throw new EnquiryError(415, "The attachment part must be binary data.");
  }
  const [, id, part] = partMatch;
  const bytes = await readUploadPart(request);
  await saveUploadPart(db, id, request.headers.get("x-enquiry-upload-token"), Number(part), bytes);
  return response({ success: true });
}

async function handleEnquiryNotificationCron(request) {
  if (!validCronRequest(request)) return response({ success: false, error: "Unauthorized cron request" }, 401);
  const db = await enquiryPool();
  await expireEnquiryUploads(db);
  const pending = (await readEnquiryItems()).filter((item) => notificationDue(item)).slice(0, 12);
  const results = {};
  for (const item of pending) {
    const notification = await processEnquiryNotification(db, item.id);
    const status = notification?.status || "unavailable";
    results[status] = (results[status] || 0) + 1;
  }
  operationalLog("enquiry_notification_check", { checked: pending.length, results });
  return response({ success: true, data: { checked: pending.length, results } });
}

async function handleEnquiries(request) {
  verifyEnquiryOrigin(request);
  const body = await bodyJson(request);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return response({ success: false, error: "Inquiry data must be an object", requestId: token(8) }, 400);
  }
  if (JSON.stringify(body).length > 50_000) return response({ success: false, error: "Inquiry payload is too large", requestId: token(8) }, 413);
  if (enquiryRateLimitExceeded(request)) {
    return response({ success: false, error: "Too many inquiry attempts. Please wait a minute and try again.", requestId: token(8) }, 429);
  }
  const clean = (value, max = 500) => String(value || "").trim().slice(0, max);
  const name = clean(body.name, 120);
  const email = clean(body.email, 254).toLowerCase();
  if (!name || !email) return response({ success: false, error: "Name and email are required", requestId: token(8) }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return response({ success: false, error: "Valid email is required", requestId: token(8) }, 400);
  if (body.website) return response({ success: true, data: { received: true }, requestId: token(8) });
  const db = await enquiryPool();
  const company = clean(body.company, 180);
  const product = clean(body.productRequired, 500);
  const id = `ENQ-${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}-${token(4)}`;
  const payload = {};
  for (const [key, value] of Object.entries(body)) {
    if (!/^[A-Za-z][A-Za-z0-9_]{0,59}$/.test(key) || [
      "constructor", "prototype", "duplicateKey", "website", "fileUpload", "attachmentUpload",
      "submissionId", "fileName", "fileSize", "fileType", "sourcePage", "referrer", "analyticsClientId", "analyticsSessionId"
    ].includes(key)) continue;
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      payload[key] = clean(value, key === "projectDescription" ? 5000 : 1000);
    }
  }
  const record = {
    id,
    name,
    company,
    country: clean(body.country, 120),
    region: clean(body.region, 120),
    email,
    whatsapp: clean(body.whatsapp, 80),
    preferredLanguage: clean(body.preferredLanguage || body.language, 30),
    product,
    industry: clean(body.industry, 180),
    sourcePage: sourcePageOf(clean(body.sourcePage, 500)),
    analyticsVisitorId: clean(body.analyticsClientId, 140),
    analyticsSessionId: clean(body.analyticsSessionId, 140),
    payload,
    status: "New",
    assignedUser: "",
    internalNotes: [],
    submissionTime: new Date().toISOString(),
    notification: queuedNotification(),
    utm: {
      source: clean(body.utm_source, 120),
      medium: clean(body.utm_medium, 120),
      campaign: clean(body.utm_campaign, 180)
    }
  };
  const submissionId = clean(body.submissionId, 80);
  const currentForm = /^[a-zA-Z0-9_-]{16,80}$/.test(submissionId);
  const submissionKey = currentForm
    ? hash(`submission:${email}:${submissionId}`)
    : hash(`legacy:${JSON.stringify(Object.entries(payload).sort(([a], [b]) => a.localeCompare(b)))}`);
  const seed = await readFile(join(dataRoot, "cms/enquiries.json"), "utf8").then(JSON.parse).catch(() => []);
  const saved = await saveEnquiry(db, record, {
    upload: body.attachmentUpload, submissionKey, seed,
    submissionWindowMs: currentForm ? null : 30 * 60_000
  });
  if (saved.created) {
    const requestHeaders = new Headers(request.headers);
    after(async () => {
      const tasks = await Promise.allSettled([
        audit("public-form", "Enquiry Created", "Enquiry", id, `New website enquiry saved from ${record.sourcePage}`),
        processEnquiryNotification(db, id),
        recordAnalyticsEvent({ requestHeaders, body: {
          eventType: "quote_submit", clientId: record.analyticsVisitorId || `lead-${hash(email).slice(0, 24)}`,
          sessionId: record.analyticsSessionId, page: record.sourcePage, referrer: clean(body.referrer, 700),
          language: record.preferredLanguage || "en-za",
          metadata: { enquiryId: id, industry: record.industry, country: record.country }
        } })
      ]);
      tasks.forEach((item, index) => {
        if (item.status === "rejected") operationalLog("enquiry_follow_up_failed", {
          enquiryId: id, task: ["audit", "notification", "analytics"][index], code: item.reason?.code || item.reason?.name
        });
      });
    });
  }
  return response({ success: true, data: { id: saved.record.id }, requestId: token(8) });
}

async function handleTrack(request) {
  if (process.env.ANALYTICS_COLLECTION_ENABLED === "false") {
    return response({ success: true, data: { accepted: false, reason: "collection_disabled" }, requestId: token(8) });
  }
  try {
    const result = await recordAnalyticsEvent({
      requestHeaders: await headers(),
      body: await bodyJson(request)
    });
    return response({ success: true, data: result, requestId: token(8) });
  } catch (error) {
    const unavailable = error?.code === "ANALYTICS_STORAGE_UNAVAILABLE";
    return response({
      success: false,
      error: unavailable ? "Analytics storage is not configured." : (error?.message || "Analytics event was rejected."),
      requestId: token(8)
    }, unavailable ? 503 : 400);
  }
}

async function handleAdmin(request, path) {
  const { session, error } = await requireAdmin(request, path);
  if (error) return error;

  if (path === "admin/dashboard" && request.method === "GET") {
    const [products, categories, industries, solutions, markets, articles, downloads, enquiries, logs, analytics] = await Promise.all([
      readJson("data/products/products.json"),
      readJson("data/categories/categories.json"),
      readJson("data/industries/industries.json"),
      readJson("data/solutions/solutions.json"),
      readJson("data/markets/markets.json"),
      readJson("data/articles/articles.json"),
      readJson("data/downloads/downloads.json"),
      readEnquiryItems(),
      readJson("data/cms/audit-logs.json"),
      analyticsSummary(request)
    ]);
    return response({
      success: true,
      data: {
        pv: analytics.pv,
        uv: analytics.uv,
        products: products.length,
        publishedProducts: products.length,
        draftProducts: 0,
        categories: categories.length,
        industries: industries.length,
        solutions: solutions.length,
        markets: markets.length,
        articles: articles.filter((item) => isPublishedNewsArticle(item) || isPublishedBlogArticle(item)).length,
        newsArticles: articles.filter(isPublishedNewsArticle).length,
        blogArticles: articles.filter(isPublishedBlogArticle).length,
        downloads: downloads.length,
        unreadEnquiries: enquiries.filter((item) => item.status === "New").length,
        missingSeo: products.filter((item) => !item.seoTitle || !item.seoDescription).length,
        missingImages: products.filter((item) => !item.image).length,
        languages: ["en-za", "af-za", "zu-za", "xh-za", "st-za", "tn-za"],
        topPages: analytics.pages,
        topSources: analytics.sources,
        recentVisitors: (analytics.visitors?.items || []).slice(0, 8),
        recentEnquiries: permits(session, "forms:view") ? enquiries.slice(-5) : [],
        recentLogs: permits(session, "logs:view") ? logs.slice(-8) : [],
        lastSync: analytics.lastSync,
        storageMode: storageMode()
      },
      requestId: token(8)
    });
  }

  if (path === "admin/analytics" && request.method === "GET") return response({ success: true, data: await analyticsSummary(request), requestId: token(8) });
  const analyticsVisitorMatch = path.match(/^admin\/analytics\/visitors\/([^/]+)$/);
  if (analyticsVisitorMatch && request.method === "GET") {
    try {
      const visitorId = decodeURIComponent(analyticsVisitorMatch[1]);
      const data = await getAnalyticsVisitorJourney(visitorId, request.url);
      const enquiries = permits(session, "forms:view") ? await readEnquiryItems() : [];
      data.enquiries = (Array.isArray(enquiries) ? enquiries : [])
        .filter((item) => item.analyticsVisitorId === visitorId)
        .map((item) => ({
          id: item.id,
          name: item.name,
          company: item.company,
          email: item.email,
          country: item.country,
          product: item.product,
          industry: item.industry,
          status: item.status,
          submissionTime: item.submissionTime,
          sourcePage: item.sourcePage
        }));
      return response({ success: true, data, requestId: token(8) });
    } catch (error) {
      return response({ success: false, error: error?.message || String(error), requestId: token(8) }, 400);
    }
  }
  if (analyticsVisitorMatch && request.method === "POST") {
    try {
      const record = await updateAnalyticsVisitor(decodeURIComponent(analyticsVisitorMatch[1]), await bodyJson(request));
      await audit(session.user, "Visitor classification updated", "AnalyticsVisitor", record.visitorId, record.leadStatus);
      return response({ success: true, data: record, requestId: token(8) });
    } catch (error) {
      return response({ success: false, error: error?.message || String(error), requestId: token(8) }, 400);
    }
  }
  if (path === "admin/analytics/health" && request.method === "GET") {
    try {
      return response({ success: true, data: await analyticsHealth(), requestId: token(8) });
    } catch (error) {
      operationalLog("analytics_health_degraded", { reason: error?.message || String(error) });
      return response({
        success: true,
        data: {
          configured: Boolean(process.env.DATABASE_URL),
          mode: "degraded",
          message: "Analytics storage is applying a safe compatibility update. Refresh shortly for live results."
        },
        requestId: token(8)
      });
    }
  }
  if (path === "admin/analytics/exclusions" && request.method === "GET") {
    try {
      return response({ success: true, data: await getAnalyticsExclusionRules(), requestId: token(8) });
    } catch (error) {
      operationalLog("analytics_exclusions_degraded", { reason: error?.message || String(error) });
      return response({
        success: true,
        data: { storageMode: "degraded", items: [], message: "Exclusion rules are temporarily unavailable while analytics storage updates." },
        requestId: token(8)
      });
    }
  }
  if (path === "admin/analytics/exclusions" && request.method === "POST") {
    try {
      const rule = await saveAnalyticsExclusionRule(await bodyJson(request), session.user);
      await audit(session.user, "Analytics exclusion rule updated", "AnalyticsRule", rule.ruleKey, rule.label);
      return response({ success: true, data: rule, requestId: token(8) });
    } catch (error) {
      return response({ success: false, error: error?.message || String(error), requestId: token(8) }, 400);
    }
  }
  if (path === "admin/analytics/export" && request.method === "GET") {
    const report = await analyticsSummary(request);
    const rows = report.visitors?.items || [];
    return csvResponse("analytics-visitors.csv", rows);
  }
  if (path === "admin/seo" && request.method === "GET") return response({ success: true, data: await seoSummary(), requestId: token(8) });
  if (path === "admin/google-seo" && request.method === "GET") return response({ success: true, data: await googleSeoState(), requestId: token(8) });
  if (path === "admin/google-seo/sync" && request.method === "POST") {
    try {
      const result = await syncGoogleSeo(session.user);
      await audit(session.user, "Google SEO Sync", "GoogleSearchConsole", result.data.propertyUrl, `Synced ${result.data.summary.clicks} clicks and ${result.data.summary.impressions} impressions`);
      return response({ success: true, data: result, requestId: token(8) });
    } catch (error) {
      await audit(session.user, "Google SEO Sync Failed", "GoogleSearchConsole", "sync", error?.message || String(error));
      return response({ success: false, error: error?.message || String(error), requestId: token(8) }, 500);
    }
  }
  if (path === "admin/google-seo/inspection" && request.method === "POST") {
    try {
      const report = await runGoogleUrlInspection();
      await audit(session.user, "Google URL Inspection", "GoogleSearchConsole", report.propertyUrl, `Inspected ${report.total} sitemap URLs`);
      return response({ success: true, data: report, requestId: token(8) });
    } catch (error) {
      await audit(session.user, "Google URL Inspection Failed", "GoogleSearchConsole", "inspection", error?.message || String(error));
      return response({ success: false, error: error?.message || String(error), requestId: token(8) }, 500);
    }
  }
  if (path === "admin/sitemap" && request.method === "GET") {
    const [state, runs, manifest] = await Promise.all([
      readDataJson("data/seo/sitemap-state.json", {}),
      readDataJson("data/seo/sitemap-runs.json", []),
      readDataJson("data/seo/sitemap-manifest.json", { entries: [] })
    ]);
    return response({
      success: true,
      data: {
        state,
        latestRuns: runs.slice(0, 20),
        urlCount: manifest.entries?.length || 0,
        publicUrls: {
          index: `${productionSiteUrl()}/sitemap.xml`,
          robots: `${productionSiteUrl()}/robots.txt`
        }
      },
      requestId: token(8)
    });
  }
  if (path === "admin/sitemap" && request.method === "POST") {
    const body = await bodyJson(request);
    const result = await runSitemapAudit({
      trigger: `admin:${session.user}`,
      force: Boolean(body.force),
      dryRun: Boolean(body.dryRun),
      submit: Boolean(body.submit)
    });
    await audit(session.user, "Sitemap Generated", "Sitemap", result.run.id, `Processed ${result.run.totalUrls} URLs`);
    return response({ success: true, data: result.run, requestId: token(8) });
  }
  if (path === "admin/links" && request.method === "GET") return response({ success: true, data: await linksSummary(), requestId: token(8) });
  if (path === "admin/products" && request.method === "GET") {
    const [products, state] = await Promise.all([readJson("data/products/products.json"), readJson(EDITORIAL_PATH)]);
    const rows = products.map((product) => {
      const editorial = state && Object.hasOwn(state, product.slug) ? state[product.slug] : {};
      return { ...product, publication: editorial.draft ? "draft" : editorial.live ? "published" : "release", publishedAt: editorial.live?.publishedAt };
    });
    return response({ success: true, data: paginate(rows, request, { searchFields: ["name", "slug", "category", "categorySlug", "seoTitle", "shortDescription"], statusField: "productStatus", includeDeleted: new URL(request.url).searchParams.get("deleted") === "1" }), requestId: token(8) });
  }
  if (path === "admin/products/export" && request.method === "GET") return csvResponse("products.csv", filterList(await readJson("data/products/products.json"), request, { searchFields: ["name", "slug", "category", "categorySlug", "seoTitle", "shortDescription"], statusField: "productStatus" }).rows);
  if (path === "admin/categories" && ["GET", "PUT", "POST"].includes(request.method)) return adminCategories(request, session);
  const categoryAction = path.match(/^admin\/categories\/([^/]+)\/(delete|restore|enable|disable)$/);
  if (categoryAction && ["POST", "PUT"].includes(request.method)) return adminCategoryAction(request, session, decodeURIComponent(categoryAction[1]), categoryAction[2]);
  if (path === "admin/categories/export" && request.method === "GET") return csvResponse("categories.csv", filterList(await readJson("data/categories/categories.json"), request, { searchFields: ["name", "title", "slug", "description"] }).rows);

  const productMatch = path.match(/^admin\/products\/([a-z0-9-]+)(\/publish)?$/);
  if (productMatch && ["GET", "PUT", "POST"].includes(request.method)) {
    const [, slug, publish] = productMatch;
    const products = JSON.parse(await readFile(join(dataRoot, "products/products.json"), "utf8"));
    const product = products.find((item) => item.slug === slug);
    if (!product) return response({ success: false, error: "Product not found", requestId: token(8) }, 404);
    const url = product.canonicalUrl || productUrl(product);
    if (request.method === "GET" && !publish) {
      const state = await readJson(EDITORIAL_PATH) || {};
      return response({ success: true, data: {
        slug, url, name: product.name, limits: editorialLimits, ...(Object.hasOwn(state, slug) ? state[slug] : {})
      } });
    }
    if ((publish && request.method !== "POST") || (!publish && request.method !== "PUT")) {
      return response({ success: false, error: "Method not allowed" }, 405);
    }
    const body = await bodyJson(request);
    if (!publish && (!body.fields || Object.keys(body.fields).some((key) => !Object.hasOwn(editorialLimits, key)))) {
      return response({ success: false, error: "请通过产品编辑面板保存详情简介、搜索标题和摘要。" }, 400);
    }
    const state = await updateProductEditorial(await enquiryPool(), slug, {
      action: publish ? "publish" : "save", fields: body.fields, revision: String(body.revision || ""), actor: session.user
    });
    if (!state) return response({ success: false, error: "记录已被更新，请重新加载后再保存或发布。" }, 409);
    if (publish) scheduleSitemapAudit({ source: "products", action: "published", objectId: slug, url });
    await audit(session.user, publish ? "Product copy published" : "Product copy drafted", "Product", slug, publish ? "详情与搜索摘要已发布" : "已保存产品文案草稿");
    return response({ success: true, data: { slug, url, ...state }, requestId: token(8) });
  }

  if (path === "admin/enquiries" && request.method === "GET") return adminEnquiriesList(request);
  if (path === "admin/enquiries/export" && request.method === "GET") {
    await audit(session.user, "Enquiries Exported", "Enquiry", "csv", "Admin exported enquiry list");
    const { rows } = filterList(await readEnquiryItems(), request, { searchFields: ["id", "name", "company", "email", "country", "product", "sourcePage", "status"], statusField: "status", includeDeleted: true, dateFields: ["submissionTime", "createdAt"] });
    return csvResponse("enquiries.csv", rows.map((row) => Object.fromEntries(
      ["id", "submissionTime", "name", "company", "email", "whatsapp", "country", "product", "status", "sourcePage"].map((key) => [key, row[key]])
    )));
  }

  if (path === "admin/news" && request.method === "GET") return response({ success: true, data: paginate((await readJson("data/articles/articles.json")).filter((item) => item.article_type !== "blog"), request, { searchFields: ["slug", "title", "summary", "category", "status"], includeDeleted: new URL(request.url).searchParams.get("deleted") === "1" }), requestId: token(8) });
  if (path === "admin/news-automation" && request.method === "GET") return response({ success: true, data: await newsAutomationStatus(), requestId: token(8) });
  if (path === "admin/news-automation/sources" && request.method === "POST") {
    try {
      const source = await queueNewsSource(await bodyJson(request), session.user);
      await audit(session.user, "News Source Queued", "News automation", source.id, source.url);
      return response({ success: true, data: source, requestId: token(8) }, 201);
    } catch (error) {
      return response({ success: false, error: error?.message || String(error), requestId: token(8) }, 400);
    }
  }
  if (path === "admin/news-automation/review" && request.method === "POST") {
    try {
      const draft = await reviewNewsDraft(await bodyJson(request), session.user);
      await audit(session.user, "News Draft Reviewed", "News automation", draft.id, draft.qa?.passed ? "Passed quality gate" : draft.qa?.failures?.join("; ") || "Rejected");
      return response({ success: true, data: draft, requestId: token(8) });
    } catch (error) {
      return response({ success: false, error: error?.message || String(error), requestId: token(8) }, 400);
    }
  }
  if (path === "admin/news/export" && request.method === "GET") return csvResponse("news.csv", filterList((await readJson("data/articles/articles.json")).filter((item) => item.article_type !== "blog"), request, { searchFields: ["slug", "title", "summary", "category", "status"] }).rows);
  if (path === "admin/blog" && request.method === "GET") return response({ success: true, data: paginate((await readJson("data/articles/articles.json")).filter((item) => item.article_type === "blog"), request, { searchFields: ["slug", "title", "summary", "category", "status"], includeDeleted: new URL(request.url).searchParams.get("deleted") === "1" }), requestId: token(8) });
  if (path === "admin/blog/export" && request.method === "GET") return csvResponse("blog.csv", filterList((await readJson("data/articles/articles.json")).filter((item) => item.article_type === "blog"), request, { searchFields: ["slug", "title", "summary", "category", "status"] }).rows);
  if (path === "admin/news" && request.method === "PUT") {
    const body = await bodyJson(request);
    const slug = String(body.slug || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    if (!slug || !body.title) return response({ success: false, error: "Slug and title are required", requestId: token(8) }, 400);
    const articles = await readJson("data/articles/articles.json");
    const article = articles.find((item) => item.slug === slug);
    const hasField = (field) => Object.prototype.hasOwnProperty.call(body, field);
    const content = sanitizePublishedArticleHtml(hasField("content") ? body.content : article?.content || "");
    const sourceUrl = String(body.sourceUrl ?? body.source_url ?? article?.source_url ?? article?.sourceUrl ?? "").trim();
    const coverImage = validCoverImage(body.cover_image_url ?? body.coverImage ?? article?.cover_image_url ?? "");
    const status = String(body.status || article?.status || "published");
    if (!article && status === "published" && (!sourceUrl || !coverImage || plainText(content).length < 80)) {
      return response({ success: false, error: "Published News requires a source URL, owned cover image and complete article body", requestId: token(8) }, 400);
    }
    const payload = {
      article_type: "news",
      slug,
      title: String(body.title || ""),
      summary: String(body.summary ?? article?.summary ?? ""),
      content,
      date: String(body.date || article?.date || new Date().toISOString().slice(0, 10)),
      published_at: String(body.published_at || article?.published_at || new Date().toISOString()),
      status,
      category: String(body.category ?? article?.category ?? "Industry insight"),
      sourceUrl,
      source_url: sourceUrl,
      canonical_source_url: sourceUrl,
      source_name: String(body.source_name ?? article?.source_name ?? ""),
      source_published_at: String(body.source_published_at ?? article?.source_published_at ?? ""),
      cover_image_url: coverImage,
      cover_image_source_url: String(body.cover_image_source_url ?? article?.cover_image_source_url ?? ""),
      cover_image_page_url: String(body.cover_image_page_url ?? article?.cover_image_page_url ?? ""),
      cover_image_alt: String(body.cover_image_alt ?? article?.cover_image_alt ?? body.title ?? ""),
      cover_image_caption: String(body.cover_image_caption ?? article?.cover_image_caption ?? ""),
      cover_image_status: String(body.cover_image_status ?? article?.cover_image_status ?? "owned-media"),
      seoTitle: String(body.seoTitle ?? article?.seoTitle ?? body.title ?? ""),
      seoDescription: String(body.seoDescription ?? article?.seoDescription ?? body.summary ?? ""),
      manualOverrideAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    if (article) Object.assign(article, payload);
    else articles.unshift({ ...payload, createdAt: new Date().toISOString() });
    await writeJson("data/articles/articles.json", articles);
    scheduleSitemapAudit({ source: "news", action: article ? "updated" : "created", objectId: slug, url: `/en-za/news/${slug}/` });
    await audit(session.user, article ? "News Updated" : "News Created", "News", slug, `News article ${article ? "updated" : "created"} in Cowinmagnet Africa admin`);
    return response({ success: true, data: { slug }, requestId: token(8) });
  }

  const downloadMatch = path.match(/^admin\/enquiries\/([^/]+)\/attachments\/([^/]+)$/);
  if (downloadMatch && request.method === "GET") {
    const [, id, attachmentId] = downloadMatch;
    const file = await enquiryAttachment(await enquiryPool(), decodeURIComponent(id), attachmentId);
    if (!file) return response({ success: false, error: "Attachment was not found." }, 404);
    const name = encodeURIComponent(file.name.toWellFormed()).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16)}`);
    return new Response(file.stream, { headers: {
      "content-type": "application/octet-stream",
      "content-disposition": `attachment; filename*=UTF-8''${name}`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
      "x-robots-tag": "noindex, nofollow"
    } });
  }
  const receiptMatch = path.match(/^admin\/enquiries\/([^/]+)\/notification$/);
  if (receiptMatch && request.method === "POST") {
    const notification = await processEnquiryNotification(await enquiryPool(), decodeURIComponent(receiptMatch[1]), { manual: true });
    if (!notification) return response({ success: false, error: "This enquiry has no email receipt." }, 404);
    return response({ success: true, data: notification });
  }
  const enquiryMatch = path.match(/^admin\/enquiries\/([^/]+)$/);
  if (enquiryMatch && request.method === "GET") {
    const id = decodeURIComponent(enquiryMatch[1]);
    const data = await adminEnquiryDetail(id);
    if (!data) return response({ success: false, error: "Inquiry was not found", requestId: token(8) }, 404);
    return response({ success: true, data, requestId: token(8) });
  }
  if (enquiryMatch && request.method === "PUT") {
    const id = decodeURIComponent(enquiryMatch[1]);
    const body = await bodyJson(request);
    const updated = await updateEnquiry(await enquiryPool(), id, (item) => {
      const next = { ...item, updatedAt: new Date().toISOString() };
      if (["New", "In Progress", "Closed"].includes(body.status)) next.status = body.status;
      if (Object.hasOwn(body, "assignedUser")) next.assignedUser = String(body.assignedUser || "").slice(0, 160);
      if (body.note) {
        next.internalNotes = [...(item.internalNotes || []), { note: String(body.note).slice(0, 2000), user: session.user, time: next.updatedAt }];
      }
      return next;
    });
    if (!updated) return response({ success: false, error: "Inquiry was not found", requestId: token(8) }, 404);
    await audit(session.user, "Enquiry Status Changed", "Enquiry", id, "Enquiry updated in Cowinmagnet Africa admin");
    return response({ success: true, data: { id }, requestId: token(8) });
  }

  if (path === "admin/settings" && request.method === "GET") return response({ success: true, data: await readJson("data/cms/settings.json"), requestId: token(8) });
  if (path === "admin/storage-status" && request.method === "GET") {
    return response({
      success: true,
      data: {
        mode: storageMode(),
        databaseConfigured: Boolean(process.env.DATABASE_URL),
        writableFallback: process.env.VERCEL ? "tmp" : "project-file"
      },
      requestId: token(8)
    });
  }
  if (path === "admin/settings" && request.method === "PUT") {
    const body = await bodyJson(request);
    const existing = await readJson("data/cms/settings.json");
    const payload = { ...existing };
    for (const key of ["companyName", "brandName", "globalWebsite", "africaWebsite", "whatsapp", "defaultLanguage"]) {
      if (typeof body[key] === "string") payload[key] = body[key].trim().slice(0, 400);
    }
    for (const key of ["supportedLanguages", "marketCoverage"]) {
      if (Array.isArray(body[key])) payload[key] = body[key].filter((item) => typeof item === "string").slice(0, 50).map((item) => item.trim().slice(0, 120));
    }
    Object.assign(payload, { email: "info@cowinmagnet.com", timezone: ADMIN_TIMEZONE, updatedAt: new Date().toISOString() });
    await writeJson("data/cms/settings.json", payload);
    await audit(session.user, "Settings Changed", "Settings", "site", "Site settings updated");
    return response({ success: true, data: payload, requestId: token(8) });
  }

  if (path === "admin/media" && ["GET", "PUT", "POST"].includes(request.method)) return adminMedia(request, session);
  if (path === "admin/media/export" && request.method === "GET") return csvResponse("media.csv", filterList(await readJson("data/media/assets.json"), request, { searchFields: ["id", "filename", "url", "alt", "category", "mimeType"] }).rows);
  if (path === "admin/users" && ["GET", "PUT", "POST"].includes(request.method)) return adminUsers(request, session);
  if (path === "admin/sync" && request.method === "GET") return response({ success: true, data: await adminSyncState(request), requestId: token(8) });
  if (path === "admin/sync/google-seo" && request.method === "POST") {
    try {
      const result = await syncGoogleSeo(session.user);
      await audit(session.user, "Manual Sync", "Sync", "google-seo", `Manual Google SEO sync completed`);
      return response({ success: true, data: result, requestId: token(8) });
    } catch (error) {
      await audit(session.user, "Manual Sync Failed", "Sync", "google-seo", error?.message || String(error));
      return response({ success: false, error: error?.message || String(error), requestId: token(8) }, 500);
    }
  }
  if (path === "admin/audit-logs" && request.method === "GET") return response({ success: true, data: paginate(await readJson("data/cms/audit-logs.json"), request, { searchFields: ["user", "action", "object", "objectId", "summary"], includeDeleted: true }), requestId: token(8) });
  if (path === "admin/audit-logs/export" && request.method === "GET") return csvResponse("audit-logs.csv", filterList(await readJson("data/cms/audit-logs.json"), request, { searchFields: ["user", "action", "object", "objectId", "summary"], includeDeleted: true, dateFields: ["time"] }).rows);
  if (path === "admin/content" && request.method === "GET") {
    const [categories, industries, solutions, markets, articles, downloads] = await Promise.all([
      readJson("data/categories/categories.json"),
      readJson("data/industries/industries.json"),
      readJson("data/solutions/solutions.json"),
      readJson("data/markets/markets.json"),
      readJson("data/articles/articles.json"),
      readJson("data/downloads/downloads.json")
    ]);
    return response({ success: true, data: { categories, industries, solutions, markets, articles, downloads }, requestId: token(8) });
  }

  return response({ success: false, error: "API route not found", requestId: token(8) }, 404);
}

async function dispatchRoute(request, context) {
  const params = await context.params;
  const path = (params.path || []).join("/");

  if (path === "webhook/send_article") return handleArticleWebhook(request);
  if (path === "login" && request.method === "POST") return handleLogin(request);
  if (path === "admin/login" && request.method === "POST") return handleLogin(request, { redirect: true });
  if (path === "session" && request.method === "GET") return handleSession();
  if (path === "logout" && request.method === "POST") return handleLogout();
  if (path === "enquiries" && request.method === "POST") return handleEnquiries(request);
  const uploadPart = path.match(/^enquiry-uploads\/([^/]+)\/(\d+)$/);
  if ((path === "enquiry-uploads" || uploadPart) && request.method === "POST") return handleEnquiryUpload(request, uploadPart);
  if (path === "track" && request.method === "POST") return handleTrack(request);
  if (path === "cron/google-seo" && ["GET", "POST"].includes(request.method)) return handleCronGoogleSeo(request);
  if (path === "cron/gsc-inspection" && ["GET", "POST"].includes(request.method)) return handleCronGscInspection(request);
  if (path === "cron/news-publish" && ["GET", "POST"].includes(request.method)) return handleCronNewsAutomation(request);
  if (path === "cron/enquiry-notifications" && ["GET", "POST"].includes(request.method)) return handleEnquiryNotificationCron(request);
  if (path === "news" && request.method === "GET") return publicNewsList(request);
  if (path === "news/categories" && request.method === "GET") return publicNewsCategories();
  const publicNewsMatch = path.match(/^news\/([^/]+)$/);
  if (publicNewsMatch && request.method === "GET") return publicNewsDetail(decodeURIComponent(publicNewsMatch[1]));
  if (path === "blog" && request.method === "GET") return publicBlogList(request);
  const publicBlogMatch = path.match(/^blog\/([^/]+)$/);
  if (publicBlogMatch && request.method === "GET") return publicBlogDetail(decodeURIComponent(publicBlogMatch[1]));
  const productNewsMatch = path.match(/^products\/([^/]+)\/news$/);
  if (productNewsMatch && request.method === "GET") return publicProductNews(decodeURIComponent(productNewsMatch[1]));
  const productBlogMatch = path.match(/^products\/([^/]+)\/blog$/);
  if (productBlogMatch && request.method === "GET") return publicProductBlog(decodeURIComponent(productBlogMatch[1]));
  if (path.startsWith("admin/")) return handleAdmin(request, path);

  return response({ success: false, error: "API route not found", requestId: token(8) }, 404);
}

async function dispatch(request, context) {
  try {
    return await dispatchRoute(request, context);
  } catch (error) {
    const requestId = token(8);
    if (error instanceof InvalidDateRangeError) return response({ success: false, error: error.message, requestId }, 400);
    if (error instanceof EnquiryError) return response({ success: false, error: error.message, requestId }, error.status);
    const { path = [] } = await context.params;
    operationalLog("api_request_failed", { module: path.slice(0, 2).join("/"), requestId, code: error?.code || error?.name });
    return response({ success: false, error: "The service is temporarily unavailable. Please try again.", requestId }, 503);
  }
}

export const GET = dispatch;
export const POST = dispatch;
export const PUT = dispatch;
