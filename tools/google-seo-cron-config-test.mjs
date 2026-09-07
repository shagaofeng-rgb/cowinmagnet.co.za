import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const config = JSON.parse(await readFile(new URL("../vercel.json", import.meta.url), "utf8"));
const crons = new Map((config.crons || []).map((cron) => [cron.path, cron.schedule]));

test("Google Search Console crons target canonical, non-redirecting paths", () => {
  assert.equal(config.trailingSlash, true);
  assert.equal(crons.get("/api/cron/google-seo/"), "0 2 * * *");
  assert.equal(crons.get("/api/cron/gsc-inspection/"), "20 2 * * *");
  assert.equal([...crons].some(([path]) => path === "/api/cron/google-seo" || path === "/api/cron/gsc-inspection"), false);
});
