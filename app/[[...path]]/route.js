import { readFile } from "node:fs/promises";
import { join, normalize, sep } from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const root = process.cwd();

function safePath(parts) {
  const relative = normalize(join(...parts.filter(Boolean)));
  if (relative.startsWith("..") || relative.includes(`..${sep}`)) return null;
  return join(root, relative);
}

async function readHtml(parts) {
  const requestParts = parts.length ? parts : ["index.html"];
  const last = requestParts[requestParts.length - 1] || "";
  const htmlParts = last.includes(".") ? requestParts : [...requestParts, "index.html"];
  const filePath = safePath(htmlParts);
  if (!filePath) return null;
  try {
    return await readFile(filePath, "utf8");
  } catch {
    return null;
  }
}

export async function GET(_request, context) {
  const params = await context.params;
  const parts = params.path || [];
  const html = await readHtml(parts);
  if (html) {
    return new Response(html, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "public, max-age=0, s-maxage=300"
      }
    });
  }

  const notFound = await readHtml(["en-za", "404"]);
  return new Response(notFound || "Not found", {
    status: 404,
    headers: { "content-type": "text/html; charset=utf-8" }
  });
}
