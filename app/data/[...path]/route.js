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
  const filePath = safeDataPath(params.path || []);
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
