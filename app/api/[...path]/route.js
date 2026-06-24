import crypto from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, normalize, sep } from "node:path";
import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const root = process.cwd();
const dataRoot = join(root, "data");
const writableDataRoot = join(tmpdir(), "cowinmagnet-africa-data");
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
const adminEmail = (process.env.ADMIN_EMAIL || process.env.ADMIN_USER || "davidsha@cowinmagnet.com").trim().toLowerCase();
const adminUser = process.env.ADMIN_USER || adminEmail;
const bootstrapAdminSecret = "5JIAbVeSKp8Pem7s6vKyHctMoBL7EUOySRTJkTK9SbU";
const bootstrapAdminPasswordHash = "e5fb073a922b15a1ad52661b2ac7f3c9d4c6c674400d8f7aa9b42418bb475da3";

function sessionSecret() {
  return (
    process.env.ADMIN_JWT_SECRET ||
    process.env.ADMIN_SESSION_SECRET ||
    process.env.ADMIN_PASSWORD_HASH ||
    process.env.ADMIN_PASSWORD ||
    process.env.ADMIN_DEFAULT_PASSWORD ||
    bootstrapAdminSecret
  );
}

const jsonFiles = new Map([
  ["data/cms/enquiries.json", []],
  ["data/cms/audit-logs.json", []],
  ["data/cms/analytics-events.json", []],
  ["data/cms/settings.json", {
    companyName: "Quzhou Qiying Import & Export Co., Ltd.",
    brandName: "Cowinmagnet",
    globalWebsite: "https://www.cowinmagnet.com",
    africaWebsite: "https://cowinmagnet.co.za/en-za/",
    email: "davidsha@cowinmagnet.com",
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

function hashAdminPassword(password) {
  return hash(`${password}:${sessionSecret()}`);
}

function isAdminAuthConfigured() {
  return Boolean(process.env.ADMIN_PASSWORD_HASH || process.env.ADMIN_PASSWORD || process.env.ADMIN_DEFAULT_PASSWORD || bootstrapAdminPasswordHash);
}

function passwordVariants(password) {
  const value = String(password || "");
  return [...new Set([value, value.replaceAll("锛?", "!"), value.replaceAll("!", "锛?")])];
}

function verifyAdminCredentials(identifier, password) {
  const normalized = String(identifier || "").trim().toLowerCase();
  const validIdentity = normalized === adminEmail || normalized === String(adminUser).trim().toLowerCase();
  if (!validIdentity || !password || !isAdminAuthConfigured()) return false;

  const variants = passwordVariants(password);
  const expectedHash = process.env.ADMIN_PASSWORD_HASH || bootstrapAdminPasswordHash;
  if (expectedHash) return variants.some((item) => hashAdminPassword(item) === expectedHash);
  if (process.env.ADMIN_PASSWORD) return variants.includes(process.env.ADMIN_PASSWORD);
  if (process.env.ADMIN_DEFAULT_PASSWORD) return variants.includes(process.env.ADMIN_DEFAULT_PASSWORD);
  return false;
}

async function readJson(relativePath) {
  const cleanPath = normalize(relativePath.replace(/^data[\\/]/, ""));
  if (cleanPath.startsWith("..") || cleanPath.includes(`..${sep}`)) return jsonFiles.get(relativePath) ?? null;
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

async function bodyJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function makeSessionCookie(csrf) {
  const payload = {
    user: adminEmail,
    email: adminEmail,
    role: "Super Admin",
    csrf,
    expiresAt: new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString()
  };
  const payload64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${payload64}.${hash(`${payload64}.${sessionSecret()}`)}.v1`;
}

async function getSession() {
  const cookieStore = await cookies();
  const value = cookieStore.get("cowin_admin_session")?.value;
  if (!value) return null;

  const [payload64, signature] = value.split(".");
  if (!payload64 || !signature || signature !== hash(`${payload64}.${sessionSecret()}`)) return null;

  try {
    const payload = JSON.parse(Buffer.from(payload64, "base64url").toString("utf8"));
    if (new Date(payload.expiresAt).getTime() < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

async function requireAdmin(request) {
  const session = await getSession();
  if (!session) {
    return { error: response({ success: false, error: "Unauthorized", requestId: token(8) }, 401) };
  }

  if (!["GET", "HEAD"].includes(request.method)) {
    const csrf = request.headers.get("x-csrf-token");
    if (!csrf || csrf !== session.csrf) {
      return { error: response({ success: false, error: "CSRF validation failed", requestId: token(8) }, 403) };
    }
  }

  return { session };
}

async function audit(user, action, object, objectId, summary) {
  const logs = await readJson("data/cms/audit-logs.json");
  logs.push({
    id: token(10),
    user,
    action,
    object,
    objectId,
    summary,
    time: new Date().toISOString(),
    ip: "next-api"
  });
  await writeJson("data/cms/audit-logs.json", logs.slice(-500));
}

async function analyticsSummary() {
  const events = await readJson("data/cms/analytics-events.json");
  const enquiries = await readJson("data/cms/enquiries.json");
  const pageviews = events.filter((event) => event.eventType === "pageview");
  const visitors = new Set(pageviews.map((event) => event.clientId));

  function topBy(key, label, valueLabel, limit = 10) {
    const counts = new Map();
    for (const item of pageviews) counts.set(item[key] || "Unknown", (counts.get(item[key] || "Unknown") || 0) + 1);
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([name, count]) => ({ [label]: name, [valueLabel]: count }));
  }

  const deviceBrowserCounts = new Map();
  for (const item of pageviews) {
    const key = `${item.device || "Desktop"}|||${item.browser || "Browser"}`;
    deviceBrowserCounts.set(key, (deviceBrowserCounts.get(key) || 0) + 1);
  }

  return {
    pv: pageviews.length,
    uv: visitors.size,
    events: events.length,
    enquiries: enquiries.length,
    countries: topBy("country", "name", "count"),
    pages: topBy("page", "page", "views", 20),
    sources: topBy("source", "source", "views"),
    deviceBrowsers: [...deviceBrowserCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([key, views]) => {
        const [device, browser] = key.split("|||");
        return { device, browser, views };
      }),
    visitors: pageviews.sort((a, b) => String(b.time).localeCompare(String(a.time))).slice(0, 200),
    lastSync: new Date().toISOString().replace("T", " ").slice(0, 19)
  };
}

function productUrl(product) {
  return `/en-za/products/${product.categorySlug || "products"}/${product.slug || ""}/`;
}

async function seoSummary() {
  const [products, articles, categories, industries, solutions, markets] = await Promise.all([
    readJson("data/products/products.json"),
    readJson("data/articles/articles.json"),
    readJson("data/categories/categories.json"),
    readJson("data/industries/industries.json"),
    readJson("data/solutions/solutions.json"),
    readJson("data/markets/markets.json")
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
    ...articles.map((item) => ({
      page: `/en-za/news/${item.slug}/`,
      title: item.seoTitle || item.title ? "OK" : "Missing",
      description: item.seoDescription || item.summary ? "OK" : "Missing",
      image: item.image || item.openGraphImage ? "OK" : "Pending",
      canonical: item.canonicalUrl || `/en-za/news/${item.slug}/`,
      status: item.status || "published"
    })),
    ...[...categories, ...industries, ...solutions, ...markets].map((item) => ({
      page: item.slug ? `/${item.slug}/` : "",
      title: item.name || item.title ? "OK" : "Missing",
      description: item.description || item.summary ? "OK" : "Missing",
      image: item.image ? "OK" : "Pending",
      canonical: item.canonicalUrl || "",
      status: item.status || "published"
    }))
  ];

  return {
    total: rows.length,
    missingTitle: rows.filter((row) => row.title !== "OK").length,
    missingDescription: rows.filter((row) => row.description !== "OK").length,
    missingImage: rows.filter((row) => row.image === "Missing").length,
    rows
  };
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
    { module: "News", count: articles.length, status: articles.length ? "OK" : "Empty", note: "News list and detail pages" },
    { module: "Downloads", count: downloads.length, status: downloads.length ? "Review" : "Empty", note: "PDF paths should be verified before publication" }
  ];

  return {
    internal: products.length + categories.length + industries.length + solutions.length + markets.length + articles.length,
    external: markets.length + downloads.length,
    empty: rows.filter((row) => row.status === "Empty").length,
    warnings: rows.filter((row) => row.status !== "OK").length,
    rows
  };
}

function sourceFromReferrer(referrer) {
  if (/google|bing|yahoo|duckduckgo/i.test(referrer)) return "Search";
  if (/linkedin|facebook|tiktok|twitter|x\.com/i.test(referrer)) return "Social";
  if (referrer) return "Referral";
  return "Direct";
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
  if (!isAdminAuthConfigured()) {
    if (wantsRedirect) return NextResponse.redirect(new URL("/admin/login/?error=not-configured", url), 303);
    return response({ success: false, error: "Admin password is not configured", requestId: token(8) }, 503);
  }

  if (verifyAdminCredentials(body.identifier, body.password)) {
    const csrf = token(24);
    const res = wantsRedirect
      ? NextResponse.redirect(new URL("/admin/dashboard", url), 303)
      : response({ success: true, data: { user: adminEmail, role: "Super Admin", csrf }, requestId: token(8) });
    res.cookies.set("cowin_admin_session", makeSessionCookie(csrf), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: SESSION_TTL_SECONDS
    });
    await audit(adminEmail, "Login", "Session", "next", "Admin signed in to Next.js CMS");
    return res;
  }
  if (wantsRedirect) return NextResponse.redirect(new URL("/admin/login/?error=invalid", url), 303);
  return response({ success: false, error: "Invalid username or password", requestId: token(8) }, 401);
}

async function handleSession() {
  const session = await getSession();
  if (!session) return response({ success: false, error: "Unauthorized", requestId: token(8) }, 401);
  return response({ success: true, data: { user: session.user, email: session.email || session.user, role: session.role, csrf: session.csrf }, requestId: token(8) });
}

function handleLogout() {
  const res = response({ success: true, data: { loggedOut: true }, requestId: token(8) });
  res.cookies.set("cowin_admin_session", "", { path: "/", maxAge: 0 });
  return res;
}

async function handleEnquiries(request) {
  const body = await bodyJson(request);
  if (!body.name || !body.email) return response({ success: false, error: "Name and email are required", requestId: token(8) }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) return response({ success: false, error: "Valid email is required", requestId: token(8) }, 400);

  const items = await readJson("data/cms/enquiries.json");
  const id = `ENQ-${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}-${token(4)}`;
  const record = {
    id,
    name: String(body.name || ""),
    company: String(body.company || ""),
    country: String(body.country || ""),
    region: String(body.region || ""),
    email: String(body.email || ""),
    whatsapp: String(body.whatsapp || ""),
    preferredLanguage: String(body.preferredLanguage || ""),
    product: String(body.productRequired || ""),
    industry: String(body.industry || ""),
    sourcePage: String(body.sourcePage || ""),
    payload: body,
    status: "New",
    assignedUser: "",
    internalNotes: [],
    submissionTime: new Date().toISOString(),
    utm: {}
  };
  items.push(record);
  await writeJson("data/cms/enquiries.json", items);
  await audit("public-form", "Enquiry Created", "Enquiry", id, `New website inquiry saved from ${record.sourcePage}`);
  return response({ success: true, data: record, requestId: token(8) });
}

async function handleTrack(request) {
  const body = await bodyJson(request);
  const headerStore = await headers();
  const events = await readJson("data/cms/analytics-events.json");
  const clientId = body.clientId ? String(body.clientId) : `C${token(4)}`;
  const referrer = headerStore.get("referer") || String(body.referrer || "");
  const source = sourceFromReferrer(referrer);
  const record = {
    id: token(10),
    eventType: body.eventType ? String(body.eventType) : "pageview",
    time: new Date().toISOString(),
    clientId,
    country: body.country ? String(body.country) : "Unknown",
    device: body.device ? String(body.device) : "Desktop",
    browser: body.browser ? String(body.browser) : "Browser",
    source,
    sourcePlatform: source === "Direct" ? "Direct entry" : "External",
    sourceDetail: referrer || "No referrer or UTM",
    page: body.page ? String(body.page) : "/",
    ip: headerStore.get("x-forwarded-for")?.split(",")[0] || "unknown",
    tag: events.some((event) => event.clientId === clientId) ? "Returning" : "New",
    visitDay: new Date().toISOString().slice(0, 10).replaceAll("-", "/"),
    userAgent: headerStore.get("user-agent") || ""
  };
  events.push(record);
  await writeJson("data/cms/analytics-events.json", events.slice(-5000));
  return response({ success: true, data: { id: record.id, clientId }, requestId: token(8) });
}

async function handleAdmin(request, path) {
  const { session, error } = await requireAdmin(request);
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
      readJson("data/cms/enquiries.json"),
      readJson("data/cms/audit-logs.json"),
      analyticsSummary()
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
        articles: articles.length,
        downloads: downloads.length,
        unreadEnquiries: enquiries.filter((item) => item.status === "New").length,
        missingSeo: products.filter((item) => !item.seoTitle || !item.seoDescription).length,
        missingImages: products.filter((item) => !item.image).length,
        languages: ["en-za", "af-za", "zu-za", "xh-za", "st-za", "tn-za"],
        topPages: analytics.pages,
        topSources: analytics.sources,
        recentVisitors: analytics.visitors.slice(0, 8),
        recentEnquiries: enquiries.slice(-5),
        recentLogs: logs.slice(-8),
        lastSync: analytics.lastSync
      },
      requestId: token(8)
    });
  }

  if (path === "admin/analytics" && request.method === "GET") return response({ success: true, data: await analyticsSummary(), requestId: token(8) });
  if (path === "admin/seo" && request.method === "GET") return response({ success: true, data: await seoSummary(), requestId: token(8) });
  if (path === "admin/links" && request.method === "GET") return response({ success: true, data: await linksSummary(), requestId: token(8) });
  if (path === "admin/products" && request.method === "GET") return response({ success: true, data: await readJson("data/products/products.json"), requestId: token(8) });

  const productMatch = path.match(/^admin\/products\/([^/]+)$/);
  if (productMatch && request.method === "PUT") {
    const slug = decodeURIComponent(productMatch[1]);
    const body = await bodyJson(request);
    const products = await readJson("data/products/products.json");
    const product = products.find((item) => item.slug === slug);
    if (!product) return response({ success: false, error: "Product not found", requestId: token(8) }, 404);
    for (const key of ["name", "categorySlug", "category", "shortDescription", "fullDescription", "seoTitle", "seoDescription", "cleaning", "layout", "type", "image"]) {
      if (Object.hasOwn(body, key)) product[key] = body[key];
    }
    if (body.applications) product.applications = body.applications;
    if (body.features) product.features = body.features;
    product.updatedAt = new Date().toISOString();
    await writeJson("data/products/products.json", products);
    await audit(session.user, "Product Updated", "Product", slug, "Product content edited in Next.js CMS");
    return response({ success: true, data: { slug }, requestId: token(8) });
  }

  if (path === "admin/enquiries" && request.method === "GET") return response({ success: true, data: await readJson("data/cms/enquiries.json"), requestId: token(8) });

  if (path === "admin/news" && request.method === "GET") return response({ success: true, data: await readJson("data/articles/articles.json"), requestId: token(8) });
  if (path === "admin/news" && request.method === "PUT") {
    const body = await bodyJson(request);
    const slug = String(body.slug || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    if (!slug || !body.title) return response({ success: false, error: "Slug and title are required", requestId: token(8) }, 400);
    const articles = await readJson("data/articles/articles.json");
    const article = articles.find((item) => item.slug === slug);
    const payload = {
      slug,
      title: String(body.title || ""),
      summary: String(body.summary || ""),
      date: String(body.date || new Date().toISOString().slice(0, 10)),
      status: String(body.status || "published"),
      sourceUrl: String(body.sourceUrl || ""),
      seoTitle: String(body.seoTitle || body.title || ""),
      seoDescription: String(body.seoDescription || body.summary || ""),
      updatedAt: new Date().toISOString()
    };
    if (article) Object.assign(article, payload);
    else articles.unshift({ ...payload, createdAt: new Date().toISOString() });
    await writeJson("data/articles/articles.json", articles);
    await audit(session.user, article ? "News Updated" : "News Created", "News", slug, `News article ${article ? "updated" : "created"} in Next.js CMS`);
    return response({ success: true, data: { slug }, requestId: token(8) });
  }

  const enquiryMatch = path.match(/^admin\/enquiries\/([^/]+)$/);
  if (enquiryMatch && request.method === "PUT") {
    const id = decodeURIComponent(enquiryMatch[1]);
    const body = await bodyJson(request);
    const items = await readJson("data/cms/enquiries.json");
    const item = items.find((entry) => entry.id === id);
    if (item) {
      if (body.status) item.status = String(body.status);
      if (body.assignedUser) item.assignedUser = String(body.assignedUser);
      if (body.note) {
        item.internalNotes = [...(item.internalNotes || []), { note: String(body.note), user: session.user, time: new Date().toISOString() }];
      }
    }
    await writeJson("data/cms/enquiries.json", items);
    await audit(session.user, "Enquiry Status Changed", "Enquiry", id, "Enquiry updated in Next.js CMS");
    return response({ success: true, data: { id }, requestId: token(8) });
  }

  if (path === "admin/settings" && request.method === "GET") return response({ success: true, data: await readJson("data/cms/settings.json"), requestId: token(8) });
  if (path === "admin/settings" && request.method === "PUT") {
    const body = await bodyJson(request);
    body.updatedAt = new Date().toISOString();
    await writeJson("data/cms/settings.json", body);
    await audit(session.user, "Settings Changed", "Settings", "site", "Site settings updated");
    return response({ success: true, data: body, requestId: token(8) });
  }

  if (path === "admin/audit-logs" && request.method === "GET") return response({ success: true, data: await readJson("data/cms/audit-logs.json"), requestId: token(8) });
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

async function dispatch(request, context) {
  const params = await context.params;
  const path = (params.path || []).join("/");

  if (path === "login" && request.method === "POST") return handleLogin(request);
  if (path === "admin/login" && request.method === "POST") return handleLogin(request, { redirect: true });
  if (path === "session" && request.method === "GET") return handleSession();
  if (path === "logout" && request.method === "POST") return handleLogout();
  if (path === "enquiries" && request.method === "POST") return handleEnquiries(request);
  if (path === "track" && request.method === "POST") return handleTrack(request);
  if (path.startsWith("admin/")) return handleAdmin(request, path);

  return response({ success: false, error: "API route not found", requestId: token(8) }, 404);
}

export const GET = dispatch;
export const POST = dispatch;
export const PUT = dispatch;
