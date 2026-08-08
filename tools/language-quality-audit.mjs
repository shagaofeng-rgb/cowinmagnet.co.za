import { readFile, readdir, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

const root = process.cwd();
const apply = process.argv.includes("--apply");
const productPath = join(root, "data", "products", "products.json");
const reportPath = join(root, "reports", "language-quality-audit.json");
const publicRoots = ["en-za", "af-za", "zu-za", "xh-za", "st-za", "tn-za", "en-africa", "fr-africa", "pt-africa", "sw-africa", "ar-africa"];
const publicPlaceholderPatterns = [
  /pending production pdf/i,
  /prepared for deployment/i,
  /local prototype/i,
  /machine-translated content/i,
  /verified (?:afrikaans|isizulu|isixhosa|sesotho|setswana) product copy is pending/i,
  /future (?:french|portuguese|swahili|arabic) content/i
];
const oldTranslationPattern = /machine-translated content|verified .* product copy is pending|future .* content field prepared/i;
const exactCorrections = new Map([
  ["CQZ type fully automatic online magnetic separation", "CQZ Type Fully Automatic Inline Magnetic Separator"],
  ["CTB type semi countercurrent wet selection machine", "CTB Type Semi-Countercurrent Wet Magnetic Separator"],
  ["DCZ type dry fully automatic magnetic separation", "DCZ Type Dry Fully Automatic Magnetic Separator"],
  ["Disc Magnetic Separator for Tailing", "Disc Magnetic Separator for Tailings"],
  ["Disc Magnetic Separator for Tailingss", "Disc Magnetic Separator for Tailings"],
  ["HJLH type vertical ring high gradient magnetic separation", "HJLH Type Vertical-Ring High-Gradient Magnetic Separator"],
  ["HJPC wet disc magnetic separation", "HJPC Wet Disc Magnetic Separator"],
  ["LJK type magnetic ore special iron remover", "LJK Type Magnetic Ore Iron Remover"],
  ["Strong 6000-16000 Gauss Iron Absorbing Permanent Filter Bar Magnetic Neodymium Rod", "Permanent Magnetic Filter Bar (Neodymium Rod)"],
  ["WBC semi magnetic tailings recovery machine", "WBC Semi-Magnetic Tailings Recovery Machine"]
]);
const skippedTextKeys = new Set(["slug", "canonicalUrl", "canonical_url", "sourceUrl", "source_url", "sourceProductId", "productId", "sku", "image", "images", "gallery"]);
const titleCaseMinorWords = new Set(["and", "as", "at", "by", "for", "from", "in", "of", "on", "or", "the", "to", "with", "vs"]);

function decodeJson(raw) {
  return JSON.parse(raw.replace(/^\uFEFF/, ""));
}

function languageFallback() {
  return {
    shortDescription: "English product information is currently provided for technical accuracy.",
    fullDescription: "Product specifications and selection guidance are currently available in English."
  };
}

function correctText(value) {
  let result = String(value || "");
  for (const [before, after] of exactCorrections) {
    const escaped = before.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    result = result.replace(new RegExp(`${escaped}\\b`, "g"), after);
  }
  return result
    .replace(/\bsemi countercurrent\b/gi, "semi-countercurrent")
    .replace(/\bself dumping\b/gi, "self-dumping")
    .replace(/\bair cooled\b/gi, "air-cooled")
    .replace(/\bself cooling\b/gi, "self-cooled")
    .replace(/\boil cooled\b/gi, "oil-cooled")
    .replace(/\bexplosion proof\b/gi, "explosion-proof")
    .replace(/\bdisc type\b/gi, "disc-type")
    .replace(/\bfull magnetic\b/gi, "full-magnetic")
    .replace(/\bsemi magnetic\b/gi, "semi-magnetic")
    .replace(/\bhigh gradient\b/gi, "high-gradient")
    .replace(/\bvertical ring\b/gi, "vertical-ring");
}

function correctRecord(value, key = "") {
  if (typeof value === "string") return skippedTextKeys.has(key) ? value : correctText(value);
  if (Array.isArray(value)) return value.map((item) => correctRecord(item));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([childKey, childValue]) => [childKey, correctRecord(childValue, childKey)]));
}

