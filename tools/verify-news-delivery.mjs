import { readDataJson } from "../app/lib/news-system.js";
import { recordNewsDeliveryCheck } from "../app/lib/news-automation.js";

const siteUrl = (process.env.SITE_URL || "https://cowinmagnet.co.za").replace(/\/$/, "");
const argument = (name) => {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
};
const explicitSlug = argument("slug");
const waitSeconds = Math.max(0, Number(argument("wait-seconds") || 0));
const intervalSeconds = Math.max(2, Number(argument("interval-seconds") || 15));
const shouldRecord = process.argv.includes("--record");
const runs = await readDataJson("data/news-automation/publication-runs.json", []);
const pending = explicitSlug
  ? [runs.find((run) => run.articleSlug === explicitSlug) || { id: "explicit", articleSlug: explicitSlug }]
  : runs.filter((run) => run.result === "pending_frontend_verification").slice(0, 3);

async function request(path) {
  try {
    const response = await fetch(`${siteUrl}${path}`, {
      cache: "no-store",
      headers: { "user-agent": "Cowinmagnet-NewsDeliveryVerifier/2.0" },
      redirect: "follow"
    });
    return { status: response.status, body: await response.text(), error: null };
  } catch (error) {
    return { status: 0, body: "", error: error instanceof Error ? error.message : String(error) };
  }
}

async function inspect(slug) {
  const encodedSlug = encodeURIComponent(slug);
  const [list, detail, sitemap, rss] = await Promise.all([
    request("/en-za/news/"),
    request(`/en-za/news/${encodedSlug}/`),
    request("/news-sitemap.xml"),
    request("/en-za/news/feed.xml")
  ]);
  return [
    { name: "news-list", passed: list.status === 200 && list.body.includes(slug), status: list.status, error: list.error },
    { name: "news-detail", passed: detail.status === 200 && detail.body.includes("canonical") && detail.body.includes(slug), status: detail.status, error: detail.error },
    { name: "news-sitemap", passed: sitemap.status === 200 && sitemap.body.includes(slug), status: sitemap.status, error: sitemap.error },
    { name: "news-rss", passed: rss.status === 200 && rss.body.includes(slug), status: rss.status, error: rss.error }
  ];
}

async function waitForDelivery(slug) {
  const deadline = Date.now() + waitSeconds * 1000;
  let checks;
  do {
    checks = await inspect(slug);
    if (checks.every((check) => check.passed) || Date.now() >= deadline) return checks;
    await new Promise((resolve) => setTimeout(resolve, intervalSeconds * 1000));
  } while (Date.now() <= deadline);
  return checks;
}

let failures = 0;
for (const run of pending) {
  const checks = await waitForDelivery(run.articleSlug);
  const passed = checks.every((check) => check.passed);
  if (shouldRecord && run.id !== "explicit") {
    await recordNewsDeliveryCheck({ runId: run.id, passed, checks });
  }
  const result = { runId: run.id, articleSlug: run.articleSlug, passed, checks };
  console.log(JSON.stringify(result));
  if (process.env.GITHUB_STEP_SUMMARY) {
    const { appendFile } = await import("node:fs/promises");
    const lines = checks.map((check) => `- ${check.passed ? "✅" : "❌"} ${check.name}: HTTP ${check.status}`).join("\n");
    await appendFile(process.env.GITHUB_STEP_SUMMARY, `## News delivery: ${run.articleSlug}\n\n${lines}\n\n`);
  }
  if (!passed) failures += 1;
}

if (!pending.length) {
  console.log(JSON.stringify({ result: "no_pending_frontend_verification" }));
  if (process.argv.includes("--require-pending")) failures += 1;
}
if (failures) process.exitCode = 1;
