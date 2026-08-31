import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const origin = (process.argv.find((item) => item.startsWith("--origin="))?.split("=")[1] || "https://cowinmagnet.co.za").replace(/\/$/, "");
const output = process.argv.find((item) => item.startsWith("--output="))?.split("=")[1] || "reports/full-site-audit-20260831/production-site-audit.json";
const root = process.cwd();

const decode = (value = "") => String(value)
  .replace(/&amp;/gi, "&")
  .replace(/&quot;/gi, '"')
  .replace(/&#39;|&apos;/gi, "'")
  .replace(/&lt;/gi, "<")
  .replace(/&gt;/gi, ">");
const matches = (value, pattern) => [...String(value).matchAll(pattern)].map((match) => decode(match[1] || "").trim()).filter(Boolean);
const onAuditOrigin = (value) => {
  const parsed = new URL(value, origin);
  return new URL(`${parsed.pathname}${parsed.search}`, origin).toString();
};

async function fetchText(url, options = {}) {
  try {
    const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(20_000), ...options });
    return { url, status: response.status, headers: Object.fromEntries(response.headers), body: await response.text(), error: null };
  } catch (error) {
    return { url, status: 0, headers: {}, body: "", error: error?.message || String(error) };
  }
}

async function mapLimit(items, limit, callback) {
  const results = new Array(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await callback(items[index], index);
    }
  }));
  return results;
}

const index = await fetchText(`${origin}/sitemap.xml`);
if (index.status !== 200) throw new Error(`Unable to load sitemap index: ${index.status} ${index.error || ""}`.trim());
const sitemapUrls = matches(index.body, /<loc>([^<]+)<\/loc>/gi).map(onAuditOrigin);
const sitemapResponses = await mapLimit(sitemapUrls, 6, fetchText);
const pageUrls = [...new Set(sitemapResponses.flatMap((item) => matches(item.body, /<loc>([^<]+)<\/loc>/gi).map(onAuditOrigin)))];
const pages = await mapLimit(pageUrls, 10, async (url) => {
  const response = await fetchText(url);
  const html = response.body;
  const titles = matches(html, /<title[^>]*>([\s\S]*?)<\/title>/gi);
  const descriptions = matches(html, /<meta\s+name=["']description["']\s+content=["']([^"']*)["'][^>]*>/gi);
  const canonicals = matches(html, /<link\s+rel=["']canonical["']\s+href=["']([^"']+)["'][^>]*>/gi);
  const h1s = matches(html, /<h1\b[^>]*>([\s\S]*?)<\/h1>/gi).map((item) => item.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
  const htmlLang = (html.match(/<html\b[^>]*\blang=["']([^"']+)["']/i) || [])[1] || "";
  const robots = (html.match(/<meta\s+name=["']robots["']\s+content=["']([^"']+)["']/i) || [])[1] || "";
  const images = [...html.matchAll(/<img\b([^>]*)>/gi)].map((match) => {
    const attributes = match[1];
    return {
      src: (attributes.match(/\bsrc=["']([^"']+)["']/i) || [])[1] || "",
      hasAlt: /\balt=["'][^"']*["']/i.test(attributes)
    };
  });
  const failures = [];
  if (response.status !== 200) failures.push(`status:${response.status}`);
  if (titles.length !== 1) failures.push(`title-count:${titles.length}`);
  if (descriptions.length !== 1 || descriptions[0].length < 50) failures.push(`description:${descriptions.length ? descriptions[0].length : 0}`);
  if (canonicals.length !== 1) failures.push(`canonical-count:${canonicals.length}`);
  if (h1s.length !== 1) failures.push(`h1-count:${h1s.length}`);
  if (htmlLang.toLowerCase() !== "en-za") failures.push(`lang:${htmlLang || "missing"}`);
  if (/noindex/i.test(robots)) failures.push("sitemap-page-noindex");
  if (images.some((image) => !image.hasAlt)) failures.push(`images-without-alt:${images.filter((image) => !image.hasAlt).length}`);
  if (/\uFFFD|seo meta|primary keyword|cms checklist/i.test(html)) failures.push("public-content-leak");
  return { url, status: response.status, title: titles[0] || "", description: descriptions[0] || "", canonical: canonicals[0] || "", h1: h1s[0] || "", htmlLang, imageCount: images.length, imageSources: images.map((image) => image.src).filter(Boolean), failures, error: response.error };
});

const titleOwners = new Map();
const descriptionOwners = new Map();
for (const page of pages) {
  if (page.title) titleOwners.set(page.title, [...(titleOwners.get(page.title) || []), page.url]);
  if (page.description) descriptionOwners.set(page.description, [...(descriptionOwners.get(page.description) || []), page.url]);
}
const duplicateTitles = [...titleOwners].filter(([, urls]) => urls.length > 1).map(([value, urls]) => ({ value, urls }));
const duplicateDescriptions = [...descriptionOwners].filter(([, urls]) => urls.length > 1).map(([value, urls]) => ({ value, urls }));

const localImageUrls = [...new Set(pages.flatMap((page) => page.imageSources).filter((src) => src.startsWith("/")).map((src) => new URL(src, origin).toString()))];
const imageChecks = await mapLimit(localImageUrls, 12, async (url) => {
  const response = await fetchText(url, { headers: { Range: "bytes=0-0" } });
  return { url, status: response.status, contentType: response.headers["content-type"] || "", error: response.error };
});

const report = {
  generatedAt: new Date().toISOString(),
  origin,
  sitemapCount: sitemapUrls.length,
  pageCount: pages.length,
  imageCount: imageChecks.length,
  summary: {
    sitemapFailures: sitemapResponses.filter((item) => item.status !== 200).length,
    pageFailures: pages.filter((item) => item.failures.length).length,
    imageFailures: imageChecks.filter((item) => ![200, 206].includes(item.status) || !item.contentType.startsWith("image/")).length,
    duplicateTitleGroups: duplicateTitles.length,
    duplicateDescriptionGroups: duplicateDescriptions.length
  },
  sitemapResponses: sitemapResponses.map(({ url, status, error }) => ({ url, status, error })),
  pageFailures: pages.filter((item) => item.failures.length),
  imageFailures: imageChecks.filter((item) => ![200, 206].includes(item.status) || !item.contentType.startsWith("image/")),
  duplicateTitles,
  duplicateDescriptions
};

const outputPath = join(root, output);
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ output, ...report.summary, pages: report.pageCount, images: report.imageCount }, null, 2));
if (report.summary.sitemapFailures || report.summary.pageFailures || report.summary.imageFailures || duplicateTitles.length || duplicateDescriptions.length) process.exitCode = 1;
