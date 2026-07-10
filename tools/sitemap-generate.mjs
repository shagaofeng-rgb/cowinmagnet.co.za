import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { runSitemapAudit } from "../app/lib/sitemap-system.js";

const root = process.cwd();
const args = new Set(process.argv.slice(2));
const options = {
  force: args.has("--force"),
  dryRun: args.has("--dry-run"),
  submit: args.has("--submit"),
  verbose: args.has("--verbose")
};

function hash(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return fallback;
  }
}

function gitExecutable() {
  const portable = join(root, ".deploy-tools", "PortableGit", "cmd", "git.exe");
  try {
    execFileSync(portable, ["--version"], { stdio: "ignore" });
    return portable;
  } catch {
    return "git";
  }
}

function gitDates() {
  try {
    const output = execFileSync(gitExecutable(), ["log", "--format=@@%cI", "--name-only", "--", "en-za"], {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024
    });
    const result = {};
    let date = "";
    for (const line of output.split(/\r?\n/)) {
      if (line.startsWith("@@")) date = line.slice(2);
      else if (date && line.startsWith("en-za/") && !result[line]) result[line] = date;
    }
    return result;
  } catch {
    return {};
  }
}

async function refreshStaticDates() {
  const target = join(root, "data", "seo", "static-page-dates.json");
  const existing = await readJson(target, {});
  const history = gitDates();
  const sitemap = await readFile(join(root, "sitemap.xml"), "utf8");
  const urls = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => new URL(match[1]));
  const next = {};
  for (const url of urls) {
    if (!url.pathname.startsWith("/en-za/")) continue;
    const relative = `${url.pathname.replace(/^\//, "")}index.html`;
    const file = join(root, ...relative.split("/"));
    let content;
    try {
      content = await readFile(file);
    } catch {
      continue;
    }
    const contentHash = hash(content);
    const prior = existing[url.pathname];
    let lastmod = prior?.hash === contentHash ? prior.lastmod : history[relative];
    if (!lastmod) lastmod = (await stat(file)).mtime.toISOString();
    next[url.pathname] = { lastmod: new Date(lastmod).toISOString(), hash: contentHash };
  }
  await mkdir(join(root, "data", "seo"), { recursive: true });
  const temporary = `${target}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  await rename(temporary, target);
  return Object.keys(next).length;
}

if (!options.dryRun) {
  const count = await refreshStaticDates();
  if (options.verbose) console.log(`Refreshed ${count} static page timestamps.`);
}

const outputDir = options.dryRun ? undefined : join(root, ".generated-sitemaps");
const result = await runSitemapAudit({ ...options, trigger: "manual-cli", outputDir });
console.log(JSON.stringify({
  runId: result.run.id,
  changed: result.run.changed,
  dryRun: result.run.dryRun,
  urls: result.run.totalUrls,
  files: result.run.files,
  added: result.run.added.length,
  modified: result.run.modified.length,
  deleted: result.run.deleted.length,
  searchConsole: result.run.searchConsole
}, null, options.verbose ? 2 : 0));
