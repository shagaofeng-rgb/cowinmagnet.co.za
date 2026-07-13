import { isPublishedNewsArticle, readDataJson } from "../lib/news-system.js";
import { escapeXml, productionSiteUrl } from "../lib/sitemap-system.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function articleUrl(item) {
  return `${productionSiteUrl()}/en-za/news/${encodeURIComponent(item.slug)}/`;
}

export async function GET() {
  const now = Date.now();
  const recentMs = 2 * 24 * 60 * 60 * 1000;
  const articles = (await readDataJson("data/articles/articles.json", []))
    .filter(isPublishedNewsArticle)
    .filter((item) => now - new Date(item.published_at || item.date || 0).getTime() <= recentMs)
    .slice(0, 1000);
  const entries = articles.map((item) => `  <url>
    <loc>${escapeXml(articleUrl(item))}</loc>
    <news:news>
      <news:publication><news:name>Cowinmagnet South Africa</news:name><news:language>en</news:language></news:publication>
      <news:publication_date>${escapeXml(new Date(item.published_at || item.date).toISOString())}</news:publication_date>
      <news:title>${escapeXml(item.title)}</news:title>
    </news:news>
  </url>`).join("\n");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
${entries}
</urlset>
`;
  return new Response(xml, { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=0, s-maxage=300" } });
}
