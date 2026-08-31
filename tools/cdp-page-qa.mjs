import { writeFile } from "node:fs/promises";

const [url, width = "1440", height = "1000", screenshotPath, captureMode = "full"] = process.argv.slice(2);
if (!url || !screenshotPath) throw new Error("Usage: node tools/cdp-page-qa.mjs <url> <width> <height> <screenshotPath>");

const target = await fetch(`http://localhost:9223/json/new?${encodeURIComponent(url)}`, { method: "PUT" }).then((response) => response.json());
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});
let id = 0;
const pending = new Map();
const errors = [];
socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (message.method === "Runtime.exceptionThrown") errors.push(message.params.exceptionDetails.text || "Runtime exception");
  if (message.id && pending.has(message.id)) {
    pending.get(message.id)(message);
    pending.delete(message.id);
  }
});
const command = (method, params = {}) => new Promise((resolve, reject) => {
  const commandId = ++id;
  const timeout = setTimeout(() => {
    pending.delete(commandId);
    reject(new Error(`Timed out: ${method}`));
  }, 15000);
  pending.set(commandId, (message) => {
    clearTimeout(timeout);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result);
  });
  socket.send(JSON.stringify({ id: commandId, method, params }));
});

await command("Page.enable");
await command("Runtime.enable");
await command("Emulation.setDeviceMetricsOverride", { width: Number(width), height: Number(height), screenWidth: Number(width), screenHeight: Number(height), deviceScaleFactor: 1, mobile: Number(width) <= 760 });
await command("Page.navigate", { url });
await new Promise((resolve) => setTimeout(resolve, 1800));
await command("Runtime.evaluate", {
  expression: `Promise.all([...document.images].map((image) => image.loading === 'lazy' || image.complete ? true : new Promise((resolve) => { image.addEventListener('load', resolve, { once: true }); image.addEventListener('error', resolve, { once: true }); })))`,
  awaitPromise: true,
  returnByValue: true
});
const evaluation = await command("Runtime.evaluate", {
  expression: `JSON.stringify({
    title: document.title,
    url: location.href,
    viewport: { width: innerWidth, height: innerHeight },
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
    wideElements: [...document.querySelectorAll('body *')].map((element) => { const r = element.getBoundingClientRect(); return { tag: element.tagName, className: element.className, left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width) }; }).filter((item) => item.right > innerWidth + 1 || item.left < -1).slice(0, 12),
    brokenImages: [...document.images].filter((image) => image.loading !== 'lazy' && (!image.complete || image.naturalWidth === 0)).map((image) => image.currentSrc || image.src),
    h1: [...document.querySelectorAll('h1')].map((element) => element.textContent.trim()),
    buttons: [...document.querySelectorAll('button, a.button')].filter((element) => { const r = element.getBoundingClientRect(); return r.width < 40 || r.height < 40; }).length,
    heroSecondary: (() => { const element = document.querySelector('.industrial-home-hero .button.secondary'); if (!element) return null; const style = getComputedStyle(element); return { background: style.backgroundColor, color: style.color, borderColor: style.borderColor }; })()
  })`,
  returnByValue: true
});
const inspection = JSON.parse(evaluation.result.value);
const screenshot = await command("Page.captureScreenshot", { format: "png", captureBeyondViewport: captureMode !== "viewport", fromSurface: true });
await writeFile(screenshotPath, Buffer.from(screenshot.data, "base64"));
socket.close();
console.log(JSON.stringify({ ...inspection, horizontalOverflow: Math.max(inspection.documentWidth, inspection.bodyWidth) > inspection.viewport.width + 1, runtimeErrors: errors }, null, 2));
