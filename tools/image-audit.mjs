import { createHash } from "node:crypto";
import { access, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";

const root = process.cwd();
const phase = process.argv.includes("--after") ? "after" : "before";
const output = join(root, phase === "after" ? "IMAGE_AUDIT_AFTER.md" : "IMAGE_AUDIT_BEFORE.md");
const imagePattern = /(?:src|srcset|href|data-src)=["']([^"']+\.(?:png|jpe?g|webp|svg))(?:\?[^"']*)?["']/gi;
const cssPattern = /url\((?:["'])?([^"')]+\.(?:png|jpe?g|webp|svg))(?:\?[^"')]+)?(?:["'])?\)/gi;
const generated = new Map([
  ["mining-conveyor-tramp-iron-protection.webp", "AI auxiliary: mining conveyor tramp-iron protection; generic industrial process context."],
  ["coal-wash-plant-wet-magnetic-separation.webp", "AI auxiliary: coal-wash plant wet magnetic separation process context."],
  ["recycling-eddy-current-metal-recovery.webp", "AI auxiliary: prepared recycling and non-ferrous recovery process context."],
  ["process-pipeline-magnetic-filtration.webp", "AI auxiliary: powder, granule and pipeline magnetic-filtration process context."],
  ["mineral-screening-control-environment.webp", "AI auxiliary: mineral screening and control environment."],
]);

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const target = join(directory, entry.name);
    if (entry.isDirectory()) {
      if ([".git", ".next", "node_modules", ".audit-backups", "data/backups"].includes(relative(root, target).replaceAll("\\", "/"))) return [];
      return walk(target);
    }
    return /\.(html|json|css)$/i.test(entry.name) ? [target] : [];
  }));
  return nested.flat();
}

function moduleName(html, index) {
  const preceding = html.slice(Math.max(0, index - 700), index);
  const heading = [...preceding.matchAll(/<(?:h1|h2|h3)[^>]*>([^<]+)<\/(?:h1|h2|h3)>/gi)].pop()?.[1];
  return heading?.replace(/\s+/g, " ").trim() || "Page asset";
}

function altText(html, index) {
  const tag = html.slice(Math.max(0, index - 80), Math.min(html.length, index + 420)).match(/<img\b[^>]*\balt=["']([^"']*)/i);
  return tag?.[1]?.replace(/\|/g, "/") || "";
}

function imageKind(asset) {
  const filename = asset.split("/").pop();
  if (generated.has(filename)) return { kind: "AI auxiliary image", note: generated.get(filename) };
  if (asset.includes("/source-products/")) return { kind: "Real product media", note: "COWIN main-site product media record." };
  if (/logo|favicon/i.test(filename)) return { kind: "Brand asset", note: "Intentional brand reuse." };
  return { kind: "Existing contextual asset", note: "Existing asset; visual provenance should be retained in the content record." };
}

async function hashFor(asset) {
  if (!asset.startsWith("/")) return "external-or-data";
  const path = join(root, asset.slice(1));
  try {
    const buffer = await readFile(path);
    return createHash("sha256").update(buffer).digest("hex").slice(0, 16);
  } catch {
    return "missing";
  }
}

const files = await walk(root);
const uses = [];
for (const file of files) {
  const content = await readFile(file, "utf8");
  const patterns = [imagePattern, cssPattern];
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    for (const match of content.matchAll(pattern)) {
      const asset = match[1].replace(/\\/g, "/");
      if (!asset.startsWith("/assets/") && !asset.startsWith("assets/")) continue;
      const normalized = asset.startsWith("/") ? asset : `/${asset}`;
      uses.push({
        source: relative(root, file).replaceAll("\\", "/"),
        module: moduleName(content, match.index || 0),
        asset: normalized,
        alt: altText(content, match.index || 0),
      });
    }
  }
}

const counts = new Map();
for (const use of uses) counts.set(use.asset, (counts.get(use.asset) || 0) + 1);
const hashes = new Map();
for (const asset of counts.keys()) hashes.set(asset, await hashFor(asset));
const duplicateByHash = new Map();
for (const [asset, hash] of hashes) duplicateByHash.set(hash, [...(duplicateByHash.get(hash) || []), asset]);
const rows = uses.sort((a, b) => a.source.localeCompare(b.source) || a.asset.localeCompare(b.asset)).map((use) => {
  const meta = imageKind(use.asset);
  const sameFile = counts.get(use.asset);
  const sameVisual = duplicateByHash.get(hashes.get(use.asset))?.length || 0;
  const action = meta.kind === "Brand asset" || meta.kind === "Real product media"
    ? "Retain when the product or brand context is the same."
    : sameFile > 2 || sameVisual > 1
      ? "Replace or limit to its matching page context."
      : "Retain as a context-specific image.";
  return `| ${use.source} | ${use.module.replace(/\|/g, "/")} | ${use.asset} | ${use.alt || "(none)"} | ${hashes.get(use.asset)} | ${sameFile} | ${meta.kind} | ${action} |`;
});
const summary = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([asset, count]) => `- \`${asset}\`: ${count} references; hash \`${hashes.get(asset)}\`.`).join("\n");
const promptNotes = phase === "after" ? `\n## Generated Image Notes\n${[...generated.entries()].map(([file, note]) => `- \`/assets/images/application/${file}\`: ${note}`).join("\n")}\n` : "";
const document = `# Image Audit (${phase})\n\nGenerated: ${new Date().toISOString()}\n\nScope: all static HTML, JSON and CSS image references in this repository, excluding build outputs, backups and dependencies. Translation copies are recorded separately because they are equivalent localized pages, not unrelated modules.\n\n## Summary\n- Image references: ${uses.length}\n- Unique image paths: ${counts.size}\n- Hash-identical file groups: ${[...duplicateByHash.values()].filter((assets) => assets.length > 1).length}\n\n### Most Reused Paths\n${summary}\n${promptNotes}\n## Detailed Inventory\n| Page URL / data source | Module | Image path | Alt | Hash | Uses | Asset type | Treatment |\n| --- | --- | --- | --- | --- | ---: | --- | --- |\n${rows.join("\n")}\n`;
await writeFile(output, document);
console.log(JSON.stringify({ phase, references: uses.length, uniqueAssets: counts.size, output: relative(root, output) }, null, 2));
