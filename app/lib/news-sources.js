const USER_AGENT = "Cowinmagnet-NewsResearch/1.0 (+https://cowinmagnet.co.za/en-za/news/)";

function decode(value) {
  return String(value || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();
}

function tag(block, name) {
  return decode(block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, "i"))?.[1]);
}

function isoDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "" : date.toISOString();
}

async function fetchText(url, fetchImpl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetchImpl(url, { headers: { "user-agent": USER_AGENT, accept: "application/rss+xml,text/html" }, signal: controller.signal });
    if (!response.ok) throw new Error(`${response.status} ${url}`);
    return response.text();
  } finally {
    clearTimeout(timer);
  }
}

export function parseSaNewsRss(xml) {
  return [...String(xml).matchAll(/<item>([\s\S]*?)<\/item>/gi)].map((match) => ({
    title: tag(match[1], "title"),
    url: tag(match[1], "link"),
    publishedAt: isoDate(tag(match[1], "pubDate")),
    publisher: "South African Government News Agency",
    publisherType: "government",
    trustTier: "primary"
  })).filter((item) => item.title && item.url && item.publishedAt);
}

export function parseGovernmentMiningRss(xml) {
  return [...String(xml).matchAll(/<item>([\s\S]*?)<\/item>/gi)].map((match) => {
    const description = tag(match[1], "description");
    const embeddedDate = description.match(/datetime="([^"]+)"/i)?.[1] || description.match(/(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),\s*(\d{1,2}\/\d{1,2}\/\d{4})/i)?.[1];
    return {
      title: tag(match[1], "title"), url: tag(match[1], "link"), publishedAt: isoDate(embeddedDate),
      publisher: "Government of South Africa", publisherType: "government", trustTier: "primary"
    };
  }).filter((item) => item.title && item.url && item.publishedAt);
}

export function parseMineralsCouncilReleases(html) {
  return [...String(html).matchAll(/<li[^>]*>[\s\S]*?<time[^>]*>([^<]+)<\/time>[\s\S]*?<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/li>/gi)].map((match) => ({
    title: decode(match[3].replace(/<[^>]+>/g, " ")),
    url: new URL(decode(match[2]), "https://www.mineralscouncil.org.za").toString(),
    publishedAt: isoDate(decode(match[1])),
    publisher: "Minerals Council South Africa",
    publisherType: "industry-association",
    trustTier: "primary"
  })).filter((item) => item.title && item.publishedAt);
}

export function parseMineralsCouncilEconomicReports(html) {
  const body = String(html);
  const entries = [];
  const linkPattern = /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of body.matchAll(linkPattern)) {
    const title = decode(match[2].replace(/<[^>]+>/g, " "));
    const href = decode(match[1]);
    if (!title || !/mining|mineral|commodity|input cost|electricity|employment/i.test(title)) continue;
    const start = Math.max(0, match.index - 700);
    const end = Math.min(body.length, match.index + match[0].length + 700);
    const context = decode(body.slice(start, end).replace(/<[^>]+>/g, " "));
    const date = context.match(/(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(20\d{2})/i);
    if (!date) continue;
    const publishedAt = new Date(`${date[3]}-${String(new Date(`${date[2]} 1, ${date[3]}`).getMonth() + 1).padStart(2, "0")}-${String(date[1]).padStart(2, "0")}T12:00:00.000Z`);
    if (Number.isNaN(publishedAt.valueOf())) continue;
    entries.push({
      title,
      url: new URL(href, "https://www.mineralscouncil.org.za").toString(),
      publishedAt: publishedAt.toISOString(),
      publisher: "Minerals Council South Africa",
      publisherType: "industry-association",
      trustTier: "primary"
    });
  }
  return entries;
}

function parseMiningWeeklyPublicPage(html) {
  const entries = [];
  const expression = /<a[^>]+href="([^"]*(?:article|project)[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of String(html).matchAll(expression)) {
    const url = new URL(decode(match[1]), "https://www.miningweekly.com").toString();
    const title = decode(match[2].replace(/<[^>]+>/g, " "));
    const dateMatch = url.match(/-(20\d{2})-(\d{2})-(\d{2})(?:$|[?#])/);
    if (!title || !dateMatch) continue;
    entries.push({
      title,
      url,
      publishedAt: new Date(`${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}T12:00:00.000Z`).toISOString(),
      publisher: "Mining Weekly",
      publisherType: "trade-media",
      trustTier: "secondary"
    });
  }
  return entries;
}

function relevance(item) {
  const text = item.title.toLowerCase();
  return ["mining", "mineral", "coal", "energy", "industrial", "recycling", "infrastructure", "modernisation"]
    .reduce((score, word) => score + (text.includes(word) ? 1 : 0), 0);
}

export async function discoverNewsSources({ fetchImpl = fetch, now = new Date(), maxAgeDays = 90 } = {}) {
  const requests = await Promise.allSettled([
    fetchText("https://www.sanews.gov.za/rss.xml", fetchImpl).then(parseSaNewsRss),
    fetchText("https://www.gov.za/taxonomy/term/659/%2A/feed", fetchImpl).then(parseGovernmentMiningRss),
    fetchText("https://www.mineralscouncil.org.za/industry-news/media-releases/2026", fetchImpl).then(parseMineralsCouncilReleases),
    fetchText("https://www.mineralscouncil.org.za/work/economics/monthly-economic-reports/2026", fetchImpl).then(parseMineralsCouncilEconomicReports),
    fetchText("https://www.miningweekly.com/", fetchImpl).then(parseMiningWeeklyPublicPage)
  ]);
  const cutoff = now.valueOf() - maxAgeDays * 86400000;
  const items = requests.flatMap((result) => result.status === "fulfilled" ? result.value : [])
    .filter((item) => new Date(item.publishedAt).valueOf() >= cutoff && new Date(item.publishedAt) <= now)
    .map((item) => ({ ...item, score: relevance(item), fetchedAt: now.toISOString(), rightsNote: "Headline and publication metadata used for original engineering analysis only." }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || new Date(b.publishedAt) - new Date(a.publishedAt));
  return [...new Map(items.map((item) => [item.url, item])).values()];
}
