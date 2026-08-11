process.env.NEWS_AUTOPUBLISH_ENABLED = "true";
process.env.NEWS_AUTOPUBLISH_MODE = "production";

const { runNewsAutomation } = await import("../app/lib/news-automation.js");
const result = await runNewsAutomation("github-actions", {
  force: process.argv.includes("--force"),
  dryRun: process.argv.includes("--dry-run")
});
console.log(JSON.stringify({ result: result.result, title: result.article?.title, slug: result.article?.slug, qa: result.qa?.metrics, nextEligibleAt: result.nextEligibleAt }, null, 2));
