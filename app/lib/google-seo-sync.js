import crypto from "node:crypto";
import { readFile } from "node:fs/promises";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/webmasters";

function base64url(value) {
  return Buffer.from(value).toString("base64url");
}

function todayOffset(days) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function parseServiceAccount() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON || process.env.GSC_SERVICE_ACCOUNT_JSON || "";
  if (raw) {
    const value = raw.trim().startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
    return JSON.parse(value);
  }
  if (process.env.GOOGLE_SERVICE_ACCOUNT_FILE) {
    return JSON.parse(await readFile(process.env.GOOGLE_SERVICE_ACCOUNT_FILE, "utf8"));
  }
  if (process.env.GOOGLE_CLIENT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
    return {
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
      token_uri: process.env.GOOGLE_TOKEN_URI || TOKEN_URL
    };
  }
  return null;
}

export function googleSeoConfig() {
  const hasJson = Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || process.env.GSC_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_SERVICE_ACCOUNT_FILE);
  const hasParts = Boolean(process.env.GOOGLE_CLIENT_EMAIL && process.env.GOOGLE_PRIVATE_KEY);
  const siteUrl = (
    process.env.GOOGLE_SEARCH_CONSOLE_SITE_URL ||
    process.env.GSC_SITE_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "https://cowinmagnet.co.za/"
  ).trim();
  return {
    enabled: String(process.env.GOOGLE_SEARCH_CONSOLE_ENABLED || "false").toLowerCase() === "true",
    configured: hasJson || hasParts,
    clientEmail: process.env.GOOGLE_CLIENT_EMAIL || (hasJson ? "Configured by service account JSON" : ""),
    propertyUrl: siteUrl.startsWith("sc-domain:") ? siteUrl : siteUrl.replace(/\/?$/, "/"),
    tokenUri: process.env.GOOGLE_TOKEN_URI || TOKEN_URL,
    sitemapUrl: (
      process.env.GOOGLE_SEARCH_CONSOLE_SITEMAP_URL ||
      `${(process.env.NEXT_PUBLIC_SITE_URL || "https://cowinmagnet.co.za").replace(/\/$/, "")}/sitemap.xml`
    ).trim()
  };
}

async function getAccessToken(fetchImpl = fetch) {
  const serviceAccount = await parseServiceAccount();
  if (!serviceAccount?.client_email || !serviceAccount?.private_key) {
    throw new Error("Google service account is not configured");
  }
  const now = Math.floor(Date.now() / 1000);
  const claim = {
    iss: serviceAccount.client_email,
    scope: SCOPE,
    aud: serviceAccount.token_uri || TOKEN_URL,
    iat: now,
    exp: now + 3600
  };
  const input = `${base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${base64url(JSON.stringify(claim))}`;
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(input);
  const assertion = `${input}.${signer.sign(serviceAccount.private_key, "base64url")}`;
  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion
  });
  const response = await fetchImpl(serviceAccount.token_uri || TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(20000)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error_description || data.error || `Google token HTTP ${response.status}`);
  return data.access_token;
}

const URL_INSPECTION_ENDPOINT = "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect";

function summarizeInspectionResult(url, data) {
  const index = data.inspectionResult?.indexStatusResult || {};
  return {
    url,
    verdict: index.verdict || "UNKNOWN",
    coverageState: index.coverageState || "Unknown",
    robotsTxtState: index.robotsTxtState || "UNKNOWN",
    indexingState: index.indexingState || "UNKNOWN",
    pageFetchState: index.pageFetchState || "UNKNOWN",
    googleCanonical: index.googleCanonical || "",
    userCanonical: index.userCanonical || "",
    lastCrawlTime: index.lastCrawlTime || "",
    referringUrls: index.referringUrls || [],
    sitemap: index.sitemap || []
  };
}

function inspectionGroups(results, key) {
  return Object.fromEntries(Object.entries(results.reduce((groups, item) => {
    const value = item[key] || "Unknown";
    groups[value] = (groups[value] || 0) + 1;
    return groups;
  }, {})).sort((left, right) => right[1] - left[1]));
}

