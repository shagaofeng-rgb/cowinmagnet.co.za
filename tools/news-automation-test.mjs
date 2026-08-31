import assert from "node:assert/strict";
import test from "node:test";
import { evaluateNewsDraft, normalizeNewsCandidates, rankNewsCandidates } from "../app/lib/news-automation.js";
import { buildNewsArticleDraft } from "../app/lib/news-article-generator.js";

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

test("quality gate distinguishes shared industrial vocabulary from duplicated prose", () => {
  const sharedTerms = "South African mining material process equipment conveyor protection engineering selection ";
  const firstBody = `<h2>First analysis</h2><p>${`${sharedTerms}teams map custody records before reviewing individual risk points. `.repeat(50)}</p>`;
  const secondBody = `<h2>Second analysis</h2><p>${`${sharedTerms}operators measure burden depth and document maintenance access for each installation. `.repeat(50)}</p>`;
  const base = {
    sources: [
      { id: "s1", url: "https://source-one.example/update", publishedAt: "2026-08-12T08:00:00.000Z" },
      { id: "s2", url: "https://source-two.example/update", publishedAt: "2026-08-12T09:00:00.000Z" }
    ],
    products: [{ slug: "p1", truthCardStatus: "verified" }],
    config: { minIndependentSources: 2, fallbackCandidateMaxAgeDays: 7 },
    now: new Date("2026-08-13T02:35:00.000Z")
  };
  const draft = { title: "A Distinct Operational Review", content: secondBody, sourceIds: ["s1", "s2"], productSlugs: ["p1"], imageUrls: ["/assets/images/product.jpg"] };
  const distinct = evaluateNewsDraft({ ...base, draft, recentArticles: [{ title: "Previous Mining Review", content: firstBody }] });
  assert.equal(distinct.passed, true, distinct.failures.join(" "));
  const duplicate = evaluateNewsDraft({ ...base, draft: { ...draft, content: firstBody }, recentArticles: [{ title: "Previous Mining Review", content: firstBody }] });
  assert.equal(duplicate.passed, false);
  assert.match(duplicate.failures.join(" "), /Similarity threshold/);
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

test("candidate normalization collapses source URL variants by publisher, title and day", () => {
  const candidates = normalizeNewsCandidates([
    { id: "first", site_id: "cowinmagnet-za", status: "candidate", title: "Media statement - Mining update", publishedAt: "2026-08-30T08:00:00Z", url: "https://www.example.com/release?Itemid=935&utm_source=email" },
    { id: "second", site_id: "cowinmagnet-za", status: "candidate", title: "Mining update", publishedAt: "2026-08-30T15:00:00Z", url: "https://example.com/release" }
  ]);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].url, "https://example.com/release");
});

test("candidate ranking prioritises fresh sources before older high-score fallbacks", () => {
  const now = new Date("2026-08-31T12:00:00Z");
  const ranked = rankNewsCandidates({
    candidates: [
      { id: "old", site_id: "cowinmagnet-za", status: "candidate", title: "Older mining investment", publishedAt: "2026-08-01T12:00:00Z", url: "https://old.example/report", score: 100 },
      { id: "fresh", site_id: "cowinmagnet-za", status: "candidate", title: "Fresh infrastructure update", publishedAt: "2026-08-30T12:00:00Z", url: "https://fresh.example/update", score: 60 }
    ],
    articles: [],
    config: { siteId: "cowinmagnet-za", candidateMaxAgeHours: 168, fallbackCandidateMaxAgeDays: 45 },
    now
  });
  assert.deepEqual(ranked.map((candidate) => candidate.id), ["fresh", "old"]);
});

test("source-specific generator creates a publishable 900 to 1,500 word draft", () => {
  const currentSources = [
    { id: "s1", url: "https://gov.example/infrastructure", publisher: "Government Publisher", title: "New infrastructure investment programme", publishedAt: "2026-08-30T08:00:00Z" },
    { id: "s2", url: "https://industry.example/project", publisher: "Industry Council", title: "Mining capital project outlook", publishedAt: "2026-08-29T08:00:00Z" }
  ];
  const currentProduct = { slug: "p1", name: "Permanent Overband Magnetic Separator", truthCardStatus: "verified", image: "/assets/images/product.jpg" };
  const generated = buildNewsArticleDraft({ sources: currentSources, product: currentProduct, now: new Date("2026-08-31T12:00:00Z"), variant: 0 });
  const result = evaluateNewsDraft({
    draft: { ...generated, sourceIds: ["s1", "s2"], productSlugs: ["p1"], imageUrls: [currentProduct.image] },
    sources: currentSources,
    products: [currentProduct],
    recentArticles: [{ title: "Previous conveyor protection article", content: `<p>${"Older generic conveyor protection guidance for plant teams. ".repeat(180)}</p>` }],
    config: { minIndependentSources: 2, fallbackCandidateMaxAgeDays: 45 },
    now: new Date("2026-08-31T12:00:00Z")
  });
  assert.equal(result.passed, true, result.failures.join(" "));
  assert.ok(result.metrics.wordCount >= 900 && result.metrics.wordCount <= 1500);
});
