import crypto from "node:crypto";
import { readDataJson, withDataLock, writeDataJson } from "./news-system.js";

const BASE_PATH = "data/news-automation";
const DAY = 24 * 60 * 60 * 1000;
const VALID_STATES = new Set([
  "discovery", "verified", "eligible", "planned", "generating",
  "evidence_review", "quality_review", "scheduled", "published", "monitored", "rejected"
]);

export const newsAutomationPaths = {
  config: `${BASE_PATH}/config.json`,
  sources: `${BASE_PATH}/sources.json`,
  candidates: `${BASE_PATH}/candidates.json`,
  plans: `${BASE_PATH}/editorial-plans.json`,
  drafts: `${BASE_PATH}/generated-articles.json`,
  runs: `${BASE_PATH}/publication-runs.json`
};

export const defaultNewsAutomationConfig = {
  version: 1,
  mode: "preproduction",
  enabled: false,
  schedule: {
    discovery: "0 7 * * *",
    editorial: "0 8 */2 * *",
    weeklyReport: "0 9 * * 1"
  },
  requiredPreproductionApprovals: 6,
  maxSourceAgeDays: 90,
  minIndependentSources: 2,
  maxRetries: 2,
  updatedAt: "2026-08-08T00:00:00.000Z"
};

function id(prefix, value = "") {
  return `${prefix}_${crypto.createHash("sha256").update(`${value}:${Date.now()}:${crypto.randomUUID()}`).digest("hex").slice(0, 16)}`;
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function words(value) {
  return String(value || "").replace(/<[^>]*>/g, " ").trim().split(/\s+/).filter(Boolean).length;
}

function host(value) {
  try {
    return new URL(value).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
}

function validUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function isRecent(value, maxDays, now = new Date()) {
  const date = new Date(value);
  return !Number.isNaN(date.valueOf()) && date <= now && now - date <= maxDays * DAY;
}

function similarity(left, right) {
  const tokens = (value) => new Set(String(value || "").toLowerCase().match(/[a-z0-9]{3,}/g) || []);
  const a = tokens(left);
  const b = tokens(right);
  if (!a.size || !b.size) return 0;
  let overlap = 0;
  for (const token of a) if (b.has(token)) overlap += 1;
  return overlap / new Set([...a, ...b]).size;
}

export function evaluateNewsDraft({ draft = {}, sources = [], products = [], recentArticles = [], config = defaultNewsAutomationConfig, now = new Date() }) {
  const failures = [];
  const selectedSources = array(draft.sourceIds)
    .map((sourceId) => array(sources).find((source) => source.id === sourceId))
    .filter(Boolean);
  const independentHosts = new Set(selectedSources.map((source) => host(source.url)).filter(Boolean));
  const truthBySlug = new Map(array(products).map((product) => [product.slug, product]));
  const relatedProducts = array(draft.productSlugs).map((slug) => truthBySlug.get(slug)).filter(Boolean);
  const title = String(draft.title || "").trim();
  const content = String(draft.content || "").trim();
  const titleSimilarity = Math.max(0, ...array(recentArticles).map((article) => similarity(title, article.title)));
  const bodySimilarity = Math.max(0, ...array(recentArticles).map((article) => similarity(content, article.content || article.summary)));

  if (!title || !content) failures.push("A title and article body are required.");
  if (words(content) < 900 || words(content) > 1500) failures.push("Article body must contain 900 to 1,500 English words.");
  if (selectedSources.length < Number(config.minIndependentSources || 2) || independentHosts.size < Number(config.minIndependentSources || 2)) {
    failures.push("At least two independent, recorded source URLs are required.");
  }
  if (selectedSources.some((source) => !validUrl(source.url) || !isRecent(source.publishedAt, Number(config.maxSourceAgeDays || 90), now))) {
    failures.push("Each source must have a valid URL and a publication date within the approved freshness window.");
  }
  if (!relatedProducts.length) failures.push("At least one verified COWIN product truth card must be linked.");
  if (relatedProducts.some((product) => product.truthCardStatus !== "verified")) failures.push("Linked product truth cards are not all verified.");
  if (array(draft.imageUrls).some((value) => !String(value).startsWith("/assets/images/"))) {
    failures.push("Only owned or licensed local media-library paths may be attached.");
  }
  if (/(?:seo\s*meta|primary\s*keyword|search\s*intent|ai\s*citation|cms\s*(?:checklist|publishing))/i.test(`${title}\n${content}`)) {
    failures.push("Internal editorial fields must not be published.");
  }
  if (titleSimilarity > 0.82 || bodySimilarity > 0.72) failures.push("Similarity threshold against the last 180 days of published content was exceeded.");

  return {
    passed: failures.length === 0,
    failures,
    metrics: {
      wordCount: words(content),
      sourceCount: selectedSources.length,
      independentSourceCount: independentHosts.size,
      titleSimilarity: Number(titleSimilarity.toFixed(3)),
      bodySimilarity: Number(bodySimilarity.toFixed(3))
    }
  };
}

async function loadAutomationData() {
  const [storedConfig, sources, candidates, plans, drafts, runs, products, articles] = await Promise.all([
    readDataJson(newsAutomationPaths.config, defaultNewsAutomationConfig),
    readDataJson(newsAutomationPaths.sources, []),
    readDataJson(newsAutomationPaths.candidates, []),
    readDataJson(newsAutomationPaths.plans, []),
    readDataJson(newsAutomationPaths.drafts, []),
    readDataJson(newsAutomationPaths.runs, []),
    readDataJson("data/products/products.json", []),
    readDataJson("data/articles/articles.json", [])
  ]);
  return {
    config: { ...defaultNewsAutomationConfig, ...(storedConfig || {}) },
    sources: array(sources), candidates: array(candidates), plans: array(plans), drafts: array(drafts), runs: array(runs),
    products: array(products), articles: array(articles)
  };
}

export async function newsAutomationStatus() {
  const data = await loadAutomationData();
  const approvedPreproduction = data.drafts.filter((draft) => draft.status === "quality_review" && draft.qa?.passed).length;
  const environmentEnabled = process.env.NEWS_AUTOPUBLISH_ENABLED === "true";
  const mode = process.env.NEWS_AUTOPUBLISH_MODE || data.config.mode;
  const productionReady = data.config.enabled === true && environmentEnabled && mode === "production" && approvedPreproduction >= data.config.requiredPreproductionApprovals;
  return {
    enabled: data.config.enabled === true && environmentEnabled,
    mode,
    productionReady,
    approvedPreproduction,
    requiredPreproductionApprovals: data.config.requiredPreproductionApprovals,
    counts: {
      sources: data.sources.length, candidates: data.candidates.length, plans: data.plans.length,
      drafts: data.drafts.length, runs: data.runs.length,
      published: data.runs.filter((run) => run.result === "published").length
    },
    schedule: data.config.schedule,
    latestRun: data.runs[0] || null,
    blockers: productionReady ? [] : [
      data.config.enabled === true && environmentEnabled ? null : "NEWS_AUTOPUBLISH_ENABLED is not enabled.",
      mode === "production" ? null : "Automation mode is preproduction.",
      approvedPreproduction >= data.config.requiredPreproductionApprovals ? null : `Only ${approvedPreproduction}/${data.config.requiredPreproductionApprovals} preproduction articles passed the quality gate.`
    ].filter(Boolean)
  };
}

export async function queueNewsSource(input, actor) {
  const source = {
    id: id("source", input.url), url: String(input.url || "").trim(), publisher: String(input.publisher || "").trim(),
    publisherType: String(input.publisherType || "").trim(), publishedAt: String(input.publishedAt || "").trim(),
    fetchedAt: new Date().toISOString(), rightsNote: String(input.rightsNote || "").trim(),
    trustTier: String(input.trustTier || "").trim(), status: "discovery", createdBy: actor
  };
  if (!validUrl(source.url) || !source.publisher || !source.publishedAt) throw new Error("A valid source URL, publisher and publication date are required.");
  return withDataLock("news-automation-source-queue", async () => {
    const sources = array(await readDataJson(newsAutomationPaths.sources, []));
    const existing = sources.find((item) => item.url === source.url);
    if (existing) return existing;
    await writeDataJson(newsAutomationPaths.sources, [source, ...sources]);
    return source;
  });
}

export async function reviewNewsDraft(input, actor) {
  const draft = { ...input, id: String(input.id || id("draft", input.title)), title: String(input.title || "").trim(), content: String(input.content || "").trim(), sourceIds: array(input.sourceIds), productSlugs: array(input.productSlugs), imageUrls: array(input.imageUrls) };
  return withDataLock("news-automation-review", async () => {
    const data = await loadAutomationData();
    const recentArticles = data.articles.filter((article) => article.status === "published" && new Date(article.published_at || article.date || 0) >= new Date(Date.now() - 180 * DAY));
    const qa = evaluateNewsDraft({ draft, sources: data.sources, products: data.products, recentArticles, config: data.config });
    const reviewed = { ...draft, status: qa.passed ? "quality_review" : "rejected", qa: { ...qa, reviewedAt: new Date().toISOString(), reviewedBy: actor }, updatedAt: new Date().toISOString() };
    const drafts = [reviewed, ...data.drafts.filter((item) => item.id !== reviewed.id)];
    await writeDataJson(newsAutomationPaths.drafts, drafts);
    return reviewed;
  });
}

export async function runNewsAutomation(trigger = "cron") {
  return withDataLock("news-automation-run", async () => {
    const status = await newsAutomationStatus();
    const run = { id: id("run", trigger), trigger, startedAt: new Date().toISOString(), result: "blocked", blockers: status.blockers, retryCount: 0 };
    const runs = array(await readDataJson(newsAutomationPaths.runs, []));
    await writeDataJson(newsAutomationPaths.runs, [run, ...runs].slice(0, 200));
    return { run, status };
  });
}

export function validateNewsAutomationState(value) {
  return VALID_STATES.has(String(value || ""));
}
