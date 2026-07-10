import { generateSitemapBundle } from "../../lib/sitemap-system.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request, context) {
  const { file } = await context.params;
  if (!/^(pages|products|categories|posts)-[1-9][0-9]*\.xml$/.test(file || "")) {
    return new Response("Not found", { status: 404 });
  }
  try {
    const bundle = await generateSitemapBundle();
    const sitemap = bundle.files.find((entry) => entry.name === file);
    if (!sitemap) return new Response("Not found", { status: 404 });
    return new Response(sitemap.xml, {
      headers: {
        "content-type": "application/xml; charset=utf-8",
        "cache-control": "public, max-age=0, s-maxage=300, stale-while-revalidate=3600"
      }
    });
  } catch (error) {
    console.error(`[sitemap] ${file} generation failed: ${error?.message || error}`);
    return new Response("Sitemap generation failed", {
      status: 503,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" }
    });
  }
}
