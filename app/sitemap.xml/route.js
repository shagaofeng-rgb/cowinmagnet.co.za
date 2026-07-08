import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { isPublishedBlogArticle, isPublishedNewsArticle, readDataJson } from "../lib/news-system.js";

export const runtime = "nodejs";

export async function GET() {
  const baseXml = await readFile(join(process.cwd(), "sitemap.xml"), "utf8");
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || process.env.APP_URL || "https://cowinmagnet.co.za").replace(/\/$/, "");
  const existingLocs = new Set([...baseXml.matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => match[1]));
  const articles = (await readDataJson("data/articles/articles.json", [])).filter((item) => (
    isPublishedBlogArticle(item) || isPublishedNewsArticle(item)
  ));
  const dynamicUrls = articles
    .filter((item) => {
      const section = item.article_type === "blog" ? "blog" : "news";
      const loc = `${siteUrl}/en-za/${section}/${item.slug}/`;
      if (existingLocs.has(loc)) return false;
      existingLocs.add(loc);
      return true;
    })
    .map((item) => {
      const lastmod = item.updated_at || item.published_at || item.date || new Date().toISOString();
      const section = item.article_type === "blog" ? "blog" : "news";
      return `<url><loc>${siteUrl}/en-za/${section}/${item.slug}/</loc><lastmod>${new Date(lastmod).toISOString()}</lastmod><changefreq>daily</changefreq><priority>0.7</priority></url>`;
    })
    .join("");
  const xml = baseXml.includes("</urlset>")
    ? baseXml.replace("</urlset>", `${dynamicUrls}</urlset>`)
    : baseXml;
  return new Response(xml, {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": "public, max-age=300"
    }
  });
}
