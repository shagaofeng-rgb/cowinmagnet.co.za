import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const origin = (process.argv.find((item) => item.startsWith("--origin="))?.split("=")[1] || "https://cowinmagnet.co.za").replace(/\/$/, "");
const output = process.argv.find((item) => item.startsWith("--output="))?.split("=")[1] || "reports/full-site-audit-20260831/production-api-audit.json";
const allowUnavailableDatabase = process.argv.includes("--allow-unavailable-database");

const checks = [
  { name: "admin products require authentication", path: "/api/admin/products", expected: [401] },
  { name: "admin session requires authentication", path: "/api/session", expected: [401] },
  { name: "invalid login is rejected without a cookie", path: "/api/login", method: "POST", body: { email: "codex-audit-invalid@example.invalid", password: "codex-audit-invalid" }, expected: [401], noSetCookie: true },
  { name: "empty enquiry is rejected without persistence", path: "/api/enquiries", method: "POST", body: {}, expected: [400] },
  { name: "Google SEO cron requires authorization", path: "/api/cron/google-seo", expected: [401] },
  { name: "GSC inspection cron requires authorization", path: "/api/cron/gsc-inspection", expected: [401] },
  { name: "News cron requires authorization", path: "/api/cron/news-publish", expected: [401] },
  { name: "public News API is available", path: "/api/news?page=1&pageSize=1", expected: [200] },
  { name: "public Blog API is available", path: "/api/blog?page=1&pageSize=1", expected: [200] },
  { name: "repository data is private", path: "/data/products/products.json", expected: [404] },
  { name: "repository tools are private", path: "/tools/runtime-audit.mjs", expected: [404] },
  { name: "Git metadata is private", path: "/.git/config", expected: [404] }
];

async function run(check) {
  try {
    const response = await fetch(`${origin}${check.path}`, {
      method: check.method || "GET",
      redirect: "follow",
      headers: check.body ? { "content-type": "application/json" } : undefined,
      body: check.body ? JSON.stringify(check.body) : undefined,
      signal: AbortSignal.timeout(20_000)
    });
    const body = (await response.text()).slice(0, 1_000);
    const robots = response.headers.get("x-robots-tag") || "";
    const failures = [];
    const expected = allowUnavailableDatabase && check.path === "/api/login" ? [...check.expected, 503] : check.expected;
    if (!expected.includes(response.status)) failures.push(`status:${response.status}`);
    if (check.path.startsWith("/api/") && !/noindex/i.test(robots)) failures.push("api-missing-noindex");
    if (check.noSetCookie && response.headers.has("set-cookie")) failures.push("unexpected-set-cookie");
    if (check.path.startsWith("/data/") || check.path.startsWith("/tools/") || check.path.startsWith("/.git/")) {
      if (!/noindex/i.test(robots)) failures.push("private-route-missing-noindex");
    }
    return { ...check, finalUrl: response.url, redirected: response.redirected, status: response.status, robots, cacheControl: response.headers.get("cache-control") || "", contentType: response.headers.get("content-type") || "", failures, responsePreview: body };
  } catch (error) {
    return { ...check, status: 0, failures: [`network:${error?.message || String(error)}`] };
  }
}

const results = [];
for (const check of checks) results.push(await run(check));
const report = { generatedAt: new Date().toISOString(), origin, allowUnavailableDatabase, passed: results.every((item) => !item.failures.length), checks: results };
await mkdir(dirname(join(process.cwd(), output)), { recursive: true });
await writeFile(join(process.cwd(), output), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ output, passed: report.passed, checks: results.length, failures: results.filter((item) => item.failures.length).map((item) => ({ name: item.name, failures: item.failures })) }, null, 2));
if (!report.passed) process.exitCode = 1;
