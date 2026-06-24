import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const runtime = "nodejs";

export async function GET() {
  const image = await readFile(join(process.cwd(), "assets", "images", "cowinmagnet-logo.jpg"));
  return new Response(image, {
    headers: {
      "content-type": "image/jpeg",
      "cache-control": "public, max-age=31536000, immutable"
    }
  });
}
