import { readFile } from "node:fs/promises";
import { join, normalize, sep } from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const root = /*turbopackIgnore: true*/ process.cwd();

function safePath(parts) {
  const relative = normalize(join(...parts.filter(Boolean)));
  if (relative.startsWith("..") || relative.includes(`..${sep}`)) return null;
  return join(root, relative);
}

const types = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "application/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".txt", "text/plain; charset=utf-8"]
]);

function contentType(pathname) {
  const dot = pathname.lastIndexOf(".");
  const ext = dot >= 0 ? pathname.slice(dot).toLowerCase() : ".html";
  return types.get(ext) || "application/octet-stream";
}

async function readRouteFile(parts) {
  const requestParts = parts.length ? parts : ["index.html"];
  const last = requestParts[requestParts.length - 1] || "";
  const htmlParts = last.includes(".") ? requestParts : [...requestParts, "index.html"];
  const filePath = safePath(htmlParts);
  if (!filePath) return null;
  try {
    return { body: await readFile(filePath), filePath };
  } catch {
    return null;
  }
}

export async function GET(_request, context) {
  const params = await context.params;
  const parts = params.path || [];
  const file = await readRouteFile(parts);
  if (file) {
    return new Response(file.body, {
      headers: {
        "content-type": contentType(file.filePath),
        "cache-control": "public, max-age=0, s-maxage=300"
      }
    });
  }

  const notFound = await readRouteFile(["en-za", "404"]);
  return new Response(notFound?.body || "Not found", {
    status: 404,
    headers: { "content-type": "text/html; charset=utf-8" }
  });
}
