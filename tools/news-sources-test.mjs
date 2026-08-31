import assert from "node:assert/strict";
import test from "node:test";
import { canonicalizeNewsSourceUrl, newsSourceIdentity, parseGovernmentMiningRss, parseMineralsCouncilReleases, parseSaNewsRss } from "../app/lib/news-sources.js";

test("parses SAnews RSS metadata", () => {
  const rows = parseSaNewsRss(`<rss><channel><item><title>Mining update</title><link>https://www.sanews.gov.za/update</link><pubDate>Mon, 10 Aug 2026 08:00:00 GMT</pubDate></item></channel></rss>`);
  assert.equal(rows[0].publisherType, "government");
  assert.equal(rows[0].url, "https://www.sanews.gov.za/update");
});

test("parses government mining RSS embedded publication date", () => {
  const rows = parseGovernmentMiningRss(`<rss><item><title>Mining sector update</title><link>https://www.gov.za/mining-update</link><description>&lt;time datetime="2026-08-03T13:06:00+02:00"&gt;3 Aug&lt;/time&gt;</description></item></rss>`);
  assert.equal(rows[0].publisher, "Government of South Africa");
  assert.equal(rows[0].publishedAt, "2026-08-03T11:06:00.000Z");
});

test("parses Minerals Council release metadata", () => {
  const rows = parseMineralsCouncilReleases(`<ul><li><time>August 10, 2026</time><a href="/release.pdf">Mining modernisation update</a></li></ul>`);
  assert.equal(rows[0].publisher, "Minerals Council South Africa");
  assert.equal(rows[0].url, "https://www.mineralscouncil.org.za/release.pdf");
});

test("canonicalizes tracking variants and creates one stable source identity", () => {
  const tracked = "https://www.Example.com/news/update/?utm_source=email&Itemid=935#section";
  const clean = "https://example.com/news/update";
  assert.equal(canonicalizeNewsSourceUrl(tracked), clean);
  assert.equal(
    newsSourceIdentity({ title: "Media statement - Mining update", publishedAt: "2026-08-30T08:00:00Z", url: tracked }),
    newsSourceIdentity({ title: "Mining update", publishedAt: "2026-08-30T18:00:00Z", url: clean })
  );
});
