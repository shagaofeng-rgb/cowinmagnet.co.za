import crypto from "node:crypto";
import { readFile } from "node:fs/promises";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";

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
    configured: hasJson || hasParts,
    clientEmail: process.env.GOOGLE_CLIENT_EMAIL || (hasJson ? "Configured by service account JSON" : ""),
    propertyUrl: siteUrl.startsWith("sc-domain:") ? siteUrl : siteUrl.replace(/\/?$/, "/"),
    tokenUri: process.env.GOOGLE_TOKEN_URI || TOKEN_URL
  };
}

async function getAccessToken() {
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
  const response = await fetch(serviceAccount.token_uri || TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(20000)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error_description || data.error || `Google token HTTP ${response.status}`);
  return data.access_token;
}

async function googleRequest(path, accessToken, options = {}) {
  const response = await fetch(`https://www.googleapis.com/webmasters/v3${path}`, {
    ...options,
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
      ...(options.headers || {})
    },
    signal: AbortSignal.timeout(30000)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message || data.error || `Google Search Console HTTP ${response.status}`);
  return data;
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
