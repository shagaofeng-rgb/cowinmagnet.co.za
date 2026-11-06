import { randomUUID } from "node:crypto";
import { readDataJson } from "./news-system.js";
import { cachePublicDatabaseRead, invalidatePublicDatabaseRead } from "./public-database-cache.js";

export const EDITORIAL_PATH = "data/cms/product-editorial.json";
export const editorialLimits = { shortDescription: 460, seoTitle: 75, seoDescription: 170 };

function cleanFields(input) {
  return Object.fromEntries(Object.entries(editorialLimits).map(([name, length]) => [
    name, String(input?.[name] || "").replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, length)
  ]));
}

export async function updateProductEditorial(pool, slug, { action, fields, revision, actor }) {
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    await db.query("INSERT INTO africa_json_documents (path, payload) VALUES ($1, '{}'::jsonb) ON CONFLICT DO NOTHING", [EDITORIAL_PATH]);
    const { rows: [{ payload }] } = await db.query("SELECT payload FROM africa_json_documents WHERE path = $1 FOR UPDATE", [EDITORIAL_PATH]);
    const current = Object.hasOwn(payload, slug) ? payload[slug] : {};
    if ((current.revision || "") !== revision || (action === "publish" && !current.draft)) {
      await db.query("ROLLBACK");
      return null;
    }
    const at = new Date().toISOString();
    const nextRevision = randomUUID();
    const next = action === "publish"
      ? { revision: nextRevision, live: { ...current.draft, publishedAt: at, publishedBy: actor, revision: nextRevision } }
      : { ...current, revision: nextRevision, draft: { fields: cleanFields(fields), updatedAt: at, updatedBy: actor } };
    await db.query("UPDATE africa_json_documents SET payload = jsonb_set(payload, $2::text[], $3::jsonb), updated_at = NOW() WHERE path = $1", [EDITORIAL_PATH, [slug], JSON.stringify(next)]);
    await db.query("COMMIT");
    if (action === "publish") invalidatePublicDatabaseRead("za-product-editorial");
    return next;
  } catch (error) {
    await db.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    db.release();
  }
}

export const readPublishedEditorial = cachePublicDatabaseRead("za-product-editorial", async () => {
  const state = await readDataJson(EDITORIAL_PATH, {});
  return Object.fromEntries(Object.entries(state).filter(([, value]) => value.live).map(([slug, value]) => [slug, {
    ...cleanFields(value.live.fields), publishedAt: value.live.publishedAt, revision: value.live.revision
  }]));
});

const escape = (value) => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));

export function applyProductEditorial(html, content) {
  if (!content) return html;
  const { shortDescription, seoTitle, seoDescription, revision } = content;
  let output = html;
  if (shortDescription) output = output.replace(/(<div\b[^>]*class=['"]product-hero-copy['"][^>]*>[\s\S]*?<\/h1>\s*<p>)[\s\S]*?(<\/p>)/i,
    (_, before, after) => before + escape(shortDescription) + after);
  if (seoTitle) output = output.replace(/<title>[\s\S]*?<\/title>/i, () => `<title>${escape(seoTitle)}</title>`);
  output = output.replace(/<meta\b[^>]*>/gi, (tag) => {
    const kind = tag.match(/\b(?:name|property)=['"](description|og:title|og:description)['"]/i)?.[1];
    const text = kind === "og:title" ? seoTitle : kind ? seoDescription : "";
    return text ? tag.replace(/\bcontent=(['"])[\s\S]*?\1/i, () => `content="${escape(text)}"`) : tag;
  });
  return revision ? output.replace(/<body\b/i, `<body data-product-revision="${escape(revision)}"`) : output;
}
