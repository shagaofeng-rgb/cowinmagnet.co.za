const USER_AGENT = "Cowinmagnet-NewsResearch/1.0 (+https://cowinmagnet.co.za/en-za/news/)";
const TRACKING_QUERY_KEYS = new Set(["fbclid", "gclid", "mc_cid", "mc_eid", "itemid", "m"]);

export function canonicalizeNewsSourceUrl(value) {
  try {
    const url = new URL(String(value || "").trim());
    url.hash = "";
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    for (const key of [...url.searchParams.keys()]) {
      if (key.toLowerCase().startsWith("utm_") || TRACKING_QUERY_KEYS.has(key.toLowerCase())) url.searchParams.delete(key);
    }
    url.searchParams.sort();
    url.pathname = url.pathname.replace(/\/{2,}/g, "/").replace(/\/$/, "") || "/";
    return url.toString();
  } catch {
    return "";
  }
}

function normalizedTitle(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/^media statement\s*[-–:]\s*/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function newsSourceIdentity(source = {}) {
  const canonicalUrl = canonicalizeNewsSourceUrl(source.url);
  let hostname = "";
  try { hostname = new URL(canonicalUrl).hostname; } catch {}
  const date = new Date(source.publishedAt);
  const day = Number.isNaN(date.valueOf()) ? "" : date.toISOString().slice(0, 10);
  const title = normalizedTitle(source.title);
  return title && day ? `${hostname}|${title}|${day}` : canonicalUrl;
}

function decode(value) {
  return String(value || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();
}

function tag(block, name) {
  return decode(block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, "i"))?.[1]);
}

function isoDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "" : date.toISOString();
}

async function fetchText(url, fetchImpl, attempts = 2) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetchImpl(url, { headers: { "user-agent": USER_AGENT, accept: "application/rss+xml,text/html" }, signal: controller.signal });
      if (!response.ok) throw new Error(`${response.status} ${url}`);
      return await response.text();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, attempt * 250));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
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

function rssDescription(block) {
  return decode(tag(block, "description").replace(/<[^>]+>/g, " "));
}

export function parseStatsSaRss(xml) {
  return [...String(xml).matchAll(/<item>([\s\S]*?)<\/item>/gi)].map((match) => ({
    title: tag(match[1], "title"),
    url: tag(match[1], "link"),
    publishedAt: isoDate(tag(match[1], "pubDate")),
    description: rssDescription(match[1])
  })).filter((item) => item.title && item.url && item.publishedAt && /mining|mineral|manufacturing|industrial|electricity|economic wrap-up/i.test(`${item.title} ${item.description}`))
    .map(({ description, ...item }) => ({
      ...item,
      publisher: "Statistics South Africa",
      publisherType: "government-statistics",
      trustTier: "primary",
      topicContext: /mining|mineral/i.test(`${item.title} ${description}`) ? "South African mining minerals statistics" : "South African industrial energy statistics"
    }));
}

export function parseEskomRss(xml) {
  return [...String(xml).matchAll(/<item>([\s\S]*?)<\/item>/gi)].map((match) => ({
    title: tag(match[1], "title"),
    url: tag(match[1], "link"),
    publishedAt: isoDate(tag(match[1], "pubDate")),
    description: rssDescription(match[1])
  })).filter((item) => item.title && item.url && item.publishedAt && /energy|electricity|coal|generation|grid|industrial|smelter|mining/i.test(`${item.title} ${item.description}`))
    .map(({ description, ...item }) => ({
      ...item,
      publisher: "Eskom",
      publisherType: "state-owned-utility",
      trustTier: "primary",
      topicContext: "South African energy electricity power supply industrial operations"
    }));
}

export function parseGovernmentMiningRss(xml) {
  return [...String(xml).matchAll(/<item>([\s\S]*?)<\/item>/gi)].map((match) => {
    const description = tag(match[1], "description");
    const embeddedDate = description.match(/datetime="([^"]+)"/i)?.[1] || description.match(/(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),\s*(\d{1,2}\/\d{1,2}\/\d{4})/i)?.[1];
    return {
      title: tag(match[1], "title"), url: tag(match[1], "link"), publishedAt: isoDate(embeddedDate),
      publisher: "Government of South Africa", publisherType: "government", trustTier: "primary",
      topicContext: "South African mining minerals energy"
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
    trustTier: "primary",
    topicContext: "South African mining minerals industry"
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
      trustTier: "primary",
      topicContext: "South African mining minerals economics"
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
      trustTier: "secondary",
      topicContext: "African mining minerals industry"
    });
  }
  return entries;
}

