import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Client } from "pg";

const documentPath = "data/articles/articles.json";
const replacements = new Map([
  ["suspension-height-magnetic-separator-performance-africa", "/assets/images/source-products/suspended-permanent-magnetic-separator.webp"],
  ["magnetic-separator-selection-coal-conveyor-systems-africa", "/assets/images/source-products/permanent-overband-magnetic-separator.jpg"],
  ["webhook-blog-publishing-verification-2026-08-06-1126", "/assets/images/hero-mining-conveyor-magnet.webp"],
  ["webhook-blog-publishing-verification-2026-08-06-1120", "/assets/images/hero-mining-conveyor-magnet.webp"]
]);

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query("BEGIN");
  const record = await client.query("SELECT payload, updated_at FROM africa_json_documents WHERE path = $1 FOR UPDATE", [documentPath]);
  if (record.rowCount !== 1) throw new Error("Article document was not found");
  const articles = record.rows[0].payload;
  const affected = articles.filter((article) => replacements.has(article.slug));
  if (affected.length !== replacements.size) throw new Error("Expected external-cover article records were not all found");

  const backupDir = join(process.cwd(), ".audit-backups", `external-article-covers-${new Date().toISOString().replace(/[:.]/g, "-")}`);
  await mkdir(backupDir, { recursive: true });
  await writeFile(join(backupDir, "articles-before-cover-replacement.json"), `${JSON.stringify({ path: documentPath, updatedAt: record.rows[0].updated_at, articles: affected }, null, 2)}\n`);

  const changedAt = new Date().toISOString();
  const updated = articles.map((article) => {
    const replacement = replacements.get(article.slug);
    if (!replacement) return article;
    const updatedArticle = {
      ...article,
      image_url: replacement,
      cover_image_url: replacement,
      image: replacement,
      mediaRightsNote: "COWIN-owned website asset",
      updated_at: changedAt
    };
    return updatedArticle;
  });
  const externalAfter = updated.filter((article) => replacements.has(article.slug) && /^https?:\/\//i.test(String(article.image_url || article.cover_image_url || article.image || "")));
  if (externalAfter.length) throw new Error("An external cover image would remain after replacement");

  await client.query("UPDATE africa_json_documents SET payload = $2::jsonb, updated_at = NOW() WHERE path = $1", [documentPath, JSON.stringify(updated)]);
  await client.query("COMMIT");
  console.log(JSON.stringify({ updated: affected.map((article) => article.slug), backupDir, verification: "replaced published external article covers with COWIN-owned website assets" }, null, 2));
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  await client.end();
}
