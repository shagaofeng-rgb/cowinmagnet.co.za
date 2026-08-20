import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const rawPath = "data/news/cowinmagnet-za-africa-sources.raw.md";
const jsonPath = "data/news/cowinmagnet-za-source-catalog.seed.json";
const csvPath = "data/news/cowinmagnet-za-source-catalog.seed.csv";
const reportPath = "data/news/cowinmagnet-za-source-normalization-report.md";

const groups = [
  [1, 50, "mining-mineral-processing"],
  [51, 100, "bulk-heavy-machinery"],
  [101, 150, "recycling-waste"],
  [151, 200, "cement-aggregates-construction"],
  [201, 250, "food-grain-agriculture"],
  [251, 280, "chemicals-plastics"],
  [281, 300, "industrial-exhibitions-community"]
];

function sourceGroup(ordinal) {
  return groups.find(([start, end]) => ordinal >= start && ordinal <= end)?.[2] || "unclassified";
}

function normaliseDomain(value) {
  const match = String(value || "").match(/(?:https?:\/\/)?([a-z0-9.-]+\.[a-z]{2,}(?:\/[a-z0-9._~:/?#[\]@!$&'()*+,;=%-]*)?)/i);
  if (!match) return "";
  try {
    const url = new URL(match[0].startsWith("http") ? match[0] : `https://${match[0]}`);
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}

function csv(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

const raw = await readFile(rawPath, "utf8");
const entries = raw.split(/\r?\n/).map((rawEntry) => {
  const match = rawEntry.match(/^\s*(\d{1,3})\.\s*(.*?)\s+-\s*(.+?)\s*$/);
  if (!match) return null;
  const ordinal = Number(match[1]);
  const name = match[2].trim();
  const requestedUrl = normaliseDomain(match[3]);
  return {
    id: `cowinmagnet-za-source-${String(ordinal).padStart(3, "0")}`,
    site_id: "cowinmagnet-za",
    sourceOrdinal: ordinal,
    rawEntry,
    name,
    requestedDomain: requestedUrl,
    canonicalDomain: null,
    sourceGroup: sourceGroup(ordinal),
    industryTags: [],
    region: null,
    contentLanguages: [],
    discoveryMethod: [],
    tier: ordinal >= 296 ? "discovery-only" : "C",
    active: false,
    validationStatus: requestedUrl ? "pending" : "needs_review",
    robotsAllowed: null,
    lastCheckedAt: null,
    lastUsedAt: null,
    useCount: 0,
    notes: requestedUrl ? "Pending HTTP, robots, language and rights validation." : "No normalisable public URL was found in the raw entry."
  };
}).filter(Boolean);

const missing = Array.from({ length: 300 }, (_, index) => index + 1).filter((ordinal) => !entries.some((entry) => entry.sourceOrdinal === ordinal));
const uniqueDomains = new Set(entries.map((entry) => entry.requestedDomain).filter(Boolean));
await mkdir(dirname(jsonPath), { recursive: true });
await writeFile(jsonPath, `${JSON.stringify(entries, null, 2)}\n`);
await writeFile(csvPath, [
  "sourceOrdinal,name,requestedDomain,sourceGroup,tier,active,validationStatus,rawEntry",
  ...entries.map((entry) => [entry.sourceOrdinal,entry.name,entry.requestedDomain,entry.sourceGroup,entry.tier,entry.active,entry.validationStatus,entry.rawEntry].map(csv).join(","))
].join("\n") + "\n");
await writeFile(reportPath, `# Africa source catalogue normalisation\n\n- Raw entries parsed: ${entries.length}\n- Expected entries: 300\n- Missing ordinals: ${missing.length ? missing.join(", ") : "none"}\n- Unique requested domains: ${uniqueDomains.size}\n- Entries pending validation: ${entries.filter((entry) => entry.validationStatus === "pending").length}\n- Entries needing manual URL review: ${entries.filter((entry) => entry.validationStatus === "needs_review").length}\n\nNo source becomes active from this import. Active crawling requires a separate robots, public-access, language, relevance and rights validation pass.\n`);
console.log(JSON.stringify({ parsed: entries.length, missing, uniqueDomains: uniqueDomains.size }, null, 2));
