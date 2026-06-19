import { readFile } from "node:fs/promises";
import { join, normalize, sep } from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const uploadsRoot = join(process.cwd(), "uploads");

function safeUploadPath(parts) {
  const relative = normalize(join(...parts.filter(Boolean)));
  if (relative.startsWith("..") || relative.includes(`..${sep}`)) return null;
  return join(uploadsRoot, relative);
}

export async function GET(_request, context) {
  const params = await context.params;
  const filePath = safeUploadPath(params.path || []);
  if (!filePath) return new Response("Forbidden", { status: 403 });

  try {
    const file = await readFile(filePath);
    return new Response(file, {
      headers: {
        "content-type": "application/octet-stream",
        "cache-control": "private, max-age=0, no-store"
      }
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
