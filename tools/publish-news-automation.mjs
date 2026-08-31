import { appendFile } from "node:fs/promises";

process.env.NEWS_AUTOPUBLISH_ENABLED = "true";
process.env.NEWS_AUTOPUBLISH_MODE = "production";

const { runNewsAutomation } = await import("../app/lib/news-automation.js");
const result = await runNewsAutomation("github-actions", {
  force: process.argv.includes("--force"),
  dryRun: process.argv.includes("--dry-run")
});
const summary = {
  result: result.result,
  title: result.article?.title ?? result.title ?? null,
  slug: result.article?.slug ?? null,
  qa: result.qa?.metrics ?? result.qa ?? null,
  reason: result.reason ?? null,
  nextEligibleAt: result.nextEligibleAt ?? null,
  attemptCount: result.attempts?.length ?? 0
};
console.log(JSON.stringify(summary, null, 2));

if (process.env.GITHUB_OUTPUT) {
  await appendFile(process.env.GITHUB_OUTPUT, [
    `result=${summary.result}`,
    `published=${summary.result === "published"}`,
    `slug=${summary.slug || ""}`,
    `title=${String(summary.title || "").replace(/[\r\n]+/g, " ")}`
  ].join("\n") + "\n", "utf8");
}

const blockedResults = new Set(["skipped_quality_gate", "skipped_no_qualified_source"]);
if (process.argv.includes("--strict") && blockedResults.has(result.result)) process.exitCode = 2;
