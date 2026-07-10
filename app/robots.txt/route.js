import { productionSiteUrl } from "../lib/sitemap-system.js";

export const runtime = "nodejs";

export async function GET() {
  const text = `User-agent: *\nAllow: /\nDisallow: /admin/\nDisallow: /api/\n\nSitemap: ${productionSiteUrl()}/sitemap.xml\n`;
  return new Response(text, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=300"
    }
  });
}
