import crypto from "node:crypto";
import { readDataJson, sanitizePublishedArticleHtml, withDataLock, writeDataJson } from "./news-system.js";
import { discoverNewsSources } from "./news-sources.js";

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
  version: 2,
  siteId: "cowinmagnet-za",
  siteUrl: "https://cowinmagnet.co.za",
  locale: "en-ZA",
  timezone: "Africa/Johannesburg",
  mode: "production",
  enabled: true,
  schedule: {
    discovery: "0 */12 * * *",
    editorial: "0 8 */2 * *",
    weeklyReport: "0 9 * * 1"
  },
  requiredPreproductionApprovals: 0,
  publishIntervalHours: 48,
  candidateMaxAgeHours: 72,
  fallbackCandidateMaxAgeDays: 7,
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

function candidateFingerprint(source) {
  return crypto.createHash("sha256").update(`${source.url}|${source.title}|${source.publishedAt}`).digest("hex");
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
  const permittedAgeDays = Number(config.candidateMaxAgeHours || 72) / 24;
  if (selectedSources.some((source) => !validUrl(source.url) || !isRecent(source.publishedAt, permittedAgeDays, now))) {
    failures.push("Each source must have a valid URL and a publication date within the approved freshness window.");
  }
  if (!relatedProducts.length) failures.push("At least one verified COWIN product truth card must be linked.");
  if (relatedProducts.some((product) => product.truthCardStatus !== "verified" && !(product.truthCardStatus === "synced-from-main-site" && /cowinmagnet\.com$/i.test(product.sourceSite || "")))) failures.push("Linked product truth cards are not all verified.");
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
  const productionReady = data.config.enabled === true && environmentEnabled && mode === "production";
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
      null
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

function articleBody(sources, product, now) {
  const sourceList = sources.map((source) => `<li><a href="${source.url}" rel="nofollow noopener noreferrer" target="_blank">${source.publisher}: ${source.title}</a>, published ${new Date(source.publishedAt).toLocaleDateString("en-ZA", { dateStyle: "long", timeZone: "UTC" })}.</li>`).join("");
  return sanitizePublishedArticleHtml(`
<h2>What the latest updates indicate</h2>
<p>Recent South African mining and industrial updates provide useful context for plant teams reviewing material handling reliability. The reports do not identify a COWIN installation and they do not prove that one equipment configuration suits a named operation. They do, however, reinforce a practical engineering requirement: production plans depend on equipment protection, controlled material flow and maintenance decisions that are based on verified site data.</p>
<p>For procurement and engineering teams, the important step is to translate broad industry developments into questions that can be answered at the conveyor, transfer point or process line. That means identifying where unwanted ferrous material can enter the flow, what downstream equipment is exposed, how collected metal can be discharged safely, and which operating conditions affect selection.</p>
<h2>Where a bulk-material process is exposed</h2>
<p>Tramp iron may enter mined ore, coal, aggregate or other bulk material through upstream handling, wear, maintenance activity or contaminated feed. A risk point can occur ahead of a crusher, at a transfer chute, before a screen, on a stockpile route or in a reclaim circuit. The consequence varies by process: damage risk, unplanned inspection, contamination or interruption of downstream flow.</p>
<p>A magnetic separator should therefore be considered as part of the process layout, not as an isolated catalogue item. Available suspension height, burden depth, belt speed, material characteristics, structural support, discharge space and safe access all influence the review. A configuration that is difficult to inspect or cannot discharge captured material safely can introduce a new operating problem.</p>
<h2>How magnetic separation can fit</h2>
<p>${product.name} is one product family that may be reviewed where its actual cleaning method, magnet system and installation arrangement match the duty. It is not a universal answer. COWIN engineering must confirm the selection against the buyer's material and layout information, and project-specific values remain available on request until that review is complete.</p>
<p>The process objective must also be clear. Protecting a downstream crusher is different from recovering a saleable fraction, controlling fine contamination or detecting metal before a critical machine. Keeping these objectives separate helps the project team choose an appropriate equipment family and prevents permanent, electromagnetic, manual-cleaning and self-cleaning attributes from being mixed.</p>
<h2>Selection information to prepare</h2>
<ul><li>Conveyor width, belt speed and the maximum burden depth at the proposed position.</li><li>Material type, particle-size range, moisture, temperature and bulk behaviour.</li><li>The expected ferrous contamination, including typical shape, size and frequency where known.</li><li>Installation orientation, suspension height, transfer geometry and available support structure.</li><li>The downstream machine or product-quality objective that requires protection.</li><li>Required cleaning method, discharge direction, maintenance access and guarding constraints.</li><li>Outdoor exposure, dust, corrosion, altitude and the available electrical supply where relevant.</li></ul>
<h2>Installation and operating review</h2>
<p>Before quotation, the proposed position should be checked against the material trajectory and nearby steelwork. Photographs and a dimensioned layout are often more useful than a single headline specification. The review should also cover access for inspection, removal of collected metal, guarding, isolation and the route for lifting or replacing wear components.</p>
<p>Operating teams should define a realistic inspection routine. The frequency depends on contamination and duty rather than a generic interval. Records of captured material, belt condition and unusual events can improve later configuration decisions without relying on unsupported performance claims.</p>
<h2>How to compare configuration choices</h2>
<p>A permanent magnetic system may be considered where the verified duty and installation suit that technology, while an electromagnetic system has different power, control and cooling considerations. Manual-cleaning and self-cleaning arrangements also solve different operating needs. These descriptions must not be combined into one generic specification: the selected product page and quotation should describe only the actual configuration under review.</p>
<p>The cleaning decision should account for the amount and frequency of captured material, the ability to stop the process safely, the discharge route and the maintenance plan. Continuous operation alone does not prove that a self-cleaning separator is appropriate. Likewise, occasional contamination does not remove the need for safe access and a defined cleaning procedure. The project team should document the reason for the chosen arrangement.</p>
<p>Environmental conditions can change the final equipment details without changing the basic process objective. Outdoor exposure, coastal corrosion, high dust levels, rain, ambient temperature, altitude and transport constraints may affect finishes, guards, electrical coordination and support design. COWIN can coordinate these requirements for South African and African projects, but they must be stated in the enquiry rather than assumed from the destination country.</p>
<h2>Illustrative decision path</h2>
<p><strong>Illustrative engineering scenario, not a customer case:</strong> a bulk-handling team identifies ferrous contamination ahead of a crusher. It confirms the process objective, measures the conveyor and burden, records the available height and maps a safe discharge route. If continuous cleaning is needed, it reviews a self-cleaning configuration; if contamination is intermittent and the process permits planned cleaning, another arrangement may be more appropriate. The team then sends the verified inputs for a project-specific review instead of selecting from belt width alone.</p>
<h2>Questions engineering teams commonly ask</h2>
<h3>Can equipment be selected from conveyor width only?</h3><p>No. Conveyor width is one input. Burden depth, suspension height, belt speed, material, contamination and installation geometry are also required.</p>
<h3>Does this update describe a South African COWIN customer site?</h3><p>No. It is an original interpretation of public industry information. It does not claim a local office, stockholding, installation or customer relationship.</p>
<h3>Are performance values available immediately?</h3><p>Confirmed project values depend on the selected model and operating data. Unverified figures are not published as guarantees; they are confirmed during the engineering review.</p>
<h3>What should accompany a quote request?</h3><p>Send the selection information above, together with layout drawings or site photographs where available. This allows the configuration discussion to start with the real process.</p>
<h2>Key takeaways</h2>
<ul><li>Industry developments are context for engineering decisions, not evidence of a specific equipment purchase.</li><li>Magnetic separation selection starts with the process objective and verified site data.</li><li>Installation, cleaning and maintenance access must be considered together.</li><li>Unknown project values should be confirmed during review rather than replaced by generic claims.</li></ul>
<h2>Sources and methodology</h2><p>This article is an original engineering interpretation generated from current public-source metadata and checked by automated publication gates. It does not reproduce source articles or infer equipment purchases.</p><ul>${sourceList}</ul>
<p>Sources were accessed ${now.toLocaleDateString("en-ZA", { dateStyle: "long", timeZone: "UTC" })}. This page is an independent editorial summary and analysis; it is not a product offer or a statement by the source publisher.</p>`);
}

function slugify(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 90);
}

