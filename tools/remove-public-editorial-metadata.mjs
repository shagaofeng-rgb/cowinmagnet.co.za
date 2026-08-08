import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Client } from "pg";
import { stripInternalEditorialBlocks } from "../app/lib/news-system.js";

const documentPath = "data/articles/articles.json";
const backupDir = join(process.cwd(), ".audit-backups", `editorial-metadata-${new Date().toISOString().replace(/[:.]/g, "-")}`);
const editorialMetadataPattern = /(?:seo\s*meta|seo\s*title|meta\s*description|url\s*slug|primary\s*keyword|secondary\s*keywords|search\s*intent|target\s*country|target\s*buyer|suggested\s*cta|ai\s*citation\s*ready\s*summary|internal\s*linking\s*suggestions|cms(?:\s+publishing)?\s*checklist|json-ld\s*schema)/i;
const repairedArticleSlugs = new Set([
  "suspension-height-magnetic-separator-performance-africa",
  "magnetic-separator-selection-coal-conveyor-systems-africa",
  "conveyor-belt-magnetic-separators-south-african-mines"
]);

function sectionBalance(value) {
  const html = String(value || "");
  return (html.match(/<section\b/gi) || []).length - (html.match(/<\/section>/gi) || []).length;
}

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  const record = await client.query("SELECT payload, updated_at FROM africa_json_documents WHERE path = $1 FOR UPDATE", [documentPath]);
  if (record.rowCount !== 1) throw new Error("Article document was not found");
  const articles = record.rows[0].payload;
  const affected = articles.filter((article) => editorialMetadataPattern.test(String(article.content || "")) || repairedArticleSlugs.has(article.slug));
  if (!affected.length) {
    console.log(JSON.stringify({ updated: 0, reason: "No public editorial metadata blocks found" }));
  } else {
    await mkdir(backupDir, { recursive: true });
    await writeFile(join(backupDir, "articles-before-editorial-metadata-cleanup.json"), `${JSON.stringify({ path: documentPath, updatedAt: record.rows[0].updated_at, articles: affected }, null, 2)}\n`);
    const replacements = new Map(affected.map((article) => [article.slug, stripInternalEditorialBlocks(article.content)]));
    for (const article of affected) {
      const cleanedContent = replacements.get(article.slug);
      if (editorialMetadataPattern.test(String(article.content || "")) && cleanedContent.length >= String(article.content || "").length) throw new Error(`No editorial metadata was removed from ${article.slug}`);
      if (editorialMetadataPattern.test(cleanedContent)) throw new Error(`Internal editorial metadata remains in ${article.slug}`);
      if (sectionBalance(cleanedContent) !== 0) throw new Error(`Section markup is unbalanced after cleanup for ${article.slug}`);
      if (/<h2>Conclusion<\/h2>/i.test(String(article.content || "")) && !/<h2>Conclusion<\/h2>/i.test(cleanedContent)) throw new Error(`Reader conclusion would be removed from ${article.slug}`);
    }
    const cleanedAt = new Date().toISOString();
    const cleaned = articles.map((article) => replacements.has(article.slug)
      ? {
        ...article,
        content: replacements.get(article.slug),
        updated_at: cleanedAt,
        manualOverrideAt: cleanedAt,
        manual_override_at: cleanedAt,
        editorialMetadataRemovedAt: cleanedAt,
        editorialMetadataRemovedReason: "Removed public SEO and CMS authoring fields"
      }
      : article);
    const remaining = cleaned.filter((article) => editorialMetadataPattern.test(String(article.content || ""))).map((article) => article.slug);
    if (remaining.length) throw new Error(`Internal editorial metadata remains in: ${remaining.join(", ")}`);
    await client.query("UPDATE africa_json_documents SET payload = $2::jsonb, updated_at = NOW() WHERE path = $1", [documentPath, JSON.stringify(cleaned)]);
    console.log(JSON.stringify({ updated: affected.length, slugs: affected.map((article) => article.slug), backupDir, verification: "no internal editorial metadata remains in article content" }));
  }
} finally {
  await client.end();
}