function titleCaseProductName(value) {
  return String(value || "").split(/\s+/).map((word, index) => {
    if (!word || /^[A-Z0-9]+$/.test(word)) return word;
    const lower = word.toLowerCase();
    if (index > 0 && titleCaseMinorWords.has(lower)) return lower;
    return word.split("-").map((part) => {
      const match = part.match(/^([^A-Za-z0-9]*)(.*?)([^A-Za-z0-9]*)$/);
      if (!match || !match[2] || /^[A-Z0-9]+$/.test(match[2])) return part;
      return `${match[1]}${match[2].charAt(0).toUpperCase()}${match[2].slice(1).toLowerCase()}${match[3]}`;
    }).join("-");
  }).join(" ");
}

async function walkHtml(directory) {
  const output = [];
  let entries = [];
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return output;
  }
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) output.push(...await walkHtml(path));
    if (entry.isFile() && entry.name.endsWith(".html")) output.push(path);
  }
  return output;
}

async function publicFindings() {
  const files = (await Promise.all(publicRoots.map((folder) => walkHtml(join(root, folder))))).flat();
  const findings = [];
  for (const file of files) {
    const html = await readFile(file, "utf8");
    for (const pattern of publicPlaceholderPatterns) {
      if (pattern.test(html)) findings.push({ file: relative(root, file).replaceAll("\\", "/"), pattern: pattern.source });
    }
    if (/[\uFFFD]|(?:Ã.|Â.|â€)/.test(html)) findings.push({ file: relative(root, file).replaceAll("\\", "/"), pattern: "possible-mojibake" });
  }
  return { files: files.length, findings };
}

const products = decodeJson(await readFile(productPath, "utf8"));
let translationFallbacksReplaced = 0;
let productTextFieldsCorrected = 0;
const correctedProductSlugs = [];
const correctedProducts = products.map((product) => {
  const corrected = correctRecord(product);
  const previousName = String(corrected.name || "");
  const displayName = titleCaseProductName(previousName);
  if (displayName && displayName !== previousName) {
    corrected.name = displayName;
    corrected.englishProductName = displayName;
    for (const field of ["shortDescription", "fullDescription", "seoTitle", "seoDescription"]) {
      if (typeof corrected[field] === "string") corrected[field] = corrected[field].replaceAll(previousName, displayName);
    }
    const englishTranslation = corrected.translations?.["en-za"];
    if (englishTranslation && typeof englishTranslation === "object") {
      englishTranslation.name = displayName;
      for (const field of ["shortDescription", "fullDescription", "seoTitle", "seoDescription"]) {
        if (typeof englishTranslation[field] === "string") englishTranslation[field] = englishTranslation[field].replaceAll(previousName, displayName);
      }
    }
  }
  if (JSON.stringify(corrected) !== JSON.stringify(product)) {
    productTextFieldsCorrected += 1;
    correctedProductSlugs.push(product.slug);
  }
  for (const [locale, translation] of Object.entries(corrected.translations || {})) {
    if (locale === "en-za" || !translation || typeof translation !== "object") continue;
    if (oldTranslationPattern.test(JSON.stringify(translation))) {
      Object.assign(translation, languageFallback());
      translationFallbacksReplaced += 1;
    }
  }
  return corrected;
});

if (apply) {
  const serialized = JSON.stringify(correctedProducts, null, 2).replace(/\n/g, "\r\n");
  await writeFile(productPath, `\uFEFF${serialized}\r\n`, "utf8");
}

const publicAudit = await publicFindings();
const report = {
  generatedAt: new Date().toISOString(),
  mode: apply ? "applied" : "audit-only",
  productRecords: products.length,
  productTextFieldsCorrected,
  correctedProductSlugs,
  translationFallbacksReplaced,
  publicHtmlFiles: publicAudit.files,
  publicPlaceholderFindings: publicAudit.findings,
  policy: "Only verified English content is selectable. Legacy regional URLs remain available with English technical content and no index eligibility."
};
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ report: relative(root, reportPath), ...report }, null, 2));
