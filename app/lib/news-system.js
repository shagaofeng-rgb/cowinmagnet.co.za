import crypto from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join, normalize, sep } from "node:path";

const root = process.cwd();
const dataRoot = join(root, "data");

const DEFAULT_SOURCES = [
  {
    id: "mining-com",
    domain: "mining.com",
    publisher_name: "MINING.com",
    source_type: "rss",
    rss_url: "https://www.mining.com/feed/",
    language: "en",
    country: "Global",
    credibility_score: 0.84,
    enabled: true,
    allowed_for_auto_publish: true
  },
  {
    id: "recycling-today",
    domain: "recyclingtoday.com",
    publisher_name: "Recycling Today",
    source_type: "rss",
    rss_url: "https://www.recyclingtoday.com/rss/",
    language: "en",
    country: "Global",
    credibility_score: 0.78,
    enabled: true,
    allowed_for_auto_publish: true
  },
  {
    id: "cement-products",
    domain: "cementproducts.com",
    publisher_name: "Cement Products",
    source_type: "rss",
    rss_url: "https://cementproducts.com/feed/",
    language: "en",
    country: "Global",
    credibility_score: 0.72,
    enabled: true,
    allowed_for_auto_publish: true
  }
];

const DEFAULT_SETTINGS = {
  dailyTarget: Number(process.env.NEWS_DAILY_TARGET || 4),
  timezone: process.env.NEWS_TIMEZONE || process.env.TIMEZONE || "Africa/Johannesburg",
  lookbackHours: Number(process.env.NEWS_LOOKBACK_HOURS || 72),
  dedupDays: Number(process.env.NEWS_DEDUP_DAYS || 7),
  relevanceThreshold: Number(process.env.NEWS_RELEVANCE_THRESHOLD || 0.18),
  autoPublish: String(process.env.NEWS_AUTO_PUBLISH || "true").toLowerCase() !== "false",
  maxRetries: Number(process.env.NEWS_MAX_RETRIES || 3)
};

const PRODUCT_KEYWORDS = [
  "magnet",
  "magnetic",
  "separator",
  "separation",
  "mining",
  "mine",
  "ore",
  "iron",
  "copper",
  "gold",
  "coal",
  "quarry",
  "aggregate",
  "cement",
  "crusher",
  "conveyor",
  "recycling",
  "metal",
  "ferrous",
  "tramp",
  "waste",
  "material handling",
  "processing"
];

function safeDataPath(relativePath) {
  const clean = normalize(relativePath.replace(/^data[\\/]/, ""));
  if (clean.startsWith("..") || clean.includes(`..${sep}`)) throw new Error("Invalid data path");
  return join(dataRoot, clean);
}

export async function readDataJson(relativePath, fallback) {
  try {
    const raw = await readFile(safeDataPath(relativePath), "utf8");
    if (!raw.trim()) return fallback;
    return JSON.parse(raw.replace(/^\uFEFF/, ""));
  } catch {
    return fallback;
  }
}

export async function writeDataJson(relativePath, value) {
  const filePath = safeDataPath(relativePath);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function hashText(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

export function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 88);
}

export function normalizeTitle(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&amp;/g, "and")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function canonicalizeUrl(value) {
  try {
    const url = new URL(value);
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|fbclid$|gclid$|mc_|yclid$|igshid$|ref$|ref_src$)/i.test(key)) url.searchParams.delete(key);
    }
    url.pathname = url.pathname.replace(/\/+$/, "/");
    return url.toString();
  } catch {
    return "";
  }
}

function xmlDecode(value = "") {
  return String(value)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tag(block, name) {
  const match = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "i"));
  return xmlDecode(match?.[1] || "");
}

function attrTag(block, tagName, attrName) {
  const match = block.match(new RegExp(`<${tagName}[^>]*${attrName}=["']([^"']+)["'][^>]*>`, "i"));
  return xmlDecode(match?.[1] || "");
}

function absoluteUrl(value, baseUrl) {
  try {
    if (!value) return "";
    return new URL(value, baseUrl || undefined).toString();
  } catch {
    return "";
  }
}