export async function inspectGoogleUrls(urls, options = {}) {
  const config = googleSeoConfig();
  if (!config.configured && !options.accessToken) throw new Error("Google service account is not configured");
  const siteUrl = options.propertyUrl || config.propertyUrl;
  const fetchImpl = options.fetchImpl || fetch;
  const accessToken = options.accessToken || await getAccessToken(fetchImpl);
  const uniqueUrls = [...new Set((urls || []).filter(Boolean))];
  const concurrency = Math.min(5, Math.max(1, Number(options.concurrency || 3)));
  const results = new Array(uniqueUrls.length);
  let cursor = 0;

  async function worker() {
    while (cursor < uniqueUrls.length) {
      const index = cursor++;
      const url = uniqueUrls[index];
      try {
        const response = await fetchImpl(URL_INSPECTION_ENDPOINT, {
          method: "POST",
          headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
          body: JSON.stringify({ inspectionUrl: url, siteUrl, languageCode: "en-US" }),
          signal: AbortSignal.timeout(Number(options.timeoutMs || 30_000))
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error?.message || `URL Inspection HTTP ${response.status}`);
        results[index] = summarizeInspectionResult(url, data);
      } catch (error) {
        results[index] = { url, verdict: "ERROR", coverageState: "Inspection error", error: error?.message || String(error) };
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, uniqueUrls.length) }, worker));
  return {
    inspectedAt: new Date().toISOString(),
    propertyUrl: siteUrl,
    total: results.length,
    byVerdict: inspectionGroups(results, "verdict"),
    byCoverageState: inspectionGroups(results, "coverageState"),
    results
  };
}

async function googleRequest(path, accessToken, options = {}) {
  const { fetchImpl = fetch, ...requestOptions } = options;
  const response = await fetchImpl(`https://www.googleapis.com/webmasters/v3${path}`, {
    ...requestOptions,
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
      ...(requestOptions.headers || {})
    },
    signal: AbortSignal.timeout(30000)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message || data.error || `Google Search Console HTTP ${response.status}`);
  return data;
}

function classifyGoogleError(status, message) {
  if (status === 401) return "authentication";
  if (status === 403) return "permission";
  if (status === 429) return "quota";
  if (status >= 500) return "google-service";
  if (status >= 400) return "invalid-request";
  return /timeout|network|fetch/i.test(message || "") ? "network" : "unknown";
}

async function wait(delayMs) {
  await new Promise((resolve) => setTimeout(resolve, delayMs));
}

