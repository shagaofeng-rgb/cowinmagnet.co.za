import assert from "node:assert/strict";
import test from "node:test";
import { evaluateNewsDraft } from "../app/lib/news-automation.js";

const product = { slug: "suspended-permanent-magnetic-separator", truthCardStatus: "verified" };
const sources = [
  { id: "a", url: "https://gov.example.org/notice", publishedAt: "2026-08-07" },
  { id: "b", url: "https://association.example.com/report", publishedAt: "2026-08-07" }
];
const content = Array.from({ length: 920 }, () => "engineering").join(" ");

test("quality gate accepts a sourced, original draft with a verified product truth card", () => {
  const result = evaluateNewsDraft({
    draft: { title: "A verified mining process update", content, sourceIds: ["a", "b"], productSlugs: [product.slug], imageUrls: ["/assets/images/products/example.webp"] },
    sources, products: [product], recentArticles: [], now: new Date("2026-08-08T00:00:00Z")
  });
  assert.equal(result.passed, true);
});

test("quality gate accepts independent sources from the configured seven-day fallback window", () => {
  const now = new Date("2026-08-13T02:35:00.000Z");
  const content = `<h2>Operational context</h2><p>${"Verified engineering context for South African bulk material operations. ".repeat(150)}</p>`;
  const result = evaluateNewsDraft({
    draft: { title: "Current Mining Signals and Conveyor Protection Decisions", content, sourceIds: ["s1", "s2"], productSlugs: ["p1"], imageUrls: ["/assets/images/product.jpg"] },
    sources: [
      { id: "s1", url: "https://source-one.example/update", publishedAt: "2026-08-08T08:00:00.000Z" },
      { id: "s2", url: "https://source-two.example/update", publishedAt: "2026-08-09T08:00:00.000Z" }
    ],
    products: [{ slug: "p1", truthCardStatus: "verified" }],
    config: { minIndependentSources: 2, candidateMaxAgeHours: 72, fallbackCandidateMaxAgeDays: 7 },
    now
  });
  assert.equal(result.passed, true, result.failures.join(" "));
});

test("quality gate accepts a product truth card synchronized from the verified main site", () => {
  const result = evaluateNewsDraft({
    draft: { title: "A current process engineering update", content, sourceIds: ["a", "b"], productSlugs: ["main-site-product"], imageUrls: ["/assets/images/source-products/example.webp"] },
    sources, products: [{ slug: "main-site-product", truthCardStatus: "synced-from-main-site", sourceSite: "www.cowinmagnet.com" }], recentArticles: [], now: new Date("2026-08-08T00:00:00Z")
  });
  assert.equal(result.passed, true);
});

test("quality gate blocks a draft without independent sources", () => {
  const result = evaluateNewsDraft({
    draft: { title: "Unverified update", content, sourceIds: ["a"], productSlugs: [product.slug] },
    sources, products: [product], recentArticles: [], now: new Date("2026-08-08T00:00:00Z")
  });
  assert.equal(result.passed, false);
  assert.match(result.failures.join("\n"), /independent/);
});
