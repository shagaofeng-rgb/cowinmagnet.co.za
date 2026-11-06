import { randomUUID } from "node:crypto";
import { updateEnquiry } from "./enquiry-store.js";

export const NOTIFICATION_RECIPIENT = "info@cowinmagnet.com";
const RESEND_EMAILS = "https://api.resend.com/emails";
const MAX_ATTEMPTS = 4;
const DAY_MS = 86_400_000;
const terminal = new Set(["delivered", "bounced", "complained", "cancelled"]);

function settled(notice) {
  return terminal.has(notice.status) || Boolean(notice.providerId && notice.status === "failed");
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]
  ));
}

function emailBody(record) {
  const details = [
    ["Reference", record.id], ["Submitted", record.submissionTime], ["Name", record.name],
    ["Company", record.company], ["Email", record.email], ["WhatsApp", record.whatsapp],
    ["Country", record.country], ["Product", record.product], ["Industry", record.industry],
    ["Source page", record.sourcePage], ["Attachment", record.attachment?.name],
    ["Message", record.payload?.projectDescription || record.payload?.message]
  ];
  return `<h1>New Cowinmagnet.co.za website enquiry</h1><p>Submitted through <strong>cowinmagnet.co.za</strong>.</p>
    <table>${details.map(([label, value]) => `<tr><th align="left">${label}</th><td>${escapeHtml(value || "—")}</td></tr>`).join("")}</table>
    <p><a href="https://cowinmagnet.co.za/admin/?view=forms&amp;enquiry=${encodeURIComponent(record.id)}">Open the enquiry and its attachment in the South Africa admin</a></p>`;
}

function notificationOf(record) {
  const notice = record.notification;
  return notice?.status === "sent" && notice.providerId ? { ...notice, status: "accepted" } : notice;
}

function providerConfig() {
  return {
    apiKey: String(process.env.RESEND_API_KEY || "").trim(),
    from: String(process.env.INQUIRY_NOTIFICATION_FROM || "").trim()
  };
}

export function enquiryMailConfigured() {
  const config = providerConfig();
  return Boolean(config.apiKey && config.from);
}

export function queuedNotification() {
  return { channel: "email", recipient: NOTIFICATION_RECIPIENT, status: "queued", attempts: 0 };
}

function due(value, now) {
  return !value || Date.parse(value) <= now;
}

export function notificationDue(record, now = Date.now()) {
  const notice = notificationOf(record);
  if (!notice || settled(notice)) return false;
  if (notice.providerId) return due(notice.nextReceiptCheckAt, now);
  if (notice.status === "processing") return due(notice.leaseUntil, now);
  if (notice.status === "not_configured") {
    return enquiryMailConfigured();
  }
  return ["queued", "retry_wait"].includes(notice.status) && due(notice.nextAttemptAt, now);
}

async function send(record, config, fetcher) {
  try {
    const result = await fetcher(RESEND_EMAILS, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `cowin-za-enquiry/${record.id}`
      },
      body: JSON.stringify({
        from: config.from,
        to: [NOTIFICATION_RECIPIENT],
        reply_to: record.email,
        subject: `[cowinmagnet.co.za] New website enquiry ${record.id}`,
        html: emailBody(record)
      }),
      signal: AbortSignal.timeout(6000)
    });
    if (!result.ok) {
      const retryable = result.status === 408 || result.status === 409 || result.status === 429 || result.status >= 500;
      return { failure: `provider_http_${result.status}`, retryable, uncertain: retryable && result.status !== 429 };
    }
    const receipt = await result.json().catch(() => null);
    if (typeof receipt?.id !== "string" || !receipt.id.trim()) {
      return { failure: "provider_response_without_id", retryable: true, uncertain: true };
    }
    return { providerId: receipt.id };
  } catch {
    return { failure: "provider_request_interrupted", retryable: true, uncertain: true };
  }
}

const deliveryEvents = new Map([
  ["sent", "accepted"], ["queued", "accepted"], ["scheduled", "accepted"],
  ["delivery_delayed", "delivery_delayed"], ["delivered", "delivered"],
  ["opened", "delivered"], ["clicked", "delivered"], ["bounced", "bounced"],
  ["complained", "complained"], ["canceled", "cancelled"], ["cancelled", "cancelled"],
  ["failed", "failed"], ["suppressed", "failed"]
]);

