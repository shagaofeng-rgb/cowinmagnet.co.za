import crypto from "node:crypto";
import { readDataJson, sanitizePublishedArticleHtml, withDataLock, writeDataJson } from "./news-system.js";
import { buildNewsArticleDraft, classifyNewsAngle } from "./news-article-generator.js";
import { canonicalizeNewsSourceUrl, discoverNewsSources, newsSourceIdentity } from "./news-sources.js";

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
  version: 3,
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
  candidateMaxAgeHours: 168,
  fallbackCandidateMaxAgeDays: 45,
  minIndependentSources: 2,
  maxRetries: 2,
  maxAttemptsPerRun: 6,
  maxDraftVariantsPerPair: 3,
  retryBackoffHours: 24,
  publicationSlaHours: 60,
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

export function candidateFingerprint(source) {
  return crypto.createHash("sha256").update(newsSourceIdentity(source)).digest("hex");
}

function similarity(left, right, shingleSize = 1) {
  const shingles = (value) => {
    const tokens = String(value || "").toLowerCase().match(/[a-z0-9]{3,}/g) || [];
    if (tokens.length < shingleSize) return new Set(tokens);
    return new Set(tokens.slice(0, tokens.length - shingleSize + 1).map((_, index) => tokens.slice(index, index + shingleSize).join(" ")));
  };
  const a = shingles(left);
  const b = shingles(right);
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
  const titleMatches = array(recentArticles).map((article) => ({ article, score: similarity(title, article.title, 2) }));
  const bodyMatches = array(recentArticles).map((article) => ({ article, score: similarity(content, article.content || article.summary, 5) }));
  const strongestTitleMatch = titleMatches.sort((a, b) => b.score - a.score)[0];
  const strongestBodyMatch = bodyMatches.sort((a, b) => b.score - a.score)[0];
  const titleSimilarity = strongestTitleMatch?.score || 0;
  const bodySimilarity = strongestBodyMatch?.score || 0;

  if (!title || !content) failures.push("A title and article body are required.");
  if (words(content) < 900 || words(content) > 1500) failures.push("Article body must contain 900 to 1,500 English words.");
  if (selectedSources.length < Number(config.minIndependentSources || 2) || independentHosts.size < Number(config.minIndependentSources || 2)) {
    failures.push("At least two independent, recorded source URLs are required.");
  }
  const permittedAgeDays = Number(config.fallbackCandidateMaxAgeDays || 7);
  if (selectedSources.some((source) => !validUrl(source.url) || !isRecent(source.publishedAt, permittedAgeDays, now))) {
    failures.push("Each source must have a valid URL and a publication date within the approved primary or fallback freshness window.");
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
      bodySimilarity: Number(bodySimilarity.toFixed(3)),
      strongestBodyMatch: strongestBodyMatch?.article?.slug || strongestBodyMatch?.article?.title || ""
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
    id: id("source", input.url), url: canonicalizeNewsSourceUrl(input.url), publisher: String(input.publisher || "").trim(),
    publisherType: String(input.publisherType || "").trim(), publishedAt: String(input.publishedAt || "").trim(),
    fetchedAt: new Date().toISOString(), rightsNote: String(input.rightsNote || "").trim(),
    trustTier: String(input.trustTier || "").trim(), status: "discovery", createdBy: actor
  };
  if (!validUrl(source.url) || !source.publisher || !source.publishedAt) throw new Error("A valid source URL, publisher and publication date are required.");
  return withDataLock("news-automation-source-queue", async () => {
    const sources = array(await readDataJson(newsAutomationPaths.sources, []));
    const existing = sources.find((item) => newsSourceIdentity(item) === newsSourceIdentity(source));
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

function editorialAngle(sources) {
  const text = sources.map((source) => `${source.title} ${source.publisher}`).join(" ").toLowerCase();
  if (/illegal mining|criminal enterprise|zama zama|nkaneng incident|circumstances surrounding|mineral and petroleum resources/.test(text)) return "mining-governance";
  if (/fuel price|energy|electricity|power supply/.test(text)) return "energy-cost";
  if (/modernisation|automation|digital|technology/.test(text)) return "modernisation";
  if (/recycling|waste|circular|recovery/.test(text)) return "recycling";
  return "material-handling";
}

function articleTitle(sources) {
  const angle = editorialAngle(sources);
  if (angle === "mining-governance") return "Illegal Mining Risks and the Material-Control Questions South African Plants Should Review";
  if (angle === "energy-cost") return "What Current Energy and Fuel Signals Mean for South African Material-Handling Decisions";
  if (angle === "modernisation") return "How South African Mining Modernisation Changes Conveyor-Protection Planning";
  if (angle === "recycling") return "What Current Recycling Developments Mean for Metal-Recovery Planning in South Africa";
  return `What ${sources[0].title} Means for Material Handling Decisions`;
}

function illegalMiningArticleBody(sources, product, now, sourceList) {
  return sanitizePublishedArticleHtml(`
<h2>What the public update establishes</h2>
<p>Recent public statements describe illegal mining as a criminal and economic risk to South Africa's formal mining sector. That is the verified news context for this article. The sources do not identify a COWIN customer, installation or equipment purchase, and they do not establish that magnetic separation alone can address illegal mining. Their practical value for plant teams is narrower: they highlight why traceability, controlled material movement and clearly assigned operating responsibility matter throughout a mineral-handling chain.</p>
<p>For mine, contractor and processing teams, material security is not confined to a boundary fence. Unauthorised extraction or uncontrolled feed can affect what reaches stockpiles, transfer points and processing equipment. Each operation requires its own security, legal and operating controls. Equipment selection should support those controls without being presented as a substitute for law enforcement, access management, sampling, reconciliation or responsible procurement.</p>
<h2>Where material-control questions enter the process</h2>
<p>A useful review starts by mapping custody from the point where material is received or reclaimed to the point where it enters a crusher, screen, plant feed system or final product stream. Teams should identify who authorises each transfer, how unusual loads are isolated, where samples are taken and how discrepancies are recorded. This makes abnormal events visible before they are treated as routine production variation.</p>
<p>The review should distinguish three different issues: unauthorised material, unwanted ferrous objects and normal process variability. A magnetic separator may help remove suitable ferrous contamination at a defined process position, but it cannot verify legal ownership, mineral origin or commercial grade. Metal detection, sampling, weighing, access control and documentary checks solve different parts of the control problem and should not be collapsed into one equipment claim.</p>
<h2>Why tramp-metal risk still needs a separate assessment</h2>
<p>Material from uncontrolled or poorly documented handling can contain tools, wire, fasteners, worn components or other ferrous objects. Similar contamination can also arise in fully authorised operations through maintenance and equipment wear. The source of the object matters for investigation, but separator selection depends on the physical duty: object size and shape, burden depth, conveyor speed, suspension height, material characteristics and the downstream machine that requires protection.</p>
<p>Plant teams should therefore keep an event record rather than assuming every captured item has the same origin. Photographs, approximate dimensions, discovery position and operating conditions can help maintenance and security teams identify patterns. The record can also improve later equipment reviews by replacing general statements such as "heavy contamination" with observable information.</p>
<h2>How a magnetic equipment review fits</h2>
<p>${product.name} is one equipment family that may be considered for a conveyor-protection duty when its verified configuration matches the process. It is not a security system and it is not evidence that material is lawful or saleable. COWIN engineering would still need the actual conveyor, burden, contamination, installation and environmental data before confirming a project configuration.</p>
<p>The cleaning arrangement must match the expected operating pattern. A self-cleaning system may be reviewed where captured ferrous material must be discharged without routine production stops and where a safe discharge route exists. A manual-cleaning arrangement serves a different duty. Permanent and electromagnetic systems also have different installation, power, control and maintenance considerations; those attributes must remain separated in the selected product record and quotation.</p>
<h2>Information to collect before selecting equipment</h2>
<ul><li>Conveyor width, belt speed, maximum burden depth and the proposed separator position.</li><li>Material type, particle-size range, moisture, temperature and bulk behaviour.</li><li>Observed ferrous objects, including approximate size, shape, frequency and where they were found.</li><li>The crusher, screen, mill or product stream that requires protection.</li><li>Available suspension height, structural support, discharge space and maintenance access.</li><li>Required cleaning method and the safe route for collected material.</li><li>Outdoor exposure, dust, corrosion, altitude and electrical supply where relevant.</li><li>The site's own custody, incident-reporting and isolation procedures for unusual material.</li></ul>
<h2>Operational controls around the installation</h2>
<p>An installation review should consider guarding, isolation, inspection access and ownership of collected material. The plant should define who may inspect the separator, who records recovered objects and where those objects are transferred. If an item may be relevant to a security or safety investigation, it should be handled under the site's approved procedure rather than discarded through an informal route.</p>
<p>Nearby steelwork and the material trajectory should be checked before finalising the position. A dimensioned layout and clear site photographs are more useful than conveyor width alone. The discharge path must not create a new hazard, obstruct a walkway or return captured objects to the process. These are project-specific engineering questions, not conclusions that can be drawn from a national industry statement.</p>
<h2>An illustrative decision path</h2>
<p><strong>Illustrative scenario, not a customer case:</strong> a plant records irregular ferrous objects in feed from more than one handling route. Security staff review custody records while operations map the conveyor positions where contamination becomes visible. Maintenance measures the conveyor, burden and available height, then documents the downstream equipment at risk. The team separately evaluates access controls, sampling and a suitable tramp-metal removal configuration. This approach avoids claiming that one machine solves a broader illegal-mining problem.</p>
<h2>Questions plant teams may ask</h2>
<h3>Can a magnetic separator identify illegally mined material?</h3><p>No. It can remove suitable ferrous contamination when correctly selected and installed. It cannot determine legal origin, ownership or mineral grade.</p>
<h3>Does this article describe a COWIN project in South Africa?</h3><p>No. It is an independent engineering interpretation of public information and does not claim a local customer, installation, office or stockholding.</p>
<h3>Can equipment be selected from belt width alone?</h3><p>No. Burden depth, belt speed, suspension height, material, contamination, installation geometry, cleaning requirements and downstream risk must also be reviewed.</p>
<h3>What should be recorded after ferrous material is captured?</h3><p>Follow the site's approved procedure. Useful operational details can include time, process position, approximate dimensions, photographs and the route or feed condition associated with the event.</p>
<h2>Key takeaways</h2>
<ul><li>Illegal-mining risk, material custody and tramp-metal removal are related operational concerns but not the same problem.</li><li>Magnetic equipment cannot establish ownership, legality or mineral grade.</li><li>Selection requires verified process and installation data rather than broad industry assumptions.</li><li>Captured-material records can support maintenance learning and the site's established security procedures.</li></ul>
<h2>Sources and methodology</h2><p>This article is an original engineering analysis of current public-source metadata. Facts attributed to the source are separated from COWIN's process-selection commentary. It does not reproduce source articles, infer a purchase or provide legal conclusions.</p><ul>${sourceList}</ul>
<p>Sources were accessed ${now.toLocaleDateString("en-ZA", { dateStyle: "long", timeZone: "UTC" })}. This is an independent editorial summary and not a statement by the source publishers.</p>`);
}

function articleBody(sources, product, now) {
  const sourceList = sources.map((source) => `<li><a href="${source.url}" rel="nofollow noopener noreferrer" target="_blank">${source.publisher}: ${source.title}</a>, published ${new Date(source.publishedAt).toLocaleDateString("en-ZA", { dateStyle: "long", timeZone: "UTC" })}.</li>`).join("");
  if (editorialAngle(sources) === "mining-governance") return illegalMiningArticleBody(sources, product, now, sourceList);
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

function candidatePreference(candidate) {
  if (candidate.status === "used") return 4;
  if (candidate.status === "candidate") return 3;
  if (candidate.status === "retry_wait") return 2;
  return 1;
}

export function normalizeNewsCandidates(candidates = []) {
  const normalized = new Map();
  for (const input of array(candidates)) {
    const url = canonicalizeNewsSourceUrl(input.url);
    if (!url) continue;
    const candidate = { ...input, url };
    const fingerprint = candidateFingerprint(candidate);
    candidate.fingerprint = fingerprint;
    candidate.id = candidate.id || `candidate_${fingerprint.slice(0, 16)}`;
    const existing = normalized.get(fingerprint);
    if (!existing) {
      normalized.set(fingerprint, candidate);
      continue;
    }
    const candidateWins = candidatePreference(candidate) > candidatePreference(existing) ||
      (candidatePreference(candidate) === candidatePreference(existing) && new Date(candidate.updated_at || candidate.discovered_at || 0) > new Date(existing.updated_at || existing.discovered_at || 0));
    const winner = candidateWins ? candidate : existing;
    const loser = candidateWins ? existing : candidate;
    normalized.set(fingerprint, {
      ...loser,
      ...winner,
      duplicate_urls: [...new Set([...(array(existing.duplicate_urls)), ...(array(candidate.duplicate_urls)), existing.url, candidate.url])]
    });
  }
  return [...normalized.values()];
}

function candidateIsAvailable(candidate, now) {
  if (candidate.status === "candidate") return true;
  if (candidate.status !== "retry_wait") return false;
  const retryAfter = new Date(candidate.retry_after || 0);
  return Number.isNaN(retryAfter.valueOf()) || retryAfter <= now;
}

export function rankNewsCandidates({ candidates = [], articles = [], config = defaultNewsAutomationConfig, now = new Date() } = {}) {
  const primaryWindow = Number(config.candidateMaxAgeHours || 72) * 3600000;
  const fallbackWindow = Number(config.fallbackCandidateMaxAgeDays || 7) * DAY;
  const usedUrls = new Set(array(articles).flatMap((article) => {
    const urls = array(article.source_urls);
    return urls.length ? urls : [article.source_url].filter(Boolean);
  }).map(canonicalizeNewsSourceUrl));
  return normalizeNewsCandidates(candidates)
    .filter((candidate) => candidate.site_id === config.siteId && candidateIsAvailable(candidate, now))
    .filter((candidate) => !usedUrls.has(canonicalizeNewsSourceUrl(candidate.url)))
    .filter((candidate) => {
      const publishedAt = new Date(candidate.publishedAt);
      return !Number.isNaN(publishedAt.valueOf()) && publishedAt <= now && now - publishedAt <= fallbackWindow;
    })
    .sort((left, right) => {
      const leftAge = now - new Date(left.publishedAt);
      const rightAge = now - new Date(right.publishedAt);
      const leftPrimary = leftAge <= primaryWindow ? 1 : 0;
      const rightPrimary = rightAge <= primaryWindow ? 1 : 0;
      return rightPrimary - leftPrimary ||
        new Date(right.publishedAt) - new Date(left.publishedAt) ||
        Number(right.score || 0) - Number(left.score || 0);
    });
}

function pairKey(sources, generatorVersion = 3) {
  const identities = sources.map(newsSourceIdentity).sort();
  return `g${generatorVersion}:${crypto.createHash("sha256").update(identities.join("|")).digest("hex").slice(0, 20)}`;
}

function buildCandidatePairs(candidates, runs, config) {
  const generatorVersion = 3;
  const failures = new Map();
  for (const run of array(runs)) {
    if (run.result !== "skipped_quality_gate" || Number(run.generatorVersion || 0) !== generatorVersion || !run.pairKey) continue;
    failures.set(run.pairKey, (failures.get(run.pairKey) || 0) + 1);
  }
  const pairs = [];
  const seen = new Set();
  const addPairs = (rows, coherent) => {
    for (let left = 0; left < rows.length; left += 1) {
      for (let right = left + 1; right < rows.length; right += 1) {
        const pair = [rows[left], rows[right]];
        if (host(pair[0].url) === host(pair[1].url)) continue;
        const key = pairKey(pair, generatorVersion);
        if (seen.has(key) || (failures.get(key) || 0) >= Number(config.maxRetries || 2)) continue;
        seen.add(key);
        pairs.push({ sources: pair, pairKey: key, coherent });
      }
    }
  };
  const byAngle = new Map();
  for (const candidate of candidates) {
    const angle = classifyNewsAngle([candidate]);
    byAngle.set(angle, [...(byAngle.get(angle) || []), candidate]);
  }
  for (const group of byAngle.values()) addPairs(group, true);
  addPairs(candidates.slice(0, 16), false);
  return pairs.sort((left, right) => Number(right.coherent) - Number(left.coherent)).slice(0, Number(config.maxAttemptsPerRun || 6));
}

export async function runNewsIngest(trigger = "cron", options = {}) {
  return withDataLock("news-automation-ingest", async () => {
    const now = options.now ? new Date(options.now) : new Date();
    const data = await loadAutomationData();
    const maxAgeHours = Number(data.config.candidateMaxAgeHours || 72);
    const fallbackMaxAgeDays = Number(data.config.fallbackCandidateMaxAgeDays || 7);
    const discovery = await discoverNewsSources({ fetchImpl: options.fetchImpl || fetch, now, maxAgeDays: fallbackMaxAgeDays, includeDiagnostics: true });
    const discovered = discovery.items;
    const usedUrls = new Set(data.articles.filter((article) => article.article_type === "news").flatMap((article) => {
      const urls = array(article.source_urls);
      return urls.length ? urls : [article.source_url].filter(Boolean);
    }).map(canonicalizeNewsSourceUrl));
    const before = normalizeNewsCandidates(data.candidates);
    const existing = new Map(before.map((candidate) => [candidateFingerprint(candidate), candidate]));
    const candidates = [...before];
    let added = 0;
    for (const source of discovered) {
      const fingerprint = candidateFingerprint(source);
      if (usedUrls.has(canonicalizeNewsSourceUrl(source.url)) || existing.has(fingerprint)) continue;
      const ageHours = (now - new Date(source.publishedAt)) / 3600000;
      if (ageHours < 0 || ageHours > fallbackMaxAgeDays * 24) continue;
      const candidate = {
        ...source, id: `candidate_${fingerprint.slice(0, 16)}`, fingerprint, site_id: data.config.siteId,
        status: "candidate", score: Math.min(100, 55 + Number(source.score || 0) * 10 + (source.trustTier === "primary" ? 20 : 0)),
        freshness_tier: ageHours <= maxAgeHours ? "primary" : "fallback",
        discovered_at: now.toISOString(), updated_at: now.toISOString(), reject_reason: ""
      };
      candidates.unshift(candidate);
      existing.set(fingerprint, candidate);
      added += 1;
    }
    const normalized = normalizeNewsCandidates(candidates).slice(0, 500);
    const poolChanged = JSON.stringify(normalized) !== JSON.stringify(data.candidates);
    const run = { id: id("ingest", trigger), site_id: data.config.siteId, trigger, startedAt: now.toISOString(), finishedAt: new Date().toISOString(), result: "ingested", discovered: discovered.length, added, candidates: normalized.filter((item) => candidateIsAvailable(item, now)).length, poolChanged, sourceHealth: discovery.diagnostics };
    if (!options.dryRun) {
      const writes = [writeDataJson(newsAutomationPaths.runs, [run, ...data.runs].slice(0, 200))];
      if (poolChanged) writes.push(writeDataJson(newsAutomationPaths.candidates, normalized));
      await Promise.all(writes);
    }
    return { result: "ingested", run, discovered: discovered.length, added, candidates: run.candidates, poolChanged };
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
    const ranked = rankNewsCandidates({ candidates: data.candidates, articles: data.articles, config: data.config, now });
    const independentHosts = new Set(ranked.map((candidate) => host(candidate.url)).filter(Boolean));
    const pairs = buildCandidatePairs(ranked, data.runs, data.config);
    if (ranked.length < data.config.minIndependentSources || independentHosts.size < data.config.minIndependentSources || !pairs.length) {
      const reason = `Fewer than ${data.config.minIndependentSources} unused independent verified sources were available.`;
      const run = {
        id: id("run", trigger),
        site_id: data.config.siteId,
        trigger,
        startedAt: now.toISOString(),
        finishedAt: new Date().toISOString(),
        result: "skipped_no_qualified_source",
        reason,
        availableCandidateCount: ranked.length,
        independentCandidateCount: independentHosts.size,
        generatorVersion: 3,
        retryCount: 0
      };
      if (!options.dryRun) {
        await writeDataJson(newsAutomationPaths.runs, [run, ...data.runs].slice(0, 200));
      }
      return { result: "skipped_no_qualified_source", reason, availableCandidateCount: ranked.length, independentCandidateCount: independentHosts.size };
    }
    const product = data.products.find((item) => item.slug === "permanent-overband-magnetic-separator") || data.products[0];
    if (!product) throw new Error("No verified COWIN product record is available for News publication.");
    const recentArticles = data.articles.filter((article) => article.status === "published" && new Date(article.published_at || article.date || 0) >= new Date(now.valueOf() - 180 * DAY));
    const attempts = [];
    let accepted = null;
    for (const pair of pairs) {
      const sourceRecords = pair.sources.map((source) => ({
        ...source,
        url: canonicalizeNewsSourceUrl(source.url),
        id: `source_${crypto.createHash("sha256").update(newsSourceIdentity(source)).digest("hex").slice(0, 16)}`,
        status: "verified"
      }));
      for (let variant = 0; variant < Number(data.config.maxDraftVariantsPerPair || 3); variant += 1) {
        const generated = buildNewsArticleDraft({ sources: sourceRecords, product, now, variant });
        const draft = {
          id: id("draft", `${generated.title}:${variant}`),
          title: generated.title,
          content: generated.content,
          sourceIds: sourceRecords.map((source) => source.id),
          productSlugs: [product.slug],
          imageUrls: [product.image],
          angle: generated.angle,
          generatorVersion: 3,
          variant
        };
        const qa = evaluateNewsDraft({ draft, sources: [...sourceRecords, ...data.sources], products: data.products, recentArticles, config: data.config, now });
        attempts.push({ pairKey: pair.pairKey, coherent: pair.coherent, variant, title: generated.title, sourceUrls: sourceRecords.map((source) => source.url), qa: qa.metrics, failures: qa.failures });
        if (qa.passed) {
          accepted = { pair, sourceRecords, generated, draft, qa };
          break;
        }
      }
      if (accepted) break;
    }

    if (!accepted) {
      const attemptedIds = new Set(pairs.flatMap((pair) => pair.sources.map((source) => source.id)));
      const backoff = Number(data.config.retryBackoffHours || 24) * 3600000;
      const updatedCandidates = normalizeNewsCandidates(data.candidates).map((candidate) => {
        if (!attemptedIds.has(candidate.id) || candidate.status === "used") return candidate;
        const retryCount = Number(candidate.retry_count || 0) + 1;
        return {
          ...candidate,
          status: retryCount >= Number(data.config.maxRetries || 2) ? "rejected" : "retry_wait",
          retry_count: retryCount,
          retry_after: new Date(now.valueOf() + backoff).toISOString(),
          reject_reason: "All generated variants failed the News quality gate.",
          updated_at: now.toISOString()
        };
      });
      const best = attempts.sort((left, right) => Number(left.qa?.bodySimilarity || 1) - Number(right.qa?.bodySimilarity || 1))[0];
      const reason = best ? `News quality gate rejected all ${attempts.length} attempted drafts; lowest body similarity was ${best.qa.bodySimilarity}.` : "News quality gate rejected all attempted drafts.";
      const run = {
        id: id("run", trigger), site_id: data.config.siteId, trigger,
        startedAt: now.toISOString(), finishedAt: new Date().toISOString(),
        result: "skipped_quality_gate", reason, qa: best?.qa || null,
        sourceUrls: best?.sourceUrls || [], pairKey: best?.pairKey || null,
        generatorVersion: 3, retryCount: 0, attempts
      };
      if (!options.dryRun) await Promise.all([
        writeDataJson(newsAutomationPaths.candidates, updatedCandidates),
        writeDataJson(newsAutomationPaths.runs, [run, ...data.runs].slice(0, 200))
      ]);
      return { result: "skipped_quality_gate", reason, qa: best?.qa || null, attempts };
    }

    const { pair, sourceRecords, generated, draft, qa } = accepted;
    const runId = id("run", trigger);
    const article = {
      slug: `${slugify(generated.title)}-${now.toISOString().slice(0, 10)}`, title: generated.title,
      summary: generated.summary, excerpt: generated.excerpt,
      content: generated.content, status: "published", article_type: "news", category: "Mining & Mineral Processing",
      published_at: now.toISOString(), updated_at: now.toISOString(), author_name: "Cowin Magnet South Africa Editorial Team",
      source_url: sourceRecords[0].url, source_urls: sourceRecords.map((source) => source.url), source_title: sourceRecords[0].title,
      source_publisher: sourceRecords[0].publisher, source_published_at: sourceRecords[0].publishedAt, source_fetched_at: now.toISOString(),
      cover_image_url: product.image, cover_image_alt: `${product.name} for conveyor protection review`, cover_image_caption: "COWIN product image; final configuration is project-specific.",
      image_rights: "COWIN owned product media", related_products: [{ name: product.name, category: product.category, image: product.image, url: product.canonicalUrl || `/en-za/products/${product.categorySlug}/${product.slug}/`, relationship_reason: "Relevant to conveyor protection configuration reviews." }],
      editorial_method: "automated-source-based-quality-gate-v3", publication_run_id: runId, automation_published_at: now.toISOString(), generator_version: 3
    };
    const run = {
      id: runId,
      site_id: data.config.siteId,
      trigger,
      startedAt: now.toISOString(),
      finishedAt: new Date().toISOString(),
      result: "pending_frontend_verification",
      articleSlug: article.slug,
      sourceUrls: article.source_urls,
      qa: qa.metrics,
      pairKey: pair.pairKey,
      generatorVersion: 3,
      attempts,
      retryCount: 0,
      delivery: { status: "pending", checkedAt: null, checks: [] }
    };
    if (options.dryRun) return { result: "dry_run", article, run, qa };
    await Promise.all([
      writeDataJson(newsAutomationPaths.sources, [...sourceRecords, ...data.sources.filter((item) => !sourceRecords.some((source) => source.id === item.id))]),
      writeDataJson(newsAutomationPaths.candidates, normalizeNewsCandidates(data.candidates).map((candidate) => sourceRecords.some((source) => newsSourceIdentity(source) === newsSourceIdentity(candidate)) ? { ...candidate, status: "used", used_at: now.toISOString(), article_slug: article.slug, retry_count: 0, retry_after: null, reject_reason: "" } : candidate)),
      writeDataJson(newsAutomationPaths.drafts, [{ ...draft, status: "published", qa }, ...data.drafts]),
      writeDataJson(newsAutomationPaths.runs, [run, ...data.runs].slice(0, 200)),
      writeDataJson("data/articles/articles.json", [article, ...data.articles])
    ]);
    return { result: "published", article, run, qa };
  });
}

export async function recordNewsDeliveryCheck(input = {}) {
  const runId = String(input.runId || "");
  if (!runId) throw new Error("A publication run ID is required.");
  const checkedAt = input.checkedAt || new Date().toISOString();
  const passed = input.passed === true;
  const checks = array(input.checks);
  return withDataLock("news-automation-delivery-check", async () => {
    const runs = array(await readDataJson(newsAutomationPaths.runs, []));
    let matched = false;
    const updated = runs.map((run) => {
      if (run.id !== runId) return run;
      matched = true;
      return {
        ...run,
        result: passed ? "published_success" : "pending_frontend_verification",
        retryCount: passed ? Number(run.retryCount || 0) : Number(run.retryCount || 0) + 1,
        delivery: {
          status: passed ? "verified" : "retry_pending",
          checkedAt,
          checks
        },
        updatedAt: checkedAt
      };
    });
    if (!matched) throw new Error("Publication run was not found.");
    await writeDataJson(newsAutomationPaths.runs, updated);
    return updated.find((run) => run.id === runId);
  });
}

export function validateNewsAutomationState(value) {
  return VALID_STATES.has(String(value || ""));
}