export async function runNewsIngest(trigger = "cron", options = {}) {
  return withDataLock("news-automation-ingest", async () => {
    const now = options.now ? new Date(options.now) : new Date();
    const data = await loadAutomationData();
    const maxAgeHours = Number(data.config.candidateMaxAgeHours || 72);
    const discovered = await discoverNewsSources({ fetchImpl: options.fetchImpl || fetch, now, maxAgeDays: Math.ceil(maxAgeHours / 24) });
    const usedUrls = new Set(data.articles.filter((article) => article.article_type === "news").flatMap((article) => array(article.source_urls || article.source_url)));
    const existing = new Map(data.candidates.map((candidate) => [candidate.fingerprint || candidateFingerprint(candidate), candidate]));
    const candidates = [...data.candidates];
    for (const source of discovered) {
      const fingerprint = candidateFingerprint(source);
      if (usedUrls.has(source.url) || existing.has(fingerprint)) continue;
      const ageHours = (now - new Date(source.publishedAt)) / 3600000;
      if (ageHours < 0 || ageHours > maxAgeHours) continue;
      candidates.unshift({
        ...source, id: `candidate_${fingerprint.slice(0, 16)}`, fingerprint, site_id: data.config.siteId,
        status: "candidate", score: Math.min(100, 55 + Number(source.score || 0) * 10 + (source.trustTier === "primary" ? 20 : 0)),
        discovered_at: now.toISOString(), updated_at: now.toISOString(), reject_reason: ""
      });
    }
    const run = { id: id("ingest", trigger), site_id: data.config.siteId, trigger, startedAt: now.toISOString(), finishedAt: new Date().toISOString(), result: "ingested", discovered: discovered.length, candidates: candidates.filter((item) => item.status === "candidate").length };
    if (!options.dryRun) await Promise.all([
      writeDataJson(newsAutomationPaths.candidates, candidates.slice(0, 500)),
      writeDataJson(newsAutomationPaths.runs, [run, ...data.runs].slice(0, 200))
    ]);
    return { result: "ingested", run, discovered: discovered.length, candidates: candidates.filter((item) => item.status === "candidate").length };
  });
}