export async function submitSitemapToSearchConsole(options = {}) {
  const config = googleSeoConfig();
  const enabled = options.enabled ?? config.enabled;
  const siteUrl = options.siteUrl || options.propertyUrl || config.propertyUrl;
  const sitemapUrl = options.sitemapUrl || config.sitemapUrl;
  if (!enabled) return { attempted: false, submitted: false, reason: "disabled" };
  if (!config.configured && !options.accessToken) return { attempted: false, submitted: false, reason: "credentials-not-configured" };
  if (!siteUrl || !sitemapUrl) return { attempted: false, submitted: false, reason: "site-or-sitemap-url-missing" };
  const fetchImpl = options.fetchImpl || fetch;
  const sitemapResponse = await fetchImpl(sitemapUrl, {
    method: "GET",
    headers: { accept: "application/xml,text/xml;q=0.9,*/*;q=0.1" },
    signal: AbortSignal.timeout(Number(options.sitemapTimeoutMs || 15_000))
  });
  if (!sitemapResponse.ok) {
    throw new Error(`Sitemap accessibility check failed with HTTP ${sitemapResponse.status}`);
  }
  const accessToken = options.accessToken || await getAccessToken(fetchImpl);
  const endpoint = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/sitemaps/${encodeURIComponent(sitemapUrl)}`;
  const retries = Math.min(3, Math.max(0, Number(options.retries ?? 2)));
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetchImpl(endpoint, {
        method: "PUT",
        headers: { authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(Number(options.apiTimeoutMs || 20_000))
      });
      if (response.ok) {
        return {
          attempted: true,
          submitted: true,
          siteUrl,
          sitemapUrl,
          status: response.status,
          submittedAt: new Date().toISOString(),
          attempts: attempt + 1
        };
      }
      const payload = await response.json().catch(() => ({}));
      const message = payload?.error?.message || payload?.error || `Google Search Console HTTP ${response.status}`;
      const error = new Error(message);
      error.status = response.status;
      error.category = classifyGoogleError(response.status, message);
      if (![429, 500, 502, 503, 504].includes(response.status) || attempt === retries) throw error;
      lastError = error;
    } catch (error) {
      lastError = error;
      const status = Number(error?.status || 0);
      if ((status && ![429, 500, 502, 503, 504].includes(status)) || attempt === retries) {
        const wrapped = new Error(error?.message || String(error));
        wrapped.category = error?.category || classifyGoogleError(status, wrapped.message);
        wrapped.status = status || undefined;
        throw wrapped;
      }
    }
    await wait(300 * (2 ** attempt));
  }
  throw lastError || new Error("Google Search Console sitemap submission failed");
}

function normalizeRows(rows = []) {
  return rows.map((row) => ({
    keys: row.keys || [],
    clicks: Number(row.clicks || 0),
    impressions: Number(row.impressions || 0),
    ctr: Number(row.ctr || 0),
    position: Number(row.position || 0)
  }));
}

async function querySearchAnalytics(accessToken, siteUrl, body) {
  const encodedSite = encodeURIComponent(siteUrl);
  const data = await googleRequest(`/sites/${encodedSite}/searchAnalytics/query`, accessToken, {
    method: "POST",
    body: JSON.stringify(body)
  });
  return normalizeRows(data.rows || []);
}

function totalsFromRows(rows) {
  const row = rows[0] || {};
  return {
    clicks: Number(row.clicks || 0),
    impressions: Number(row.impressions || 0),
    ctr: Number(row.ctr || 0),
    position: Number(row.position || 0)
  };
}

export async function listGoogleSeoSites() {
  const accessToken = await getAccessToken();
  const data = await googleRequest("/sites", accessToken);
  return (data.siteEntry || []).map((item) => ({
    siteUrl: item.siteUrl,
    permissionLevel: item.permissionLevel
  }));
}

export async function runGoogleSeoSync(options = {}) {
  const config = googleSeoConfig();
  if (!config.configured) throw new Error("Google service account is not configured");
  const serviceAccount = await parseServiceAccount();
  const accessToken = await getAccessToken();
  const siteUrl = options.propertyUrl || config.propertyUrl;
  const endDate = options.endDate || todayOffset(-2);
  const startDate = options.startDate || todayOffset(-29);
  const previousEndDate = todayOffset(-30);
  const previousStartDate = todayOffset(-57);
  const baseBody = { startDate, endDate, dataState: "final" };
  const [
    sites,
    totalRows,
    previousRows,
    topPages,
    topQueries,
    countries,
    devices,
    dates,
    pageQueries
  ] = await Promise.all([
    googleRequest("/sites", accessToken).then((data) => data.siteEntry || []),
    querySearchAnalytics(accessToken, siteUrl, { ...baseBody, rowLimit: 1 }),
    querySearchAnalytics(accessToken, siteUrl, { startDate: previousStartDate, endDate: previousEndDate, dataState: "final", rowLimit: 1 }),
    querySearchAnalytics(accessToken, siteUrl, { ...baseBody, dimensions: ["page"], rowLimit: 100 }),
    querySearchAnalytics(accessToken, siteUrl, { ...baseBody, dimensions: ["query"], rowLimit: 100 }),
    querySearchAnalytics(accessToken, siteUrl, { ...baseBody, dimensions: ["country"], rowLimit: 50 }),
    querySearchAnalytics(accessToken, siteUrl, { ...baseBody, dimensions: ["device"], rowLimit: 10 }),
    querySearchAnalytics(accessToken, siteUrl, { ...baseBody, dimensions: ["date"], rowLimit: 40 }),
    querySearchAnalytics(accessToken, siteUrl, { ...baseBody, dimensions: ["page", "query"], rowLimit: 250 })
  ]);
  const summary = totalsFromRows(totalRows);
  const previousSummary = totalsFromRows(previousRows);
  return {
    syncedAt: new Date().toISOString(),
    propertyUrl: siteUrl,
    startDate,
    endDate,
    previousStartDate,
    previousEndDate,
    serviceAccountEmail: serviceAccount?.client_email || config.clientEmail,
    sites: sites.map((item) => ({ siteUrl: item.siteUrl, permissionLevel: item.permissionLevel })),
    summary,
    previousSummary,
    deltas: {
      clicks: summary.clicks - previousSummary.clicks,
      impressions: summary.impressions - previousSummary.impressions,
      ctr: summary.ctr - previousSummary.ctr,
      position: summary.position - previousSummary.position
    },
    topPages,
    topQueries,
    countries,
    devices,
    dates,
    pageQueries
  };
}
