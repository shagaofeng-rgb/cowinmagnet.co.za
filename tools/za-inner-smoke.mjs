import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";

const base = new URL(process.env.SITE_URL || "http://127.0.0.1:4091").origin;
const site = "https://cowinmagnet.co.za";
const option = (name) => process.argv.find((arg) => arg.startsWith(name + "="))?.slice(name.length + 1);
const sha = (s) => createHash("sha256").update(s).digest("hex");
const get = (path) => fetch(new URL(path, base), { redirect: "manual", signal: AbortSignal.timeout(25_000) });
const locs = (xml) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname);
const index = await get("/sitemap.xml");
if (!index.ok) throw Error("Cannot read sitemap.xml: " + index.status);
const indexes = locs(await index.text());
const urls = await Promise.all(indexes.map(async (path) => {
  const r = await get(path);
  if (!r.ok) throw Error("Cannot read " + path + ": " + r.status);
  return locs(await r.text());
}));
const indexed = new Set(urls.flat());
const approved = option("--approved-list");
const sources = approved
  ? [...(await readFile(approved, "utf8")).matchAll(/"(\/en-za\/[^"\n]+)"/g)].map((m) => m[1])
  : (await readdir("en-za", { recursive: true })).filter((f) => f.endsWith("/index.html")).map((f) => "/en-za/" + f.slice(0, -"index.html".length));
const paths = [...new Set([...indexed, ...sources])].filter((p) => p !== "/en-za/").sort();
const results = [], errors = [];
let cursor = 0;
await Promise.all(Array.from({ length: 7 }, async () => {
  while (cursor < paths.length) {
    const path = paths[cursor++];
    try {
      const r = await get(path), html = await r.text();
      const layout = html.match(/<body\b[^>]*data-za-inner="([^"]+)"/i)?.[1];
      const canonical = html.match(/<link\b[^>]*rel=['"]canonical['"][^>]*href=['"]([^'"]+)/i)?.[1];
      const dbOnly = option("--local-db-only");
      if (path === dbOnly && r.status === 404 && !indexed.has(path) && new URL(base).hostname === "127.0.0.1") {
        results.push({ path, status: r.status, verified: "Requires production article storage" });
        continue;
      }
      if (r.status !== (path === "/en-za/404/" ? 404 : 200)) errors.push({ path, issue: "HTTP " + r.status });
      if (!layout || !html.includes('/assets/za-inner-v1.css')) errors.push({ path, issue: "missing layout" });
      if ((html.match(/<h1\b/gi) || []).length !== 1) errors.push({ path, issue: "expected one H1" });
      if (indexed.has(path)) {
        if (canonical !== site + path) errors.push({ path, issue: "canonical mismatch", canonical });
        if (/noindex/i.test(r.headers.get("x-robots-tag") || "") || /<meta[^>]+name=['"]robots['"][^>]+content=['"][^'"]*noindex/i.test(html)) errors.push({ path, issue: "unexpected noindex" });
      }
      if (layout === "product" && ((html.match(/role="tab"/g) || []).length !== 7 || (html.match(/role="tabpanel"/g) || []).length !== 7 || !html.includes("data-product-enquiry-form") || !html.includes("data-gallery-main"))) errors.push({ path, issue: "product sections, form, or image missing" });
      results.push({ path, status: r.status, layout, canonical });
    } catch (error) { errors.push({ path, issue: error.message }); }
  }
}));
const shared = {};
for (const path of ["/en-za/", "/assets/site.css?v=20260919-info-mailbox", "/assets/site.js?v=20260919-info-mailbox", "/assets/za-inner-v1.css", "/assets/za-inner-v1.js", "/assets/za-inner-icons-v1.svg", "/en-za/news/feed.xml", "/en-za/blog/feed.xml", "/robots.txt"]) {
  const response = await get(path);
  const body = Buffer.from(await response.arrayBuffer());
  shared[path] = { status: response.status, hash: sha(body) };
  if (response.status !== 200 || !body.length) errors.push({ path, issue: "resource unavailable" });
  if (path === "/en-za/" && body.includes("data-za-inner")) errors.push({ path, issue: "homepage received inner layout" });
}
const baseline = option("--home-sha");
if (baseline && shared["/en-za/"].hash !== baseline) errors.push({ path: "/en-za/", issue: "homepage HTML changed" });
const root = await get("/");
if (root.status !== 308 || new URL(root.headers.get("location") || "/", base).pathname !== "/en-za/") errors.push({ path: "/", issue: "homepage redirect changed" });
const missing = await get("/en-za/nonexistent-za-layout-check/");
if (missing.status !== 404 || !(await missing.text()).includes('data-za-inner="utility"')) errors.push({ path: "/en-za/nonexistent-za-layout-check/", issue: "missing page must remain a styled 404" });
const report = {
  origin: base, sitemapUrls: indexed.size, total: paths.length,
  counts: results.reduce((counts, row) => { const k = row.layout || "production-storage"; counts[k] = (counts[k] || 0) + 1; return counts; }, {}),
  errors, shared, routes: results.sort((a, b) => a.path.localeCompare(b.path))
};
console.log(JSON.stringify({ ...report, routes: undefined }, null, 2));
if (option("--report")) await writeFile(option("--report"), JSON.stringify(report, null, 2) + "\n");
if (errors.length) process.exitCode = 1;
