import { readFile } from "node:fs/promises";
import { join, normalize, sep } from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const assetsRoot = join(process.cwd(), "assets");

const types = new Map([
  [".css", "text/css; charset=utf-8"],
  [".js", "application/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".gif", "image/gif"],
  [".ico", "image/x-icon"],
  [".pdf", "application/pdf"]
]);

function safeAssetPath(parts) {
  const relative = normalize(join(...parts.filter(Boolean)));
  if (relative.startsWith("..") || relative.includes(`..${sep}`)) return null;
  return join(assetsRoot, relative);
}

function contentType(pathname) {
  const dot = pathname.lastIndexOf(".");
  const ext = dot >= 0 ? pathname.slice(dot).toLowerCase() : "";
  return types.get(ext) || "application/octet-stream";
}

export async function GET(_request, context) {
  const params = await context.params;
  const filePath = safeAssetPath(params.path || []);
  if (!filePath) return new Response("Forbidden", { status: 403 });

  try {
    const file = await readFile(filePath);
    return new Response(file, {
      headers: {
        "content-type": contentType(filePath),
        "cache-control": "public, max-age=31536000, immutable"
      }
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
