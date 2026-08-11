import assert from "node:assert/strict";
import test from "node:test";
import { evaluateNewsDraft } from "../app/lib/news-automation.js";

const product = { slug: "suspended-permanent-magnetic-separator", truthCardStatus: "verified" };
const sources = [
  { id: "a", url: "https://gov.example.org/notice", publishedAt: "2026-08-01" },
  { id: "b", url: "https://association.example.com/report", publishedAt: "2026-08-02" }
];
const content = Array.from({ length: 920 }, () => "engineering").join(" ");

test("quality gate accepts a sourced, original draft with a verified product truth card", () => {
  const result = evaluateNewsDraft({
    draft: { title: "A verified mining process update", content, sourceIds: ["a", "b"], productSlugs: [product.slug], imageUrls: ["/assets/images/products/example.webp"] },
    sources, products: [product], recentArticles: [], now: new Date("2026-08-08T00:00:00Z")
  });
  assert.equal(result.passed, true);
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
