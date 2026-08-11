import assert from "node:assert/strict";
import test from "node:test";
import { isPublishedBlogArticle } from "../app/lib/news-system.js";

test("an authenticated Webhook article with COWIN-owned local media is visible to Blog readers", () => {
  assert.equal(isPublishedBlogArticle({
    article_type: "blog",
    status: "published",
    content: "<p>Published Blog content.</p>",
    cover_image_status: "owned-media",
    cover_image_url: "/assets/images/hero-mining-conveyor-magnet.webp"
  }), true);
});

test("Blog articles without an approved cover image are still not public", () => {
  assert.equal(isPublishedBlogArticle({
    article_type: "blog",
    status: "published",
    content: "<p>Published Blog content.</p>",
    cover_image_status: "owned-media",
    cover_image_url: "https://cowinmagnet.co.za/assets/images/unknown.webp"
  }), false);
});
