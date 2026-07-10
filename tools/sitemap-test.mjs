import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { atomicWriteXml, buildSitemapBundle, escapeXml, normalizeSitemapRecord, validateSitemapXml } from "../app/lib/sitemap-system.js";
import { submitSitemapToSearchConsole } from "../app/lib/google-seo-sync.js";
import { withDataLock } from "../app/lib/news-system.js";

const siteUrl = "https://cowinmagnet.co.za";
const record = (path, lastmod = "2026-07-10T00:00:00.000Z", extra = {}) => ({
  loc: `${siteUrl}${path}`,
  canonical: `${siteUrl}${path}`,
  lastmod,
  ...extra
});

test("generates valid grouped sitemap XML", () => {
  const bundle = buildSitemapBundle({ pages: [record("/en-za/")], products: [], categories: [], posts: [] }, { siteUrl });
  assert.equal(bundle.totalUrls, 1);
  assert.ok(validateSitemapXml(bundle.files[0].xml));
});

test("escapes XML special characters", () => {
  assert.equal(escapeXml("A&B <C> \"D\" 'E'"), `A&amp;B &lt;C&gt; &quot;D&quot; &apos;E&apos;`);
});

test("excludes draft, noindex, deleted, and non-self-canonical records", () => {
  const rows = [
    normalizeSitemapRecord(record("/en-za/draft/", undefined, { status: "draft" }), siteUrl),
    normalizeSitemapRecord(record("/en-za/noindex/", undefined, { noindex: true }), siteUrl),
    normalizeSitemapRecord(record("/en-za/deleted/", undefined, { deleted: true }), siteUrl),
    normalizeSitemapRecord(record("/en-za/canonical/", undefined, { canonical: `${siteUrl}/en-za/other/` }), siteUrl)
  ];
  assert.deepEqual(rows, [null, null, null, null]);
});

test("removed content is absent from the next bundle", () => {
  const before = buildSitemapBundle({ pages: [record("/en-za/a/"), record("/en-za/b/")], products: [], categories: [], posts: [] }, { siteUrl });
  const after = buildSitemapBundle({ pages: [record("/en-za/a/")], products: [], categories: [], posts: [] }, { siteUrl });
  assert.ok(before.indexXml.includes("pages-1.xml"));
  assert.equal(after.manifest.some((item) => item.loc.endsWith("/b/")), false);
});

test("preserves supplied lastmod instead of using the current time", () => {
  const value = "2024-05-06T07:08:09.000Z";
  const bundle = buildSitemapBundle({ pages: [record("/en-za/history/", value)], products: [], categories: [], posts: [] }, { siteUrl });
  assert.equal(bundle.manifest[0].lastmod, value);
});

test("splits before the configured URL limit and creates an index", () => {
  const pages = [record("/en-za/a/"), record("/en-za/b/"), record("/en-za/c/")];
  const bundle = buildSitemapBundle({ pages, products: [], categories: [], posts: [] }, { siteUrl, maxUrls: 2 });
  assert.equal(bundle.files.length, 2);
  assert.ok(bundle.indexXml.includes("pages-2.xml"));
  assert.ok(validateSitemapXml(bundle.indexXml, "sitemapindex"));
});

test("concurrent task lock rejects a second run", async () => {
  let release;
  const gate = new Promise((resolveGate) => { release = resolveGate; });
  const name = `sitemap-test-${Date.now()}`;
  const first = withDataLock(name, async () => gate);
  await assert.rejects(() => withDataLock(name, async () => true), /already running/);
  release();
  await first;
});

test("failed atomic commit preserves the previous XML", async () => {
  const directory = await mkdtemp(join(tmpdir(), "cowin-sitemap-test-"));
  const safeDirectory = resolve(directory);
  assert.ok(safeDirectory.startsWith(resolve(tmpdir())));
  const target = join(directory, "sitemap.xml");
  const oldXml = buildSitemapBundle({ pages: [record("/en-za/old/")], products: [], categories: [], posts: [] }, { siteUrl }).files[0].xml;
  const newXml = buildSitemapBundle({ pages: [record("/en-za/new/")], products: [], categories: [], posts: [] }, { siteUrl }).files[0].xml;
  await writeFile(target, oldXml);
  await assert.rejects(() => atomicWriteXml(target, newXml, { beforeCommit: async () => { throw new Error("simulated write failure"); } }), /simulated/);
  assert.equal(await readFile(target, "utf8"), oldXml);
  await rm(safeDirectory, { recursive: true, force: true });
});

test("submits a sitemap with the official Search Console PUT endpoint", async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), method: options.method || "GET" });
    if (String(url) === `${siteUrl}/sitemap.xml`) return new Response("<sitemapindex/>", { status: 200, headers: { "content-type": "application/xml" } });
    return new Response(null, { status: 204 });
  };
  const result = await submitSitemapToSearchConsole({ enabled: true, accessToken: "test-token", siteUrl: "sc-domain:cowinmagnet.co.za", sitemapUrl: `${siteUrl}/sitemap.xml`, fetchImpl });
  assert.equal(result.submitted, true);
  assert.equal(calls[1].method, "PUT");
  assert.match(calls[1].url, /webmasters\/v3\/sites\//);
});

test("authentication failure is classified without changing sitemap output", async () => {
  const fetchImpl = async (url) => String(url) === `${siteUrl}/sitemap.xml`
    ? new Response("<sitemapindex/>", { status: 200 })
    : Response.json({ error: { message: "Permission denied" } }, { status: 403 });
  await assert.rejects(
    () => submitSitemapToSearchConsole({ enabled: true, accessToken: "bad-token", siteUrl: "sc-domain:cowinmagnet.co.za", sitemapUrl: `${siteUrl}/sitemap.xml`, fetchImpl, retries: 0 }),
    (error) => error.category === "permission"
  );
});

test("disabled Search Console submission makes no API calls", async () => {
  let calls = 0;
  const result = await submitSitemapToSearchConsole({ enabled: false, fetchImpl: async () => { calls += 1; } });
  assert.equal(result.reason, "disabled");
  assert.equal(calls, 0);
});