function relevance(item) {
  const text = `${item.title || ""} ${item.topicContext || ""}`.toLowerCase();
  return [
    /\bmin(?:e|es|ing)\b/, /\bminerals?\b/, /\b(?:iron\s+)?ore\b/, /\bcoal\b/,
    /\bchrome\b/, /\bferrochrome\b/, /\bmanganese\b/, /\bplatinum\b/, /\bgold\b/,
    /\btailings?\b/, /\bsmelters?\b/, /\bquarr(?:y|ies)\b/, /\bbeneficiation\b/,
    /\b(?:material|bulk) handling\b/, /\bconveyors?\b/, /\bcrushers?\b/,
    /\benergy\b/, /\bindustr(?:y|ial)\b/, /\brecycl(?:e|ing)\b/,
    /\binfrastructure\b/, /\bmodernisation\b/
  ].reduce((score, pattern) => score + (pattern.test(text) ? 1 : 0), 0);
}

export async function discoverNewsSources({ fetchImpl = fetch, now = new Date(), maxAgeDays = 90, includeDiagnostics = false } = {}) {
  const definitions = [
    { id: "sanews-rss", url: "https://www.sanews.gov.za/rss.xml", parse: parseSaNewsRss },
    { id: "government-mining-rss", url: "https://www.gov.za/taxonomy/term/659/%2A/feed", parse: parseGovernmentMiningRss },
    { id: "statistics-sa-rss", url: "https://www.statssa.gov.za/?feed=rss2", parse: parseStatsSaRss },
    { id: "eskom-rss", url: "https://www.eskom.co.za/feed/", parse: parseEskomRss },
    { id: "minerals-council-releases", url: "https://www.mineralscouncil.org.za/industry-news/media-releases/2026", parse: parseMineralsCouncilReleases },
    { id: "minerals-council-economics", url: "https://www.mineralscouncil.org.za/work/economics/monthly-economic-reports/2026", parse: parseMineralsCouncilEconomicReports },
    { id: "mining-weekly", url: "https://www.miningweekly.com/", parse: parseMiningWeeklyPublicPage }
  ];
  const requests = await Promise.all(definitions.map(async (definition) => {
    try {
      const rows = definition.parse(await fetchText(definition.url, fetchImpl));
      return { ...definition, status: "fulfilled", rows };
    } catch (error) {
      const causeCode = error instanceof Error && error.cause && typeof error.cause === "object" && "code" in error.cause ? String(error.cause.code) : "";
      const message = error instanceof Error ? error.message : String(error);
      return { ...definition, status: "rejected", rows: [], error: causeCode ? `${message} (${causeCode})` : message };
    }
  }));
  const cutoff = now.valueOf() - maxAgeDays * 86400000;
  const items = requests.flatMap((result) => result.rows)
    .filter((item) => new Date(item.publishedAt).valueOf() >= cutoff && new Date(item.publishedAt) <= now)
    .map((item) => ({
      ...item,
      url: canonicalizeNewsSourceUrl(item.url),
      score: relevance(item),
      fetchedAt: now.toISOString(),
      rightsNote: "Headline and publication metadata used for original engineering analysis only."
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || new Date(b.publishedAt) - new Date(a.publishedAt));
  const deduplicated = new Map();
  for (const item of items) {
    const key = newsSourceIdentity(item);
    const existing = deduplicated.get(key);
    if (!existing || Number(item.score || 0) > Number(existing.score || 0)) deduplicated.set(key, item);
  }
  const discovered = [...deduplicated.values()];
  if (!includeDiagnostics) return discovered;
  return {
    items: discovered,
    diagnostics: requests.map(({ id, url, status, rows, error }) => ({
      id,
      url,
      status,
      itemCount: rows.length,
      ...(error ? { error } : {})
    }))
  };
}