export function isExternalNewsImage(value) {
  if (String(value || "").startsWith("/assets/images/news/")) return true;
  const url = absoluteUrl(value);
  if (!url) return false;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");
    if (host === "cowinmagnet.co.za" || host === "cowinmagnet.com") return false;
    return /^https?:$/.test(parsed.protocol) && /\.(avif|webp|png|jpe?g)(?:$|[?#])/i.test(parsed.pathname + parsed.search);
  } catch {
    return false;
  }
}

function imageFromFeedBlock(block) {
  return (
    attrTag(block, "media:content", "url") ||
    attrTag(block, "media:thumbnail", "url") ||
    attrTag(block, "enclosure", "url") ||
    attrTag(block, "image", "href")
  );
}

function extractImageFromSourceHtml(html, baseUrl) {
  const patterns = [
    /<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url)?["']/i,
    /<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image(?::src)?["']/i,
    /"image"\s*:\s*"(https?:\/\/[^"]+\.(?:avif|webp|png|jpe?g)(?:\?[^"]*)?)"/i,
    /<img[^>]+src=["']([^"']+\.(?:avif|webp|png|jpe?g)(?:\?[^"']*)?)["']/i
  ];
  for (const pattern of patterns) {
    const match = String(html || "").match(pattern);
    const url = absoluteUrl(match?.[1], baseUrl);
    if (isExternalNewsImage(url)) return url;
  }
  return "";
}

async function imageResponds(url) {
  if (!isExternalNewsImage(url)) return false;
  const headers = { "user-agent": "CowinMagnetNewsBot/1.0 (+https://cowinmagnet.co.za)" };
  try {
    const head = await fetch(url, { method: "HEAD", headers, signal: AbortSignal.timeout(8000) });
    const type = head.headers.get("content-type") || "";
    if (head.ok && type.startsWith("image/")) return true;
  } catch {}
  try {
    const get = await fetch(url, { headers: { ...headers, range: "bytes=0-2048" }, signal: AbortSignal.timeout(8000) });
    const type = get.headers.get("content-type") || "";
    return get.ok && type.startsWith("image/");
  } catch {
    return false;
  }
}

export async function resolveCandidateImage(candidate) {
  const feedImage = absoluteUrl(candidate.feed_image_url || candidate.cover_image_url, candidate.canonical_source_url || candidate.source_url);
  if (feedImage && await imageResponds(feedImage)) {
    return {
      url: feedImage,
      sourceUrl: candidate.canonical_source_url || candidate.source_url,
      pageUrl: candidate.canonical_source_url || candidate.source_url,
      alt: `${candidate.source_title} source image`,
      status: "verified-feed-image"
    };
  }
  try {
    const pageUrl = candidate.canonical_source_url || candidate.source_url;
    const res = await fetch(pageUrl, {
      headers: { "user-agent": "CowinMagnetNewsBot/1.0 (+https://cowinmagnet.co.za)" },
      signal: AbortSignal.timeout(12000)
    });
    if (!res.ok) throw new Error(`source HTTP ${res.status}`);
    const html = await res.text();
    const sourceImage = extractImageFromSourceHtml(html, pageUrl);
    if (sourceImage && await imageResponds(sourceImage)) {
      return {
        url: sourceImage,
        sourceUrl: sourceImage,
        pageUrl,
        alt: `${candidate.source_title} source image`,
        status: "verified-source-page-image"
      };
    }
  } catch {}
  return { url: "", sourceUrl: "", pageUrl: candidate.canonical_source_url || candidate.source_url, alt: "", status: "missing" };
}

function parseFeed(xml, source) {
  const items = [];
  const itemBlocks = [...String(xml).matchAll(/<item\b[\s\S]*?<\/item>/gi)].map((match) => match[0]);
  const entryBlocks = [...String(xml).matchAll(/<entry\b[\s\S]*?<\/entry>/gi)].map((match) => match[0]);
  for (const block of itemBlocks) {
    items.push({
      source_title: tag(block, "title"),
      summary: tag(block, "description") || tag(block, "content:encoded"),
      source_url: tag(block, "link") || attrTag(block, "link", "href"),
      source_author: tag(block, "dc:creator") || tag(block, "author"),
      source_published_at: tag(block, "pubDate") || tag(block, "published") || tag(block, "updated"),
      source_language: source.language || "en",
      feed_image_url: imageFromFeedBlock(block)
    });
  }
  for (const block of entryBlocks) {
    items.push({
      source_title: tag(block, "title"),
      summary: tag(block, "summary") || tag(block, "content"),
      source_url: attrTag(block, "link", "href") || tag(block, "id"),
      source_author: tag(block, "name") || tag(block, "author"),
      source_published_at: tag(block, "published") || tag(block, "updated"),
      source_language: source.language || "en",
      feed_image_url: imageFromFeedBlock(block)
    });
  }
  return items
    .map((item) => normalizeCandidate(item, source))
    .filter((item) => item.source_title && item.canonical_source_url && item.source_published_at);
}

function normalizeCandidate(item, source) {
  const canonical = canonicalizeUrl(item.source_url);
  const published = new Date(item.source_published_at);
  const normalizedTitle = normalizeTitle(item.source_title);
  return {
    id: hashText(`${canonical}|${normalizedTitle}|${source.id}`).slice(0, 16),
    source_title: item.source_title,
    source_author: item.source_author || "",
    source_publisher: source.publisher_name || source.domain,
    source_url: item.source_url,
    canonical_source_url: canonical,
    source_language: item.source_language || source.language || "en",
    source_published_at: Number.isNaN(published.getTime()) ? "" : published.toISOString(),
    source_fetched_at: new Date().toISOString(),
    source_timezone: "source-provided",
    feed_image_url: absoluteUrl(item.feed_image_url, canonical),
    normalized_title: normalizedTitle,
    summary: item.summary || "",
    credibility_score: Number(source.credibility_score || 0.5),
    source_id: source.id,
    source_domain: source.domain,
    source_fingerprint: hashText(`${canonical}|${normalizedTitle}`).slice(0, 32),
    content_hash: hashText(`${normalizedTitle}|${item.summary || ""}`).slice(0, 32),
    event_fingerprint: hashText(normalizedTitle.split(" ").slice(0, 12).join(" ")).slice(0, 32)
  };
}

function isRecentEnough(candidate, now, lookbackHours) {
  const published = new Date(candidate.source_published_at).getTime();
  return Number.isFinite(published) && now - published <= lookbackHours * 60 * 60 * 1000 && published <= now + 15 * 60 * 1000;
}

function tokenSet(value) {
  return new Set(
    String(value || "")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length > 2)
  );
}

function overlapScore(a, b) {
  const aa = tokenSet(a);
  const bb = tokenSet(b);
  if (!aa.size || !bb.size) return 0;
  let hit = 0;
  for (const word of aa) if (bb.has(word)) hit += 1;
  return hit / Math.max(aa.size, 1);
}

export function scoreProducts(candidate, products) {
  const text = `${candidate.source_title} ${candidate.summary}`.toLowerCase();
  const keywordHits = PRODUCT_KEYWORDS.filter((word) => text.includes(word)).length;
  return products
    .map((product) => {
      const productText = [
        product.name,
        product.category,
        product.categorySlug,
        product.shortDescription,
        ...(product.applications || []),
        ...(product.features || [])
      ].join(" ");
      const score = Math.min(1, overlapScore(text, productText) + keywordHits * 0.035);
      return {
        product_id: product.productId || product.sourceProductId || product.slug,
        slug: product.slug,
        name: product.name,
        category: product.category,
        categorySlug: product.categorySlug,
        image: product.image || product.mainImage || "/assets/images/hero-mining-conveyor-magnet.webp",
        url: `/en-za/products/${product.categorySlug || "products"}/${product.slug}/`,
        relevance_score: Number(score.toFixed(3)),
        relationship_reason: `Related to ${product.category || "magnetic separation"} and African material handling applications.`
      };
    })
    .filter((item) => item.relevance_score > 0)
    .sort((a, b) => b.relevance_score - a.relevance_score)
    .slice(0, 3);
}

export function isDuplicate(candidate, articles, dedupDays, now = Date.now()) {
  const windowStart = now - dedupDays * 24 * 60 * 60 * 1000;
  return articles.some((article) => {
    const usedAt = new Date(article.first_used_at || article.published_at || article.date || 0).getTime();
    if (!Number.isFinite(usedAt) || usedAt < windowStart) return false;
    if (article.canonical_source_url && article.canonical_source_url === candidate.canonical_source_url) return true;
    if (article.source_fingerprint && article.source_fingerprint === candidate.source_fingerprint) return true;
    if (article.event_fingerprint && article.event_fingerprint === candidate.event_fingerprint) return true;
    return overlapScore(article.normalized_title || article.title, candidate.normalized_title) > 0.82;
  });
}

function pickCategory(candidate) {
  const text = `${candidate.source_title} ${candidate.summary}`.toLowerCase();
  if (/recycl|waste|scrap/.test(text)) return "Recycling";
  if (/cement|aggregate|quarry|limestone/.test(text)) return "Cement and Aggregates";
  if (/coal|power/.test(text)) return "Coal Handling";
  if (/copper|gold|iron|ore|mining|mine/.test(text)) return "Mining";
  return "Industry News";
}

export function createArticle(candidate, relatedProducts, settings = DEFAULT_SETTINGS) {
  const product = relatedProducts[0];
  const imageUrl = isExternalNewsImage(candidate.cover_image_url) ? candidate.cover_image_url : "";
  const titleBase = candidate.source_title.replace(/\s+/g, " ").trim();
  const title = `${titleBase}: Magnetic Separation View`;
  const slugBase = slugify(`${titleBase} ${new Date(candidate.source_published_at).toISOString().slice(0, 10)}`);
  const date = new Date().toISOString().slice(0, 10);
  const sourceDate = new Date(candidate.source_published_at).toISOString();
  const productLinks = relatedProducts.map((item) => `<a href="${item.url}">${escapeHtml(item.name)}</a>`).join(", ");
  const sourceSummary = candidate.summary || `The source reports: ${candidate.source_title}.`;
  const content = [
    `<p><strong>Direct answer:</strong> This news is relevant to African buyers because it may influence mining, quarrying, cement, recycling or bulk material handling decisions where tramp metal control, crusher protection and magnetic separation equipment are part of plant reliability planning.</p>`,
    `<h2>Key Takeaways</h2><ul><li>The original source was published within the configured ${settings.lookbackHours}-hour news window.</li><li>The story is connected to Cowin Magnet products through material handling, separation, mining, cement, quarry or recycling context.</li><li>This article summarizes the public source and adds Cowin Magnet's equipment-selection perspective.</li><li>Buyers should verify site operating data before selecting magnetic separation equipment.</li></ul>`,
    `<h2>Original News Facts</h2><p>${escapeHtml(sourceSummary)}</p><p>The source publisher is ${escapeHtml(candidate.source_publisher)}. The original publication time recorded by this system is ${sourceDate}.</p>`,
    `<h2>Why This Matters for African Industrial Buyers</h2><p>Many African mining, quarry, cement and recycling sites operate with long conveyor lines, abrasive material, variable moisture and limited maintenance windows. A market or project development in these sectors can affect how buyers plan crusher protection, ferrous contamination control, plant uptime and equipment maintenance.</p>`,
    `<h2>Cowin Magnet View</h2><p>Our view is that news in mineral processing, bulk handling, cement production and recycling should be translated into practical operating questions: what material is being conveyed, where tramp metal can enter the line, how deep the burden is, and whether manual or self-cleaning separation is suitable. Those questions matter more than generic equipment labels.</p>`,
    `<h2>How We Can Help</h2><p>Cowin Magnet can support equipment selection for related applications using real operating data. Relevant products may include ${productLinks || "overband magnetic separators, suspended magnets, wet drum magnetic separators and metal detection equipment"} depending on the material stream and installation point.</p>`,
    `<h2>Related Products</h2><p>${productLinks || "Product matching will be confirmed after reviewing the application."}</p>`,
    `<h2>Information Source</h2><p>This article is based on public source information and independent analysis. Original reporting copyright belongs to the original publisher.</p>`
  ].join("\n");
  const excerpt = `${candidate.source_publisher} reported ${candidate.source_title}. Cowin Magnet explains why the development matters for African magnetic separation and material handling buyers.`;
  const keywords = [...new Set(["magnetic separator", "mining equipment", "crusher protection", product?.name, pickCategory(candidate)].filter(Boolean))];
  return {
    id: `NEWS-${hashText(candidate.source_fingerprint).slice(0, 12)}`,
    slug: slugBase,
    title,
    excerpt,
    summary: excerpt,
    content,
    article_type: "news",
    status: settings.autoPublish && imageUrl ? "published" : "draft",
    language: "en-ZA",
    category: pickCategory(candidate),
    tags: keywords,
    cover_image_url: imageUrl,
    cover_image_source_url: candidate.cover_image_source_url || imageUrl,
    cover_image_page_url: candidate.cover_image_page_url || candidate.canonical_source_url || candidate.source_url,
    cover_image_alt: candidate.cover_image_alt || `${candidate.source_title} source image`,
    cover_image_status: candidate.cover_image_status || "verified-source-page-image",
    cover_image_fetched_at: candidate.cover_image_fetched_at || new Date().toISOString(),
    cover_image_hash: candidate.cover_image_hash || hashText(imageUrl).slice(0, 32),
    author_name: "Cowin Magnet South Africa",
    date,
    published_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    seo_title: title.slice(0, 65),
    seo_description: excerpt.slice(0, 155),
    seoTitle: title.slice(0, 65),
    seoDescription: excerpt.slice(0, 155),
    canonical_url: `/en-za/news/${slugBase}/`,
    primary_keyword: keywords[0],
    secondary_keywords: keywords.slice(1),
    geo_summary: `${candidate.source_publisher} reported a recent development related to ${pickCategory(candidate)}. Cowin Magnet connects the facts to African material handling and magnetic separation equipment selection.`,
    key_takeaways: [
      "Recent public source within 72 hours at collection time.",
      "Relevant to African industrial material handling buyers.",
      "Includes source facts, Cowin Magnet analysis and related products.",
      "Links users to real Cowin Magnet product pages."
    ],
    source_title: candidate.source_title,
    source_author: candidate.source_author,
    source_publisher: candidate.source_publisher,
    sourceUrl: candidate.source_url,
    source_url: candidate.source_url,
    canonical_source_url: candidate.canonical_source_url,
    source_language: candidate.source_language,
    source_published_at: candidate.source_published_at,
    source_fetched_at: candidate.source_fetched_at,
    source_timezone: candidate.source_timezone,
    source_fingerprint: candidate.source_fingerprint,
    event_fingerprint: candidate.event_fingerprint,
    content_hash: candidate.content_hash,
    normalized_title: candidate.normalized_title,
    first_used_at: new Date().toISOString(),
    relevance_score: relatedProducts[0]?.relevance_score || 0,
    credibility_score: candidate.credibility_score,
    generation_model: process.env.AI_PROVIDER_API_KEY ? "external-ai-configured" : "deterministic-template",
    generation_prompt_version: "news-v1",
    related_products: relatedProducts,
    product_ids: relatedProducts.map((item) => item.product_id),
    created_at: new Date().toISOString()
  };
}

export function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function collectNewsCandidates(settings = DEFAULT_SETTINGS) {
  const sources = await readDataJson("data/news/news-sources.json", DEFAULT_SOURCES);
  const enabledSources = sources.filter((source) => source.enabled && source.allowed_for_auto_publish && source.rss_url);
  const candidates = [];
  const errors = [];
  for (const source of enabledSources) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12000);
      const res = await fetch(source.rss_url, {
        headers: { "user-agent": "CowinMagnetNewsBot/1.0 (+https://cowinmagnet.co.za)" },
        signal: controller.signal
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const xml = await res.text();
      candidates.push(...parseFeed(xml, source));
    } catch (error) {
      errors.push({ source: source.id, error: error?.message || String(error) });
    }
  }
  const now = Date.now();
  return {
    candidates: candidates.filter((candidate) => isRecentEnough(candidate, now, settings.lookbackHours)),
    errors
  };
}

