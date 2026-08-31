import { readDataJson } from "../app/lib/news-system.js";

const [config, articles, candidates, runs] = await Promise.all([
  readDataJson("data/news-automation/config.json", {}),
  readDataJson("data/articles/articles.json", []),
  readDataJson("data/news-automation/candidates.json", []),
  readDataJson("data/news-automation/publication-runs.json", [])
]);

const now = new Date();
const published = articles
  .filter((article) => article.status === "published" && article.article_type === "news")
  .sort((left, right) => new Date(right.published_at || right.date || 0) - new Date(left.published_at || left.date || 0));
const latest = published[0] || null;
const latestAt = latest ? new Date(latest.published_at || latest.date || 0) : null;
const staleHours = latestAt && !Number.isNaN(latestAt.valueOf()) ? (now - latestAt) / 3600000 : Number.POSITIVE_INFINITY;
const slaHours = Number(config.publicationSlaHours || 60);
const firstSuccessIndex = runs.findIndex((run) => ["published", "published_success", "pending_frontend_verification"].includes(run.result));
const consecutiveBlocks = firstSuccessIndex === -1 ? runs.length : firstSuccessIndex;
const availableCandidates = candidates.filter((candidate) => ["candidate", "retry_wait"].includes(candidate.status)).length;
const reasons = [];

if (staleHours > slaHours) reasons.push(`Last published News article is ${staleHours.toFixed(1)} hours old; SLA is ${slaHours} hours.`);
if (consecutiveBlocks >= 2) reasons.push(`${consecutiveBlocks} consecutive automation records occurred without a publication.`);
if (!availableCandidates) reasons.push("No candidate or retry-wait News sources are available.");

const summary = {
  healthy: reasons.length === 0,
  checkedAt: now.toISOString(),
  latestPublishedAt: latestAt && !Number.isNaN(latestAt.valueOf()) ? latestAt.toISOString() : null,
  latestSlug: latest?.slug || null,
  staleHours: Number.isFinite(staleHours) ? Number(staleHours.toFixed(1)) : null,
  slaHours,
  availableCandidates,
  consecutiveBlocks,
  reasons
};

console.log(JSON.stringify(summary, null, 2));
if (process.env.GITHUB_STEP_SUMMARY) {
  const lines = [
    "## News automation health",
    "",
    `- Healthy: ${summary.healthy ? "yes" : "no"}`,
    `- Latest published slug: ${summary.latestSlug || "none"}`,
    `- Hours since publication: ${summary.staleHours ?? "unknown"}`,
    `- Available candidates: ${summary.availableCandidates}`,
    ...summary.reasons.map((reason) => `- Blocker: ${reason}`),
    ""
  ];
  const { appendFile } = await import("node:fs/promises");
  await appendFile(process.env.GITHUB_STEP_SUMMARY, lines.join("\n"), "utf8");
}
if (process.argv.includes("--strict") && !summary.healthy) process.exitCode = 3;
