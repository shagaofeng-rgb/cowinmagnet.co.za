import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const runtime = "nodejs";

export async function GET() {
  const text = await readFile(join(process.cwd(), "robots.txt"), "utf8");
  return new Response(text, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=300"
    }
  });
}
