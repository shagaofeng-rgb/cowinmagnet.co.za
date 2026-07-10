import { generateSitemapBundle } from "../lib/sitemap-system.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const bundle = await generateSitemapBundle();
    return new Response(bundle.indexXml, {
      headers: {
        "content-type": "application/xml; charset=utf-8",
        "cache-control": "public, max-age=0, s-maxage=300, stale-while-revalidate=3600"
      }
    });
  } catch (error) {
    console.error(`[sitemap] index generation failed: ${error?.message || error}`);
    return new Response("Sitemap generation failed", {
      status: 503,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" }
    });
  }
}
