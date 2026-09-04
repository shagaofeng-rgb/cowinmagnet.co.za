import assert from "node:assert/strict";
import test from "node:test";
import { canonicalizeNewsSourceUrl, discoverNewsSources, newsSourceIdentity, parseEskomRss, parseGovernmentMiningRss, parseMineralsCouncilReleases, parseSaNewsRss, parseStatsSaRss } from "../app/lib/news-sources.js";

test("parses SAnews RSS metadata", () => {
  const rows = parseSaNewsRss(`<rss><channel><item><title>Mining update</title><link>https://www.sanews.gov.za/update</link><pubDate>Mon, 10 Aug 2026 08:00:00 GMT</pubDate></item></channel></rss>`);
  assert.equal(rows[0].publisherType, "government");
  assert.equal(rows[0].url, "https://www.sanews.gov.za/update");
});

test("parses government mining RSS embedded publication date", () => {
  const rows = parseGovernmentMiningRss(`<rss><item><title>Mining sector update</title><link>https://www.gov.za/mining-update</link><description>&lt;time datetime="2026-08-03T13:06:00+02:00"&gt;3 Aug&lt;/time&gt;</description></item></rss>`);
  assert.equal(rows[0].publisher, "Government of South Africa");
  assert.equal(rows[0].publishedAt, "2026-08-03T11:06:00.000Z");
  assert.match(rows[0].topicContext, /mining minerals/);
});

test("parses Minerals Council release metadata", () => {
  const rows = parseMineralsCouncilReleases(`<ul><li><time>August 10, 2026</time><a href="/release.pdf">Mining modernisation update</a></li></ul>`);
  assert.equal(rows[0].publisher, "Minerals Council South Africa");
  assert.equal(rows[0].url, "https://www.mineralscouncil.org.za/release.pdf");
});

test("parses current official statistics and utility RSS metadata", () => {
  const stats = parseStatsSaRss(`<rss><item><title>Economic wrap-up for August 2026</title><link>https://www.statssa.gov.za/?p=19874</link><pubDate>Wed, 02 Sep 2026 08:00:00 GMT</pubDate><description>Mining production and mineral sales update</description></item></rss>`);
  const utility = parseEskomRss(`<rss><item><title>Eskom reports stronger operational recovery</title><link>https://www.eskom.co.za/operational-recovery/</link><pubDate>Mon, 31 Aug 2026 08:00:00 GMT</pubDate><description>Energy security and industrial electricity supply</description></item></rss>`);
  assert.equal(stats[0].publisher, "Statistics South Africa");
  assert.match(stats[0].topicContext, /mining minerals/);
  assert.equal(utility[0].publisherType, "state-owned-utility");
});

test("decodes numeric HTML entities in source headlines", () => {
  const rows = parseEskomRss(`<rss><item><title>Eskom&#8217;s coal fleet update</title><link>https://www.eskom.co.za/coal-fleet/</link><pubDate>Mon, 31 Aug 2026 08:00:00 GMT</pubDate><description>Energy security</description></item></rss>`);
  assert.equal(rows[0].title, "Eskom’s coal fleet update");
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

test("keeps chrome and tailings updates from the official mining taxonomy feed", async () => {
  let governmentAttempts = 0;
  const fetchImpl = async (url) => {
    if (url.includes("taxonomy/term/659")) {
      governmentAttempts += 1;
      if (governmentAttempts === 1) throw new Error("temporary upstream failure");
      return {
        ok: true,
        text: async () => `<rss><item><title>Minister conducts onsite inspection at a Chrome operation</title><link>https://www.gov.za/chrome-inspection</link><description>&lt;time datetime="2026-08-18T10:00:00+02:00"&gt;18 Aug&lt;/time&gt; Tailings facility update</description></item></rss>`
      };
    }
    if (url.includes("sanews.gov.za")) {
      return {
        ok: true,
        text: async () => `<rss><channel><item><title>Mining infrastructure update</title><link>https://www.sanews.gov.za/mining-infrastructure</link><pubDate>Sun, 30 Aug 2026 08:00:00 GMT</pubDate></item></channel></rss>`
      };
    }
    if (url.includes("statssa.gov.za")) return { ok: true, text: async () => "<rss></rss>" };
    if (url.includes("eskom.co.za")) return { ok: true, text: async () => "<rss></rss>" };
    return { ok: true, text: async () => "<html></html>" };
  };
  const result = await discoverNewsSources({ fetchImpl, now: new Date("2026-09-04T12:00:00Z"), maxAgeDays: 45, includeDiagnostics: true });
  assert.equal(governmentAttempts, 2);
  assert.equal(result.items.some((item) => item.url === "https://gov.za/chrome-inspection"), true);
  assert.equal(new Set(result.items.map((item) => new URL(item.url).hostname)).size, 2);
  assert.equal(result.diagnostics.find((item) => item.id === "government-mining-rss")?.status, "fulfilled");
});
