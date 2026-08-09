import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const root = join(process.cwd(), "en-za");

async function pages(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return pages(path);
    return entry.name === "index.html" ? [path] : [];
  }));
  return nested.flat();
}

const replacements = [
  [/<button type="button" data-mega-button aria-expanded="false" aria-controls="mega-products">Products<\/button>/g, '<span class="nav-split"><a href="/en-za/products/">Products</a><button type="button" data-mega-button aria-expanded="false" aria-controls="mega-products" aria-label="Open Products menu"><span aria-hidden="true">&#8964;</span></button></span>'],
  [/<button type="button" data-mega-button aria-expanded="false" aria-controls="mega-industries">Industries<\/button>/g, '<span class="nav-split"><a href="/en-za/industries/">Industries</a><button type="button" data-mega-button aria-expanded="false" aria-controls="mega-industries" aria-label="Open Industries menu"><span aria-hidden="true">&#8964;</span></button></span>']
];

let changed = 0;
for (const file of await pages(root)) {
  const source = await readFile(file, "utf8");
  const navigation = replacements.reduce((html, [pattern, replacement]) => html.replace(pattern, replacement), source);
  // These legacy feature images are immediately replaced by the concise runtime menu.
  // Leaving them in every static page created hundreds of irrelevant source-level repeats.
  const updated = navigation
    .replace(/(<div class="mega-feature">)\s*<img\b[^>]*>/g, "$1")
    .replace(/>⌄<\/span>/g, ">&\#8964;</span>");
  if (updated !== source) {
    await writeFile(file, updated);
    changed += 1;
  }
}
console.log(`Updated desktop Products and Industries navigation on ${changed} English South Africa pages.`);
