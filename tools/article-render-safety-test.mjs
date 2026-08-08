import assert from "node:assert/strict";
import test from "node:test";
import { sanitizePublishedArticleHtml } from "../app/lib/news-system.js";

test("published article HTML removes code, executable markup and editor-only blocks", () => {
  const output = sanitizePublishedArticleHtml(`
    <p>Reader-facing introduction.</p>
    <pre>const leaked = true;</pre>
    <script>alert("no")</script>
    <p onclick="alert('no')">Safe paragraph</p>
    <h2>SEO Meta</h2><p>Primary Keyword: hidden phrase</p>
    <h2>Useful selection notes</h2><p><a href="javascript:alert('no')">Safe link label</a></p>
  `);

  assert.match(output, /Reader-facing introduction/);
  assert.match(output, /Safe paragraph/);
  assert.match(output, /Useful selection notes/);
  assert.doesNotMatch(output, /const leaked|script|onclick|SEO Meta|Primary Keyword|javascript:/i);
  assert.match(output, /href="#"/);
});
