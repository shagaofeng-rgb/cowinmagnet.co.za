import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

export const ENQUIRIES_PATH = "data/cms/enquiries.json";
export const UPLOAD_PART_BYTES = 1024 * 1024;
const MAX_FILE_BYTES = 8 * UPLOAD_PART_BYTES;
const MAX_PENDING_UPLOADS = 8;
const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const schemas = new WeakMap();

const fileTypes = {
  pdf: ["application/pdf", "255044462d"],
  jpg: ["image/jpeg", "ffd8ff"],
  jpeg: ["image/jpeg", "ffd8ff"],
  png: ["image/png", "89504e470d0a1a0a"],
  doc: ["application/msword", "d0cf11e0a1b11ae1"],
  docx: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "504b0304"]
};

export class EnquiryError extends Error {
  constructor(status, message) {
    super(message);
    this.name = "EnquiryError";
    this.status = status;
  }
}

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function transaction(pool, work) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function ensureUploads(pool) {
  if (!schemas.has(pool)) {
    const pending = transaction(pool, async (db) => {
      await db.query("SELECT pg_advisory_xact_lock(hashtext('cowin-za-enquiry-uploads-v1'))");
      await db.query(`
        CREATE TABLE IF NOT EXISTS africa_enquiry_uploads (
          id UUID PRIMARY KEY, token_digest TEXT NOT NULL, request_key TEXT NOT NULL,
          name TEXT NOT NULL, extension TEXT NOT NULL, mime_type TEXT NOT NULL,
          bytes INTEGER NOT NULL CHECK (bytes BETWEEN 1 AND 8388608),
          expires_at TIMESTAMPTZ NOT NULL, enquiry_id TEXT
        );
        CREATE TABLE IF NOT EXISTS africa_enquiry_upload_parts (
          upload_id UUID NOT NULL REFERENCES africa_enquiry_uploads(id) ON DELETE CASCADE,
          part INTEGER NOT NULL CHECK (part BETWEEN 0 AND 7), content BYTEA NOT NULL,
          PRIMARY KEY (upload_id, part)
        );
        CREATE INDEX IF NOT EXISTS africa_enquiry_pending_expiry
          ON africa_enquiry_uploads (expires_at) WHERE enquiry_id IS NULL;
        CREATE INDEX IF NOT EXISTS africa_enquiry_upload_owner
          ON africa_enquiry_uploads (request_key, expires_at) WHERE enquiry_id IS NULL;
      `);
    }).catch((error) => {
      schemas.delete(pool);
      throw error;
    });
    schemas.set(pool, pending);
  }
  await schemas.get(pool);
}

function fileInfo(input) {
  const name = String(input?.name || "").split(/[\\/]/).pop().replace(/[\u0000-\u001f\u007f]/g, "").trim();
  const extension = name.split(".").pop()?.toLowerCase();
  const size = Number(input?.size);
  if (!name || name.length > 180 || !Object.hasOwn(fileTypes, extension)) {
    throw new EnquiryError(400, "Choose a PDF, JPG, PNG, DOC or DOCX file.");
  }
  if (!Number.isInteger(size) || size < 1 || size > MAX_FILE_BYTES) {
    throw new EnquiryError(413, "The attachment must be between 1 byte and 8 MB.");
  }
  return { name, extension, mime: fileTypes[extension][0], size };
}

async function lockPendingUpload(db, id, secret) {
  if (!uuid.test(id || "") || !/^[A-Za-z0-9_-]{43}$/.test(secret || "")) {
    throw new EnquiryError(404, "Attachment upload was not found.");
  }
  const { rows: [upload] } = await db.query(
    "SELECT * FROM africa_enquiry_uploads WHERE id = $1 AND enquiry_id IS NULL AND expires_at > NOW() FOR UPDATE", [id]
  );
  if (!upload || !timingSafeEqual(Buffer.from(upload.token_digest, "hex"), Buffer.from(digest(secret), "hex"))) {
    throw new EnquiryError(404, "Attachment upload expired or was not found. Please select the file again.");
  }
  return upload;
}

export async function startEnquiryUpload(pool, input, clientKey) {
  const info = fileInfo(input);
  await ensureUploads(pool);
  const id = randomUUID();
  const secret = randomBytes(32).toString("base64url");
  const key = digest(`za-enquiry-upload:${clientKey}`);
  await transaction(pool, async (db) => {
    await db.query("SELECT pg_advisory_xact_lock(hashtext($1))", [key]);
    const { rows: [pending] } = await db.query(
      "SELECT COUNT(*)::int AS count FROM africa_enquiry_uploads WHERE request_key = $1 AND enquiry_id IS NULL AND expires_at > NOW()", [key]
    );
    if (pending.count >= MAX_PENDING_UPLOADS) throw new EnquiryError(429, "Too many incomplete uploads. Please try again later.");
    await db.query(
      `INSERT INTO africa_enquiry_uploads (id, token_digest, request_key, name, extension, mime_type, bytes, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW() + INTERVAL '45 minutes')`,
      [id, digest(secret), key, info.name, info.extension, info.mime, info.size]
    );
  });
  return { id, token: secret, partBytes: UPLOAD_PART_BYTES };
}

export async function readUploadPart(request) {
  const reader = request.body?.getReader();
  if (!reader) throw new EnquiryError(400, "The attachment part was empty.");
  const chunks = [];
  let size = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > UPLOAD_PART_BYTES) {
      await reader.cancel();
      throw new EnquiryError(413, "The attachment part was too large.");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks, size);
}

