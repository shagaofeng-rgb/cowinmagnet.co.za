import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import pg from "pg";

const origin = new URL(process.env.ZA_TEST_SITE || "http://127.0.0.1:4091");
const database = new URL(process.env.DATABASE_URL);
assert.match(origin.hostname, /^(localhost|127\.0\.0\.1)$/);
assert.match(database.hostname, /^(localhost|127\.0\.0\.1)$/);
assert.equal(database.pathname, "/cowin_za_qa");
const pool = new pg.Pool({ connectionString: database.toString(), ssl: false });
const fixture = randomUUID().slice(0, 8);
const request = (path, options) => fetch(new URL(path, origin), { ...options, signal: AbortSignal.timeout(30_000) });
const write = (body, method = "POST", headers = {}) => ({ method, headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
async function check(response, status = 200) {
  const json = await response.json();
  assert.equal(response.status, status, JSON.stringify(json).slice(0, 250));
  if (status < 400) assert.equal(json.success, true);
  return json.data;
}
async function login(email, password) {
  const res = await request("/api/login/", write({ email, password }));
  const cookie = res.headers.get("set-cookie")?.split(";")[0];
  const { csrf } = await check(res);
  return { cookie, "x-csrf-token": csrf };
}
const assertEventually = async (read, predicate) => {
  for (let i = 0; i < 40; i++) {
    const value = await read();
    if (predicate(value)) return value;
    await delay(150);
  }
  assert.fail("Expected asynchronous write did not finish");
};

try {
  const admin = await login("release-qa@example.invalid", "za-release-fixture-only");
  const session = await check(await request("/api/session/", { headers: admin }));
  assert.deepEqual(session.permissions, ["*"]);
  const analytics = "/api/admin/analytics/?includeVisitors=0&";
  await check(await request(analytics + "range=today", { headers: admin }));
  const marker = "/qa-release-" + fixture + "/";
  for (const [index, time, excluded] of [
    [0, "2026-11-01T21:59:59.999Z", false], [1, "2026-11-01T22:00:00.000Z", false],
    [2, "2026-11-02T21:59:59.999Z", false], [3, "2026-11-02T22:00:00.000Z", false],
    [4, "2026-11-02T13:00:00.000Z", true]
  ]) {
    await pool.query("INSERT INTO analytics_events (id, visitor_id, session_id, event_type, page_path, occurred_at, country, channel, source, is_test) VALUES ($1,$2,$3,'pageview',$4,$5,'ZA','Organic Search','google',$6)",
      [fixture + "-" + index, "V-" + fixture, "S-" + fixture, marker, time, excluded]);
  }
  const ranged = async (query, expected = 200) => check(await request(analytics + query + "&pagePath=" + marker, { headers: admin }), expected);
  const day = await ranged("range=custom&from=2026-11-02&to=2026-11-02&country=za");
  assert.equal(day.timezone, "Africa/Johannesburg");
  assert.equal(day.pv, 2);
  assert.equal(day.timeline.length, 2);
  assert.deepEqual(day.sources, [{ source: "google", pv: 2, uv: 1 }]);
  assert.equal((await ranged("range=custom&from=2026-11-02&to=2026-11-03")).pv, 3);
  assert.equal((await ranged("range=custom&from=2026-11-04&to=2026-11-04")).pv, 0);
  await ranged("range=custom&from=2026-11-04&to=2026-11-02", 400);
  await ranged("range=custom&from=2026-02-30&to=2026-03-01", 400);
  for (const range of ["7d", "15d", "week", "month", "all"]) await ranged("range=" + range);
  console.log("OK: SAST date boundaries, exclusions, breakdowns, empty and invalid ranges");

  const payload = { name: "QA " + fixture, company: "Isolated fixture", country: "ZA", productRequired: "Wet Drum Magnetic Separator", sourcePage: "https://cowinmagnet.co.za/en-za/request-a-quote/", projectDescription: "Test only" };
  const emailA = fixture + "@example.invalid";
  const attachment = Buffer.alloc(8 * 1024 * 1024, 32);
  attachment.write("%PDF-1.7\n");
  attachment.write("\n%%EOF\n", attachment.length - 7);
  const openUpload = (name, size) => request("/api/enquiry-uploads/", write({ name, size }));
  const upload = await check(await openUpload("QA 8 MB drawing.pdf", attachment.length), 201);
  await check(await openUpload("over-limit.pdf", attachment.length + 1), 413);
  await check(await openUpload("wrong.exe", 100), 400);
  const part = (upload, index, body, token = upload.token) => request("/api/enquiry-uploads/" + upload.id + "/" + index + "/", {
    method: "POST", headers: { "content-type": "application/octet-stream", "x-enquiry-upload-token": token }, body
  });
  await check(await part(upload, 0, attachment.subarray(0, upload.partBytes), "A".repeat(43)), 404);
  await check(await part(upload, 0, Buffer.alloc(upload.partBytes, 1)), 415);
  await check(await part(upload, 0, Buffer.alloc(10, 1)), 400);
  const send = (body) => request("/api/enquiries/", write({ ...payload, ...body }));
  const submissionA = { email: emailA, submissionId: randomUUID(), attachmentUpload: { id: upload.id, token: upload.token } };
  await check(await send(submissionA), 409);
  for (let i = 0; i < attachment.length / upload.partBytes; i++) {
    await check(await part(upload, i, attachment.subarray(i * upload.partBytes, (i + 1) * upload.partBytes)));
  }
  const submissionB = { email: "retry@example.invalid", submissionId: randomUUID(), name: "QA retry " + fixture };
  const [a, b, replay] = await Promise.all([send(submissionA), send(submissionB), send(submissionA)]).then((responses) => Promise.all(responses.map((res) => check(res))));
  assert.equal(a.id, replay.id);
  assert.notEqual(a.id, b.id);
  await check(await send({ ...submissionA, submissionId: randomUUID() }), 404);
  const lead = (id) => checkRequest("/api/admin/enquiries/" + id + "/", admin);
  async function checkRequest(path, headers) { return check(await request(path, { headers })); }
  const recordA = await assertEventually(() => lead(a.id), (res) => res.enquiry.notification.status === "accepted");
  const recordB = await assertEventually(() => lead(b.id), (res) => res.enquiry.notification.status === "retry_wait");
  assert.equal(recordA.enquiry.attachment.size, attachment.length);
  assert.equal(recordB.enquiry.notification.attempts, 1);
  const receipt = async (id) => check(await request("/api/admin/enquiries/" + id + "/notification/", { method: "POST", headers: admin }));
  const [receipts] = await Promise.all([
    Promise.all([receipt(b.id), receipt(b.id)]),
    Promise.all(["QA note one", "QA note two"].map(async (note) => check(await request("/api/admin/enquiries/" + b.id + "/", write({ note }, "PUT", admin)))))
  ]);
  assert(receipts.some((row) => row.status === "accepted"));
  assert.equal((await receipt(a.id)).status, "delivered");
  assert.equal((await receipt(b.id)).status, "delivered");
  assert.equal((await lead(b.id)).enquiry.internalNotes.length, 2);
  const href = "/api/admin/enquiries/" + a.id + "/attachments/" + upload.id + "/";
  await check(await request(href), 401);
  const file = await request(href, { headers: admin });
  assert(file.ok, "attachment downloads only after authentication");
  assert.match(file.headers.get("content-disposition"), /attachment; filename\*=UTF-8/);
  const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
  assert.equal(hash(Buffer.from(await file.arrayBuffer())), hash(attachment));
  const adminList = await checkRequest("/api/admin/enquiries/?q=" + fixture, admin);
  assert.equal(adminList.total, 2);
  console.log("OK: full 8 MiB private file, wrong format, token and replay protection, concurrent writes, two notes, provider retry and delivery receipt");

  await check(await request("/api/admin/users/", write({ email: "qa-viewer@example.invalid", name: "QA Viewer", role: "Viewer" }, "POST", admin)));
  const viewer = await login("qa-viewer@example.invalid", "viewer-fixture-only");
  await checkRequest("/api/admin/analytics/?range=today", viewer);
  await check(await request("/api/admin/enquiries/", { headers: viewer }), 403);
  await check(await request(href, { headers: viewer }), 403);
  await check(await request("/api/admin/enquiries/export/", { headers: viewer }), 403);
  await check(await request("/api/admin/settings/", { headers: viewer }), 403);
  await check(await request("/api/admin/enquiries/" + a.id + "/", write({ note: "Blocked" }, "PUT", viewer)), 403);
  await check(await request("/api/admin/enquiries/" + a.id + "/", write({ note: "Blocked" }, "PUT", { cookie: admin.cookie })), 403);
  console.log("OK: configured staff role, private downloads, CSV and CSRF");

  const slug = "wet-drum-magnetic-separator";
  const path = "/en-za/products/magnetic-separation-equipment/" + slug + "/";
  const endpoint = "/api/admin/products/" + slug;
  const live = async () => (await request(path)).text();
  const current = await checkRequest(endpoint, admin);
  const shortDescription = "QA " + fixture + " editorial draft. This is isolated test copy.";
  const draft = await check(await request(endpoint, write({ fields: { shortDescription }, revision: current.revision || "" }, "PUT", admin)));
  assert(!(await live()).includes(shortDescription));
  await check(await request(endpoint, write({ fields: { shortDescription: "stale" }, revision: current.revision || "" }, "PUT", admin)), 409);
  const release = await check(await request(endpoint + "/publish", write({ revision: draft.revision }, "POST", admin)));
  assert((await live()).includes(shortDescription));
  assert((await live()).includes('data-product-revision="' + release.live.revision + '"'));
  console.log("OK: product draft isolation, conflict protection and public release");

  const blogBody = { sign: "qa-blog-fixture", class_id: "blog", title: "ZA QA Blog " + fixture, content: "<p>Isolated publish workflow fixture with sufficient test content.</p><script>alert(1)</script>", image_url: "/assets/images/hero-mining-conveyor-magnet.webp" };
  const blog = await request("/api/webhook/send_article", write(blogBody));
  assert.equal((await blog.json()).code, 1);
  const blogSlug = "/en-za/blog/za-qa-blog-" + fixture + "/";
  const published = await request(blogSlug);
  assert.equal(published.status, 200);
  const html = await published.text();
  assert(html.includes("Isolated publish workflow"));
  assert(!html.includes("<script>alert(1)</script>"));
  const sync = await checkRequest("/api/admin/sync/", admin);
  assert(sync.sources.find((row) => row.id === "storage").lastSync);
  assert(sync.sources.find((row) => row.id === "blog").lastSync);
  assert((await checkRequest("/api/admin/seo/", admin)).total >= 87);
  console.log("OK: third-party Blog persists and renders, data and SEO status backed by real records");
  console.log(JSON.stringify({ inquiryForBrowser: a.id, fixture }));
} finally {
  await pool.end();
}
