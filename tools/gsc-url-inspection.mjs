import crypto from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const INSPECTION_URL = "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect";
const DEFAULT_SITE = "sc-domain:cowinmagnet.co.za";
const DEFAULT_SITEMAP = "https://cowinmagnet.co.za/sitemap.xml";

function option(name, fallback = "") {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] || fallback : fallback;
}

function base64url(value) {
  return Buffer.from(typeof value === "string" ? value : JSON.stringify(value)).toString("base64url");
}

async function serviceAccount() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON || process.env.GSC_SERVICE_ACCOUNT_JSON;
  if (raw) return JSON.parse(raw.trim().startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8"));
  const file = process.env.GOOGLE_SERVICE_ACCOUNT_FILE || option("--credentials");
  if (!file) throw new Error("Provide GOOGLE_SERVICE_ACCOUNT_FILE or --credentials <path>");
  return JSON.parse(await readFile(resolve(file), "utf8"));
}

async function accessToken(account) {
  const now = Math.floor(Date.now() / 1000);
  const input = `${base64url({ alg: "RS256", typ: "JWT" })}.${base64url({
    iss: account.client_email,
    scope: "https://www.googleapis.com/auth/webmasters",
    aud: account.token_uri || TOKEN_URL,
    iat: now,
    exp: now + 3600
  })}`;
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(input);
  const assertion = `${input}.${signer.sign(account.private_key, "base64url")}`;
  const response = await fetch(account.token_uri || TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth2:grant-type:jwt-bearer", assertion }),
    signal: AbortSignal.timeout(20_000)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error_description || data.error || `Google token HTTP ${response.status}`);
  return data.access_token;
}

function xmlLocations(xml) {
  return [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => match[1].replaceAll("&amp;", "&"));
}

async function fetchXml(url) {
  const response = await fetch(url, { headers: { accept: "application/xml,text/xml" }, signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  return response.text();
}

async function sitemapUrls(indexUrl) {
  const index = await fetchXml(indexUrl);
  const locations = xmlLocations(index);
  if (!/<sitemapindex\b/.test(index)) return locations;
  const childXml = await Promise.all(locations.map(fetchXml));
  return [...new Set(childXml.flatMap(xmlLocations))];
}

function resultSummary(item) {
  const index = item.inspectionResult?.indexStatusResult || {};
  return {
    url: item.inspectionUrl,
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

async function inspectUrl(url, siteUrl, token) {
  const response = await fetch(INSPECTION_URL, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ inspectionUrl: url, siteUrl, languageCode: "en-US" }),
    signal: AbortSignal.timeout(30_000)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message || `URL Inspection HTTP ${response.status}`);
  return resultSummary({ inspectionUrl: url, ...data });
}

async function concurrentMap(values, concurrency, worker) {
  const output = new Array(values.length);
  let cursor = 0;
  async function run() {
    while (cursor < values.length) {
      const index = cursor++;
      try {
        output[index] = await worker(values[index]);
      } catch (error) {
        output[index] = { url: values[index], verdict: "ERROR", error: error?.message || String(error) };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, run));
  return output;
}

async function auditPublicUrl(url) {
  try {
    const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(20_000) });
    const html = await response.text();
    const canonical = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)/i)?.[1]
      || html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical/i)?.[1]
      || "";
    return {
      url,
      status: response.status,
      location: response.headers.get("location") || "",
      canonical
    };
  } catch (error) {
    return { url, status: 0, error: error?.message || String(error) };
  }
}

function group(results, key) {
  return Object.fromEntries(Object.entries(results.reduce((groups, item) => {
    const value = item[key] || "Unknown";
    groups[value] = (groups[value] || 0) + 1;
    return groups;
  }, {})).sort((left, right) => right[1] - left[1]));
}

const siteUrl = option("--site", process.env.GOOGLE_SEARCH_CONSOLE_SITE_URL || DEFAULT_SITE);
const sitemapUrl = option("--sitemap", process.env.GOOGLE_SEARCH_CONSOLE_SITEMAP_URL || DEFAULT_SITEMAP);
const limit = Math.max(0, Number(option("--limit", "0")) || 0);
const outputFile = resolve(option("--output", "data/seo/gsc-url-inspection.json"));
const urls = (await sitemapUrls(sitemapUrl)).slice(0, limit || undefined);
if (process.argv.includes("--http-audit")) {
  const results = await concurrentMap(urls, Math.min(12, Math.max(1, Number(option("--concurrency", "8")) || 8)), auditPublicUrl);
  const report = {
    auditedAt: new Date().toISOString(),
    sitemapUrl,
    total: results.length,
    status200: results.filter((item) => item.status === 200).length,
    redirects: results.filter((item) => item.location).length,
    canonicalMismatch: results.filter((item) => item.canonical && item.canonical !== item.url).length,
    missingCanonical: results.filter((item) => !item.canonical).length,
    errors: results.filter((item) => item.status === 0).length,
    issues: results.filter((item) => item.status !== 200 || item.location || !item.canonical || item.canonical !== item.url)
  };
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.issues.length ? 1 : 0);
}
const token = await accessToken(await serviceAccount());
const results = await concurrentMap(urls, Math.min(5, Math.max(1, Number(option("--concurrency", "3")) || 3)), (url) => inspectUrl(url, siteUrl, token));
const report = {
  inspectedAt: new Date().toISOString(),
  siteUrl,
  sitemapUrl,
  total: results.length,
  byVerdict: group(results, "verdict"),
  byCoverageState: group(results, "coverageState"),
  results
};
await mkdir(dirname(outputFile), { recursive: true });
await writeFile(outputFile, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  inspectedAt: report.inspectedAt,
  total: report.total,
  byVerdict: report.byVerdict,
  byCoverageState: report.byCoverageState,
  output: outputFile
}, null, 2));
