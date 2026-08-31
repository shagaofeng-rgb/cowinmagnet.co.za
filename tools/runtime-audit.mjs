import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import pg from "pg";

const root = process.cwd();
const readJson = async (relativePath, fallback) => {
  try { return JSON.parse((await readFile(resolve(root, relativePath), "utf8")).replace(/^\uFEFF/, "")); } catch { return fallback; }
};
const timestamp = new Date().toISOString();
const vercel = await readJson("vercel.json", {});
const products = await readJson("data/products/products.json", []);
const articles = await readJson("data/articles/articles.json", []);
const newsConfig = await readJson("data/news-automation/config.json", {});
const report = {
  generatedAt: timestamp,
  scope: "repository configuration and production database metadata only",
  services: [
    { name: "Next.js application", trigger: "Vercel deployment", status: "verified by production build" },
    { name: "Google SEO sitemap submission", trigger: "Vercel Cron", frequency: "every 3 days", route: "/api/cron/google-seo" },
    { name: "Google Search Console inspection", trigger: "Vercel Cron", frequency: "every 3 days", route: "/api/cron/gsc-inspection" },
    { name: "News quality-gate run", trigger: "GitHub Actions schedule", frequency: "daily trigger with a 48-hour publication gate", route: ".github/workflows/news-autopublish.yml", status: newsConfig.enabled ? "configured" : "configured but disabled" }
  ],
  crons: vercel.crons || [],
  data: {
    products: { total: products.length, verifiedTruthCards: products.filter((item) => ["verified", "synced-from-main-site"].includes(item.truthCardStatus)).length, pendingEngineeringReview: products.filter((item) => item.truthCardStatus === "needs-engineering-review").length },
    articles: { total: articles.length, published: articles.filter((item) => (item.status || "published") === "published").length, news: articles.filter((item) => item.article_type === "news").length, blog: articles.filter((item) => item.article_type === "blog").length },
    newsAutomation: { enabledInRepository: newsConfig.enabled === true, mode: newsConfig.mode || "unknown", requiredPreproductionApprovals: newsConfig.requiredPreproductionApprovals ?? 6 }
  },
  database: { checked: false, status: "DATABASE_URL unavailable" },
  limitations: [
    "This report does not claim operating-system process, Vercel runtime log, CDN, or Search Console status without their respective credentials or console access.",
    newsConfig.enabled === true
      ? "News publication is enabled and remains subject to the configured source, quality, duplication and delivery gates."
      : "News publication is disabled in repository configuration."
  ]
};

if (process.env.DATABASE_URL) {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  try {
    await client.connect();
    const table = await client.query("SELECT to_regclass('public.africa_json_documents') AS table_name");
    const documents = table.rows[0]?.table_name
      ? await client.query("SELECT path, updated_at FROM africa_json_documents ORDER BY updated_at DESC LIMIT 100")
      : { rows: [] };
    const contentSnapshots = table.rows[0]?.table_name
      ? await client.query("SELECT path, payload, updated_at FROM africa_json_documents WHERE path IN ('data/articles/articles.json', 'data/products/products.json')")
      : { rows: [] };
    const snapshotSummary = Object.fromEntries(contentSnapshots.rows.map((row) => [
      row.path,
      { recordCount: Array.isArray(row.payload) ? row.payload.length : null, updatedAt: row.updated_at }
    ]));
    report.database = {
      checked: true,
      status: table.rows[0]?.table_name ? "connected" : "table missing",
      table: table.rows[0]?.table_name || null,
      documentCountSample: documents.rows.length,
      contentSnapshots: snapshotSummary,
      newestDocuments: documents.rows.slice(0, 10).map((row) => ({ path: row.path, updatedAt: row.updated_at }))
    };
  } catch (error) {
    report.database = { checked: true, status: "connection failed", error: error?.message || String(error) };
  } finally {
    await client.end().catch(() => {});
  }
}

await writeFile(resolve(root, "reports/runtime-audit.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ output: "reports/runtime-audit.json", database: report.database.status, crons: report.crons.length }));
