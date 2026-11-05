import { gzipSync, gunzipSync } from "node:zlib";
import { revalidateTag, unstable_cache } from "next/cache.js";

const CACHE_SECONDS = 2 * 60 * 60;
const MAX_CACHE_BYTES = 1_750_000;

export function cachePublicDatabaseRead(key, load) {
  const tag = `cowin-public-${key}`;
  let pending;
  function readFromDatabase() {
    if (!pending) {
      pending = Promise.resolve().then(load).finally(() => { pending = undefined; });
    }
    return pending;
  }

  const cached = unstable_cache(async () => {
    const value = await readFromDatabase();
    const json = JSON.stringify(value);
    if (Buffer.byteLength(json) < 750_000) return { value };
    const compressed = gzipSync(json).toString("base64");
    if (compressed.length > MAX_CACHE_BYTES) return { oversized: true };
    return { compressed };
  }, [tag, "v1"], { revalidate: CACHE_SECONDS, tags: [tag] });

  return async function read() {
    if (process.env.VERCEL_ENV !== "production" || !process.env.DATABASE_URL) return load();
    try {
      const result = await cached();
      if (result.compressed) return JSON.parse(gunzipSync(Buffer.from(result.compressed, "base64")).toString());
      if (!result.oversized) return result.value;
    } catch (error) {
      console.warn("[public database cache] Using origin", { key, reason: error?.name });
    }
    return readFromDatabase();
  };
}

export function invalidatePublicDatabaseRead(key) {
  if (process.env.VERCEL_ENV !== "production") return;
  // The same stores are also used by standalone maintenance scripts.
  try {
    revalidateTag(`cowin-public-${key}`, { expire: 0 });
  } catch (error) {
    if (!String(error?.message).includes("static generation store missing")) {
      console.warn("[public database cache] Could not expire tag", { key, reason: error?.name });
    }
  }
}
