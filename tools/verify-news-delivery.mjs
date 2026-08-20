import { readDataJson } from "../app/lib/news-system.js";
import { recordNewsDeliveryCheck } from "../app/lib/news-automation.js";

const siteUrl = (process.env.SITE_URL || "https://cowinmagnet.co.za").replace(/\/$/, "");
const runs = await readDataJson("data/news-automation/publication-runs.json", []);
const pending = runs.filter((run) => run.result === "pending_frontend_verification").slice(0, 3);

async function request(path) {
  const response = await fetch(`${siteUrl}${path}`, {
    headers: { "user-agent": "Cowinmagnet-NewsDeliveryVerifier/1.0" },
    redirect: "follow"
  });
  return { status: response.status, body: await response.text() };
}

let failures = 0;
for (const run of pending) {
  const slug = encodeURIComponent(run.articleSlug);
  const list = await request("/en-za/news/");
  const detail = await request(`/en-za/news/${slug}/`);
  const sitemap = await request("/news-sitemap.xml");
  const checks = [
    { name: "news-list", passed: list.status === 200 && list.body.includes(run.articleSlug), status: list.status },
    { name: "news-detail", passed: detail.status === 200 && detail.body.includes("canonical") && detail.body.includes(run.articleSlug), status: detail.status },
    { name: "news-sitemap", passed: sitemap.status === 200 && sitemap.body.includes(run.articleSlug), status: sitemap.status }
  ];
  const passed = checks.every((check) => check.passed);
  await recordNewsDeliveryCheck({ runId: run.id, passed, checks });
  console.log(JSON.stringify({ runId: run.id, articleSlug: run.articleSlug, passed, checks }));
  if (!passed) failures += 1;
}

if (!pending.length) console.log(JSON.stringify({ result: "no_pending_frontend_verification" }));
if (failures) process.exitCode = 1;