export async function saveUploadPart(pool, id, secret, part, bytes) {
  await ensureUploads(pool);
  return transaction(pool, async (db) => {
    const upload = await lockPendingUpload(db, id, secret);
    const expected = Math.min(UPLOAD_PART_BYTES, upload.bytes - part * UPLOAD_PART_BYTES);
    if (!Number.isInteger(part) || part < 0 || expected <= 0 || bytes.length !== expected) {
      throw new EnquiryError(400, "The attachment part is incomplete. Please try again.");
    }
    const signature = Buffer.from(fileTypes[upload.extension][1], "hex");
    if (part === 0 && !bytes.subarray(0, signature.length).equals(signature)) {
      throw new EnquiryError(415, "The attachment content does not match its file type.");
    }
    await db.query(
      "INSERT INTO africa_enquiry_upload_parts (upload_id, part, content) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
      [id, part, bytes]
    );
  });
}

async function attachUpload(db, input, enquiryId) {
  const upload = await lockPendingUpload(db, input.id, input.token);
  const { rows: [parts] } = await db.query(
    "SELECT COUNT(*)::int AS count, COALESCE(SUM(octet_length(content)), 0)::int AS bytes FROM africa_enquiry_upload_parts WHERE upload_id = $1",
    [upload.id]
  );
  if (parts.bytes !== upload.bytes || parts.count !== Math.ceil(upload.bytes / UPLOAD_PART_BYTES)) {
    throw new EnquiryError(409, "The attachment has not finished uploading. Please try again.");
  }
  if (upload.extension === "docx") {
    const { rows: [result] } = await db.query(
      "SELECT content FROM africa_enquiry_upload_parts WHERE upload_id = $1 ORDER BY part DESC LIMIT 1", [upload.id]
    );
    if (!result.content.includes(Buffer.from("word/")) || !result.content.includes(Buffer.from("504b0506", "hex"))) {
      throw new EnquiryError(415, "Choose a valid Word document.");
    }
  }
  await db.query("UPDATE africa_enquiry_uploads SET enquiry_id = $2, token_digest = '' WHERE id = $1", [upload.id, enquiryId]);
  return { id: upload.id, name: upload.name, size: upload.bytes, mime: upload.mime_type };
}

export async function saveEnquiry(pool, record, { upload, submissionKey, submissionWindowMs, seed = [] } = {}) {
  if (upload) await ensureUploads(pool);
  return transaction(pool, async (db) => {
    await db.query("INSERT INTO africa_json_documents (path, payload) VALUES ($1, $2::jsonb) ON CONFLICT DO NOTHING", [ENQUIRIES_PATH, JSON.stringify(seed)]);
    const { rows: [{ payload: items }] } = await db.query(
      "SELECT payload FROM africa_json_documents WHERE path = $1 FOR UPDATE", [ENQUIRIES_PATH]
    );
    if (submissionKey) {
      const saved = items.find((item) => item.submissionKey === submissionKey && (
        !submissionWindowMs || Date.parse(item.submissionTime) >= Date.now() - submissionWindowMs
      ));
      if (saved) return { record: saved, created: false };
    }
    if (upload) record.attachment = await attachUpload(db, upload, record.id);
    const saved = { ...record, ...(submissionKey ? { submissionKey } : {}) };
    await db.query(
      "UPDATE africa_json_documents SET payload = payload || jsonb_build_array($2::jsonb), updated_at = NOW() WHERE path = $1",
      [ENQUIRIES_PATH, JSON.stringify(saved)]
    );
    return { record: saved, created: true };
  });
}

// Locate the ID after locking so a write never uses a stale JSON snapshot.
export async function updateEnquiry(pool, id, update) {
  return transaction(pool, async (db) => {
    const { rows: [doc] } = await db.query(
      "SELECT payload FROM africa_json_documents WHERE path = $1 FOR UPDATE", [ENQUIRIES_PATH]
    );
    const index = (doc?.payload || []).findIndex((row) => row.id === id);
    if (index < 0) return null;
    const current = doc.payload[index];
    const next = update(current);
    if (!next) return { record: current, changed: false };
    await db.query(
      "UPDATE africa_json_documents SET payload = jsonb_set(payload, $2::text[], $3::jsonb, false), updated_at = NOW() WHERE path = $1",
      [ENQUIRIES_PATH, [String(index)], JSON.stringify(next)]
    );
    return { record: next, changed: true };
  });
}

export async function enquiryAttachment(pool, enquiryId, attachmentId) {
  if (!uuid.test(attachmentId || "")) return null;
  await ensureUploads(pool);
  const { rows: [file] } = await pool.query(
    "SELECT id, name, bytes FROM africa_enquiry_uploads WHERE id = $1 AND enquiry_id = $2", [attachmentId, enquiryId]
  );
  if (!file) return null;
  let part = 0;
  const parts = Math.ceil(file.bytes / UPLOAD_PART_BYTES);
  const stream = new ReadableStream({
    async pull(controller) {
      const { rows: [row] } = await pool.query(
        "SELECT content FROM africa_enquiry_upload_parts WHERE upload_id = $1 AND part = $2", [file.id, part]
      );
      if (!row) throw new Error("Stored attachment part is unavailable");
      controller.enqueue(new Uint8Array(row.content));
      part += 1;
      if (part === parts) controller.close();
    }
  });
  return { name: file.name, stream };
}

export async function expireEnquiryUploads(pool) {
  await ensureUploads(pool);
  await pool.query(`DELETE FROM africa_enquiry_uploads WHERE id IN (
    SELECT id FROM africa_enquiry_uploads WHERE enquiry_id IS NULL AND expires_at <= NOW()
    LIMIT 200 FOR UPDATE SKIP LOCKED
  )`);
}
