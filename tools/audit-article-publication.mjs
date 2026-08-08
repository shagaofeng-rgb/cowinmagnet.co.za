import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Client } from "pg";

const internalEditorialPattern = /(?:seo\s*meta|seo\s*title|meta\s*description|url\s*slug|primary\s*keyword|secondary\s*keywords|search\s*intent|target\s*country|target\s*buyer|suggested\s*cta|ai\s*citation\s*ready\s*summary|internal\s*linking\s*suggestions|cms(?:\s+publishing)?\s*checklist|json-ld\s*schema)/i;
const documentPath = "data/articles/articles.json";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  const result = await client.query("SELECT payload, updated_at FROM africa_json_documents WHERE path = $1", [documentPath]);
  const articles = result.rows[0]?.payload || [];
  const rows = articles.map((article) => {
    const image = article.image_url || article.cover_image_url || article.image || "";
    return {
      slug: article.slug || "",
      type: article.type || "",
      status: article.status || "",
      publishedAt: article.published_at || article.date || "",
      internalEditorialMetadata: internalEditorialPattern.test(String(article.content || "")) ? "found" : "clear",
      coverImage: image,
      coverImageOrigin: /^https?:\/\//i.test(String(image)) ? "external - rights review required" : "local or empty"
    };
  });
  await mkdir(join(process.cwd(), "reports"), { recursive: true });
  const headers = Object.keys(rows[0] || { slug: "", type: "", status: "", publishedAt: "", internalEditorialMetadata: "", coverImage: "", coverImageOrigin: "" });
  const csv = [headers.join(","), ...rows.map((row) => headers.map((key) => `"${String(row[key] || "").replaceAll('"', '""')}"`).join(","))].join("\n");
  await writeFile(join(process.cwd(), "reports", "article-publication-audit.csv"), `${csv}\n`);
  console.log(JSON.stringify({
    documentUpdatedAt: result.rows[0]?.updated_at || null,
    articleCount: rows.length,
    internalEditorialMetadata: rows.filter((row) => row.internalEditorialMetadata === "found").map((row) => row.slug),
    externalCoverImages: rows.filter((row) => row.coverImageOrigin.startsWith("external")).map((row) => ({ slug: row.slug, image: row.coverImage })),
    report: "reports/article-publication-audit.csv"
  }, null, 2));
} finally {
  await client.end();
}
