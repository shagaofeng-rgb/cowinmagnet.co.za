import assert from "node:assert/strict";
import {
  canonicalizeUrl,
  createArticle,
  isDuplicate,
  isOwnedProductImage,
  normalizeTitle,
  scoreProducts,
  slugify
} from "../app/lib/news-system.js";

const candidate = {
  source_title: "African Copper Mine Expands Conveyor Processing Capacity",
  source_author: "Reporter",
  source_publisher: "Example Mining Source",
  source_url: "https://example.com/news/copper-mine?utm_source=newsletter&gclid=test",
  canonical_source_url: canonicalizeUrl("https://example.com/news/copper-mine?utm_source=newsletter&gclid=test"),
  source_language: "en",
  source_published_at: new Date().toISOString(),
  source_fetched_at: new Date().toISOString(),
  source_timezone: "UTC",
  normalized_title: normalizeTitle("African Copper Mine Expands Conveyor Processing Capacity"),
  summary: "The source reports an expansion involving mine conveyors and processing capacity.",
  cover_image_url: "https://example.com/images/copper-mine-conveyor.jpg",
  cover_image_source_url: "https://example.com/images/copper-mine-conveyor.jpg",
  cover_image_page_url: "https://example.com/news/copper-mine",
  cover_image_status: "verified-source-page-image",
  cover_image_hash: "image-hash-1",
  credibility_score: 0.8,
  source_fingerprint: "fingerprint-1",
  content_hash: "content-1",
  event_fingerprint: "event-1"
};

const products = [
  {
    productId: "CW-AF-overband",
    slug: "permanent-overband-magnetic-separator",
    name: "Permanent Overband Magnetic Separator",
    category: "Metal Detection & Recycling Sorting",
    categorySlug: "metal-detection-and-recycling-sorting",
    shortDescription: "Overband magnetic separator for conveyor tramp iron removal and crusher protection in mining.",
    applications: ["Mining", "Conveyor Systems", "Crusher Protection"],
    features: ["Self-cleaning discharge"],
    image: "/assets/images/source-products/permanent-overband-magnetic-separator.jpg"
  }
];

assert.equal(candidate.canonical_source_url, "https://example.com/news/copper-mine");
assert.equal(canonicalizeUrl("file:///etc/passwd"), "");
assert.equal(slugify("Permanent Overband Magnetic Separator: Mining View"), "permanent-overband-magnetic-separator-mining-view");
assert.equal(normalizeTitle("Mine: Conveyor, Capacity!"), "mine conveyor capacity");

const related = scoreProducts(candidate, products);
assert.ok(related.length >= 1, "product relevance should find at least one product");
assert.ok(related[0].relevance_score >= 0.18, "product relevance should pass the configured default threshold");
assert.equal(scoreProducts({ ...candidate, source_title: "Underground truck fleet expansion", summary: "A mine announced new vehicle deliveries." }, products).length, 0, "generic mining news must not be linked to products");

const article = createArticle({ ...candidate, cover_image_url: products[0].image }, related);
assert.equal(article.status, "published");
assert.equal(article.cover_image_url, products[0].image);
assert.equal(isOwnedProductImage(article.cover_image_url), true);
assert.ok(article.slug);
assert.ok(article.source_published_at);
assert.ok(article.related_products.length === 1);
assert.ok(article.content.includes("Original News Facts"));

const noImageArticle = createArticle({ ...candidate, cover_image_url: "" }, related);
assert.equal(noImageArticle.status, "draft");
assert.equal(createArticle(candidate, related).status, "draft", "third-party source images must not trigger auto-publication");

assert.equal(isDuplicate(candidate, [article], 7), true);
assert.equal(isDuplicate({ ...candidate, canonical_source_url: "https://example.com/other/", source_fingerprint: "x", event_fingerprint: "y", normalized_title: "unrelated cement production story" }, [article], 7), false);

console.log("news-smoke-test: ok");