export async function runNewsAutomation(trigger = "cron", options = {}) {
  return withDataLock("news-automation-run", async () => {
    const now = options.now ? new Date(options.now) : new Date();
    const data = await loadAutomationData();
    const environmentEnabled = process.env.NEWS_AUTOPUBLISH_ENABLED === "true";
    const mode = process.env.NEWS_AUTOPUBLISH_MODE || data.config.mode;
    if (!data.config.enabled || !environmentEnabled || mode !== "production") throw new Error("News automation is not enabled in production mode.");
    const lastPublished = data.articles.filter((article) => article.status === "published" && article.article_type === "news").sort((a, b) => new Date(b.published_at) - new Date(a.published_at))[0];
    const interval = Number(data.config.publishIntervalHours || 48) * 3600000;
    if (!options.force && lastPublished && now - new Date(lastPublished.published_at) < interval) return { result: "not_due", nextEligibleAt: new Date(new Date(lastPublished.published_at).valueOf() + interval).toISOString() };
    const usedUrls = new Set(data.articles.flatMap((article) => array(article.source_urls || article.source_url)));
    const primaryWindow = Number(data.config.candidateMaxAgeHours || 72) * 3600000;
    const fallbackWindow = Number(data.config.fallbackCandidateMaxAgeDays || 7) * DAY;
    const unused = data.candidates.filter((candidate) => candidate.site_id === data.config.siteId && candidate.status === "candidate" && !usedUrls.has(candidate.url) && now - new Date(candidate.publishedAt) <= fallbackWindow);
    const preferred = unused.filter((candidate) => now - new Date(candidate.publishedAt) <= primaryWindow);
    const chosen = [...preferred, ...unused.filter((candidate) => !preferred.includes(candidate))].sort((a, b) => Number(b.score || 0) - Number(a.score || 0)).filter((source, index, all) => !all.slice(0, index).some((item) => host(item.url) === host(source.url)));
    if (chosen.length < data.config.minIndependentSources) throw new Error("Fewer than two unused independent current sources were available.");
    const sourceRecords = chosen.slice(0, 2).map((source) => ({ ...source, id: `source_${crypto.createHash("sha256").update(source.url).digest("hex").slice(0, 16)}`, status: "verified" }));
    const product = data.products.find((item) => item.slug === "permanent-overband-magnetic-separator") || data.products[0];
    const title = `What ${chosen[0].title} Means for Material Handling Decisions`;
    const content = articleBody(sourceRecords, product, now);
    const draft = { id: id("draft", title), title, content, sourceIds: sourceRecords.map((source) => source.id), productSlugs: [product.slug], imageUrls: [product.image] };
    const qa = evaluateNewsDraft({ draft, sources: [...sourceRecords, ...data.sources], products: data.products, recentArticles: data.articles, config: data.config, now });
    if (!qa.passed) throw new Error(`News quality gate failed: ${qa.failures.join(" ")}`);
    const runId = id("run", trigger);
    const article = {
      slug: `${slugify(title)}-${now.toISOString().slice(0, 10)}`, title,
      summary: "A source-based engineering review of current South African industry signals and the operating data needed for conveyor protection decisions.",
      excerpt: "Current industry signals are translated into practical selection questions for mines and bulk-material operations.",
      content, status: "published", article_type: "news", category: "Mining & Mineral Processing",
      published_at: now.toISOString(), updated_at: now.toISOString(), author_name: "Cowin Magnet South Africa Editorial Team",
      source_url: sourceRecords[0].url, source_urls: sourceRecords.map((source) => source.url), source_title: sourceRecords[0].title,
      source_publisher: sourceRecords[0].publisher, source_published_at: sourceRecords[0].publishedAt, source_fetched_at: now.toISOString(),
      cover_image_url: product.image, cover_image_alt: `${product.name} for conveyor protection review`, cover_image_caption: "COWIN product image; final configuration is project-specific.",
      image_rights: "COWIN owned product media", related_products: [{ name: product.name, category: product.category, image: product.image, url: product.canonicalUrl || `/en-za/products/${product.categorySlug}/${product.slug}/`, relationship_reason: "Relevant to conveyor protection configuration reviews." }],
      editorial_method: "automated-source-based-quality-gate", publication_run_id: runId, automation_published_at: now.toISOString()
    };
    const run = { id: runId, site_id: data.config.siteId, trigger, startedAt: now.toISOString(), finishedAt: new Date().toISOString(), result: "published", articleSlug: article.slug, sourceUrls: article.source_urls, qa: qa.metrics, retryCount: 0 };
    if (options.dryRun) return { result: "dry_run", article, run, qa };
    await Promise.all([
      writeDataJson(newsAutomationPaths.sources, [...sourceRecords, ...data.sources.filter((item) => !sourceRecords.some((source) => source.id === item.id))]),
      writeDataJson(newsAutomationPaths.candidates, data.candidates.map((candidate) => sourceRecords.some((source) => source.url === candidate.url) ? { ...candidate, status: "used", used_at: now.toISOString(), article_slug: article.slug } : candidate)),
      writeDataJson(newsAutomationPaths.drafts, [{ ...draft, status: "published", qa }, ...data.drafts]),
      writeDataJson(newsAutomationPaths.runs, [run, ...data.runs].slice(0, 200)),
      writeDataJson("data/articles/articles.json", [article, ...data.articles])
    ]);
    return { result: "published", article, run, qa };
  });
}

export function validateNewsAutomationState(value) {
  return VALID_STATES.has(String(value || ""));
}