export async function runNewsAutomation(options = {}) {
  const settings = { ...DEFAULT_SETTINGS, ...options };
  const startedAt = new Date().toISOString();
  const [articles, products] = await Promise.all([
    readDataJson("data/articles/articles.json", []),
    readDataJson("data/products/products.json", [])
  ]);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: settings.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const publishedToday = articles.filter((item) => (item.status || "published") === "published" && String(item.published_at || item.date || "").startsWith(today));
  const need = Math.max(0, settings.dailyTarget - publishedToday.length);
  const job = {
    id: `JOB-${Date.now()}-${hashText(startedAt).slice(0, 6)}`,
    job_type: "daily-news-publish",
    status: "running",
    scheduled_at: startedAt,
    started_at: startedAt,
    retry_count: 0,
    metadata: { target: settings.dailyTarget, publishedToday: publishedToday.length, need }
  };
  const jobs = await readDataJson("data/news/news-jobs.json", []);
  jobs.unshift(job);
  await writeDataJson("data/news/news-jobs.json", jobs.slice(0, 500));
  if (!need) {
    job.status = "completed";
    job.completed_at = new Date().toISOString();
    job.metadata.message = "Daily target already met";
    await finishJob(job);
    await auditDay(today, settings, articles);
    return { published: [], need: 0, errors: [], job };
  }
  const { candidates, errors } = await collectNewsCandidates(settings);
  const newArticles = [];
  let missingImages = 0;
  for (const candidate of candidates) {
    if (newArticles.length >= need) break;
    if (isDuplicate(candidate, [...articles, ...newArticles], settings.dedupDays)) continue;
    const related = scoreProducts(candidate, products);
    if (!related.length || related[0].relevance_score < settings.relevanceThreshold) continue;
    const resolvedImage = await resolveCandidateImage(candidate);
    if (!resolvedImage.url) {
      missingImages += 1;
      continue;
    }
    const candidateWithImage = {
      ...candidate,
      cover_image_url: resolvedImage.url,
      cover_image_source_url: resolvedImage.sourceUrl,
      cover_image_page_url: resolvedImage.pageUrl,
      cover_image_alt: resolvedImage.alt,
      cover_image_status: resolvedImage.status,
      cover_image_fetched_at: new Date().toISOString(),
      cover_image_hash: hashText(resolvedImage.url).slice(0, 32)
    };
    const article = createArticle(candidateWithImage, related, settings);
    let slug = article.slug;
    let suffix = 2;
    while ([...articles, ...newArticles].some((item) => item.slug === slug)) slug = `${article.slug}-${suffix++}`;
    article.slug = slug;
    article.canonical_url = `/en-za/news/${slug}/`;
    newArticles.push(article);
  }
  const updatedArticles = [...newArticles, ...articles];
  if (newArticles.length) await writeDataJson("data/articles/articles.json", updatedArticles);
  job.status = newArticles.length >= need ? "completed" : "failed";
  job.completed_at = new Date().toISOString();
  job.error_message = newArticles.length >= need ? "" : `Published ${newArticles.length} of ${need} required articles`;
  job.metadata = { ...job.metadata, collected: candidates.length, published: newArticles.length, missingImages, sourceErrors: errors };
  await finishJob(job);
  await auditDay(today, settings, updatedArticles);
  return { published: newArticles, need, errors, job };
}

