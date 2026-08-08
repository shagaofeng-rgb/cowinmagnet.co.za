import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";

const root = process.cwd();
const pagesRoot = join(root, "en-za");
const files = [];
async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await walk(path);
    else if (entry.name === "index.html") files.push(path);
  }
}
async function exists(url) {
  const pathname = new URL(url, "https://cowinmagnet.co.za").pathname;
  const target = pathname === "/en-za/" ? join(root, "en-za", "index.html") : join(root, pathname.replace(/^\//, ""), "index.html");
  return stat(target).then(() => true).catch(() => false);
}

await walk(pagesRoot);
const broken = [];
let checked = 0;
for (const file of files) {
  const html = await readFile(file, "utf8");
  for (const match of html.matchAll(/\bhref=(['"])(.*?)\1/gi)) {
    const href = match[2].trim();
    if (!href.startsWith("/en-za/")) continue;
    checked += 1;
    if (!(await exists(href))) broken.push({ page: `/${relative(root, file).replace(/\\index\.html$/, "/").replaceAll("\\", "/")}`, href });
  }
}
const report = { generatedAt: new Date().toISOString(), pages: files.length, checked, broken };
await writeFile(join(root, "reports", "static-link-audit.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ pages: files.length, checked, broken: broken.length }));
if (broken.length) process.exitCode = 1;
