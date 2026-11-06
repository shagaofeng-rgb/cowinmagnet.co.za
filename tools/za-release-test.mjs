import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { reportDateBounds, reportBucket } from "../app/lib/admin-date-range.js";
import { withZaInnerLayout } from "../app/lib/za-inner-layout.js";
import { inspectGoogleUrls } from "../app/lib/google-seo-sync.js";

test("Monday and month boundaries follow the South Africa calendar", () => {
  const startOfMonday = new Date("2026-11-01T22:05:00Z");
  assert.equal(reportDateBounds("week", "", "", startOfMonday).from, Date.parse("2026-11-01T22:00:00Z"));
  const firstOfMonth = new Date("2026-10-31T22:05:00Z");
  assert.equal(reportDateBounds("month", "", "", firstOfMonth).from, Date.parse("2026-10-31T22:00:00Z"));
  const longRange = reportDateBounds("custom", "2026-01-01", "2026-11-06");
  assert.equal(reportBucket("custom", longRange), "week");
});

test("the catalogue serves all 87 canonical links across eight indexable pages", async () => {
  const source = await readFile(new URL("../en-za/products/index.html", import.meta.url), "utf8");
  const render = (query) => withZaInnerLayout(source, "/en-za/products/", new URLSearchParams(query));
  const cards = (html) => {
    const grid = html.split('<div class="product-discovery-grid">').at(-1).split('<nav class="content-page-controls"')[0].split("</section>")[0];
    return [...grid.matchAll(/<article\b[^>]*\bdata-product-card\b[^>]*>\s*<a\b[^>]*\bhref=['"]([^'"]+)/gi)].map((match) => match[1]);
  };
  const unique = new Set();
  for (let page = 1; page <= 8; page++) {
    const html = render("productsPage=" + page);
    assert.equal(cards(html).length, page === 8 ? 3 : 12);
    for (const link of cards(html)) {
      assert(!unique.has(link), "each product appears on one page");
      unique.add(link);
    }
    assert(html.includes('rel="canonical" href="https://cowinmagnet.co.za/en-za/products/' + (page > 1 ? "?productsPage=" + page : "") + '"'));
  }
  assert.equal(unique.size, 87);
  const selected = render("q=wet+drum");
  assert.equal(cards(selected).length, 1);
  assert.match(cards(selected)[0], /wet-drum/);
  assert(Buffer.byteLength(render("")) < Buffer.byteLength(source) * 0.55);
});

test("Google URL inspection retries a service error but preserves permanent errors", async () => {
  const recovered = "https://cowinmagnet.co.za/en-za/products/";
  const rejected = "https://cowinmagnet.co.za/en-za/markets/";
  const calls = new Map();
  const { results } = await inspectGoogleUrls([recovered, rejected], {
    accessToken: "fixture-only", retryDelayMs: 0, concurrency: 2,
    fetchImpl: async (_, input) => {
      const url = JSON.parse(input.body).inspectionUrl;
      const count = (calls.get(url) || 0) + 1;
      calls.set(url, count);
      if (url === rejected) return Response.json({ error: { message: "Forbidden" } }, { status: 403 });
      if (count === 1) return Response.json({ error: { message: "Internal error" } }, { status: 500 });
      return Response.json({ inspectionResult: { indexStatusResult: { verdict: "PASS", coverageState: "Submitted and indexed" } } });
    }
  });
  assert.equal(calls.get(recovered), 2);
  assert.equal(results[0].verdict, "PASS");
  assert.equal(calls.get(rejected), 1);
  assert.equal(results[1].retryable, false);
});
