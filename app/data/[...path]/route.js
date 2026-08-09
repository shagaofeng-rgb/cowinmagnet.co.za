import { readFile } from "node:fs/promises";
import { join, normalize, sep } from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const dataRoot = join(process.cwd(), "data");

function safeDataPath(parts) {
  const relative = normalize(join(...parts.filter(Boolean)));
  if (relative.startsWith("..") || relative.includes(`..${sep}`)) return null;
  return join(dataRoot, relative);
}

export async function GET(_request, context) {
  const params = await context.params;
  const parts = params.path || [];
  // Product-sync records carry internal provenance and are build-only input.
  if (["products", "source-sync", "cms"].includes(parts[0])) {
    return new Response("Not found", { status: 404, headers: { "x-robots-tag": "noindex, nofollow" } });
  }
  const filePath = safeDataPath(parts);
  if (!filePath || !filePath.endsWith(".json")) return new Response("Forbidden", { status: 403 });

  try {
    const file = await readFile(filePath, "utf8");
    return new Response(file, {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": filePath.includes(`${sep}cms${sep}`) ? "no-store" : "public, max-age=300"
      }
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
