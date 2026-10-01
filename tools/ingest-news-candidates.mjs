process.env.NEWS_AUTOPUBLISH_ENABLED ??= "false";
process.env.NEWS_AUTOPUBLISH_MODE = "production";

const { runNewsIngest } = await import("../app/lib/news-automation.js");
const result = await runNewsIngest("github-actions-ingest", { dryRun: process.argv.includes("--dry-run") });
console.log(JSON.stringify(result, null, 2));