async function refreshReceipt(pool, id, notice, config, fetcher) {
  const checkedAt = new Date().toISOString();
  let event;
  let receiptError;
  try {
    if (!config.apiKey) {
      receiptError = "provider_not_configured";
    } else {
      const result = await fetcher(`${RESEND_EMAILS}/${encodeURIComponent(notice.providerId)}`, {
        headers: { Authorization: `Bearer ${config.apiKey}` }, signal: AbortSignal.timeout(6000)
      });
      if (!result.ok) receiptError = `provider_http_${result.status}`;
      else {
        event = (await result.json()).last_event;
        if (!deliveryEvents.has(event)) receiptError = "provider_status_unavailable";
      }
    }
  } catch {
    receiptError = "receipt_check_interrupted";
  }
  const updated = await updateEnquiry(pool, id, (record) => {
    const current = notificationOf(record);
    if (current?.providerId !== notice.providerId || settled(current)) return null;
    return { ...record, notification: {
      ...current,
      status: deliveryEvents.get(event) || current.status,
      providerEvent: deliveryEvents.has(event) ? event : current.providerEvent,
      receiptCheckedAt: checkedAt,
      nextReceiptCheckAt: new Date(Date.parse(checkedAt) + DAY_MS).toISOString(),
      receiptError: receiptError || null
    } };
  });
  return updated?.record.notification || notice;
}

export async function processEnquiryNotification(pool, id, { manual = false, fetcher = fetch } = {}) {
  const now = Date.now();
  const at = new Date(now).toISOString();
  const lease = randomUUID();
  const config = providerConfig();
  const claimed = await updateEnquiry(pool, id, (record) => {
    const previous = notificationOf(record);
    if (!previous || previous.providerId || settled(previous)) return null;
    const manualRetry = manual && ["retry_wait", "not_configured", "failed"].includes(previous.status);
    if (!notificationDue(record, now) && !manualRetry) return null;
    if (!config.apiKey || !config.from) return { ...record, notification: { ...previous, status: "not_configured" } };
    const interrupted = previous.uncertain || previous.status === "processing";
    if (interrupted && now - Date.parse(previous.firstAttemptAt) >= DAY_MS - 60_000) {
      return { ...record, notification: { ...previous, status: "needs_review", uncertain: true } };
    }
    if (previous.attempts >= MAX_ATTEMPTS && !manual) {
      return { ...record, notification: { ...previous, status: interrupted ? "needs_review" : "failed", uncertain: interrupted } };
    }
    return { ...record, notification: {
      ...previous, status: "processing", lease, firstAttemptAt: previous.firstAttemptAt || at,
      attemptedAt: at, attempts: Number(previous.attempts || 0) + 1, uncertain: Boolean(interrupted),
      leaseUntil: new Date(now + 60_000).toISOString()
    } };
  });
  if (!claimed) return null;
  const notice = notificationOf(claimed.record);
  if (notice?.providerId && !settled(notice) && (manual || due(notice.nextReceiptCheckAt, now))) {
    return refreshReceipt(pool, id, notice, config, fetcher);
  }
  if (notice?.lease !== lease) return notice;
  let sent = await send(claimed.record, config, fetcher);
  const mayHaveSent = notice.uncertain || sent.uncertain;
  if (sent.uncertain) sent = await send(claimed.record, config, fetcher);
  const saved = await updateEnquiry(pool, id, (record) => {
    const current = record.notification;
    if (current?.lease !== lease) return null;
    const updated = { ...current, lease: null, leaseUntil: null };
    if (sent.providerId) {
      Object.assign(updated, { status: "accepted", providerId: sent.providerId, acceptedAt: new Date().toISOString(), error: null, uncertain: false });
    } else {
      const uncertain = Boolean(mayHaveSent || sent.uncertain);
      const retry = sent.retryable && current.attempts < MAX_ATTEMPTS;
      Object.assign(updated, {
        status: retry ? "retry_wait" : uncertain ? "needs_review" : "failed",
        nextAttemptAt: retry ? new Date(Date.now() + 15 * 60_000).toISOString() : null,
        error: sent.failure, uncertain
      });
    }
    return { ...record, notification: updated };
  });
  return saved?.record.notification;
}