async function finishJob(job) {
  const jobs = await readDataJson("data/news/news-jobs.json", []);
  const index = jobs.findIndex((item) => item.id === job.id);
  if (index >= 0) jobs[index] = job;
  else jobs.unshift(job);
  await writeDataJson("data/news/news-jobs.json", jobs.slice(0, 500));
}

async function auditDay(date, settings, articles) {
  const published = articles.filter((item) => (item.status || "published") === "published" && String(item.published_at || item.date || "").startsWith(date));
  const audits = await readDataJson("data/news/news-publication-audits.json", []);
  const record = {
    id: `AUDIT-${date}`,
    date,
    timezone: settings.timezone,
    target_count: settings.dailyTarget,
    published_count: published.length,
    missing_count: Math.max(0, settings.dailyTarget - published.length),
    status: published.length >= settings.dailyTarget ? "complete" : "missing",
    checked_at: new Date().toISOString()
  };
  const existing = audits.findIndex((item) => item.id === record.id);
  if (existing >= 0) audits[existing] = record;
  else audits.unshift(record);
  await writeDataJson("data/news/news-publication-audits.json", audits.slice(0, 370));
  return record;
}

export async function getNewsState() {
  const [articles, sources, jobs, audits] = await Promise.all([
    readDataJson("data/articles/articles.json", []),
    readDataJson("data/news/news-sources.json", DEFAULT_SOURCES),
    readDataJson("data/news/news-jobs.json", []),
    readDataJson("data/news/news-publication-audits.json", [])
  ]);
  return { settings: DEFAULT_SETTINGS, articles, sources, jobs, audits };
}
