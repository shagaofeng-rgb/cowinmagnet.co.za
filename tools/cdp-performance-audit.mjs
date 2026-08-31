import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const origin = (process.argv.find((item) => item.startsWith("--origin="))?.slice(9) || "http://127.0.0.1:3000").replace(/\/$/, "");
const output = process.argv.find((item) => item.startsWith("--output="))?.slice(9) || "reports/performance-audit.json";
const paths = [
  "/en-za/",
  "/en-za/products/",
  "/en-za/products/magnetic-separation-equipment/suspended-permanent-magnetic-separator/",
  "/en-za/news/",
  "/en-za/request-a-quote/"
];

async function inspect(path) {
  const url = `${origin}${path}`;
  const target = await fetch(`http://127.0.0.1:9223/json/new?${encodeURIComponent(url)}`, { method: "PUT" }).then((response) => response.json());
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  let commandId = 0;
  const pending = new Map();
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      pending.get(message.id)(message);
      pending.delete(message.id);
    }
  });
  const command = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++commandId;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Timed out: ${method}`));
    }, 20_000);
    pending.set(id, (message) => {
      clearTimeout(timer);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
    });
    socket.send(JSON.stringify({ id, method, params }));
  });

  await command("Page.enable");
  await command("Network.enable");
  await command("Network.setCacheDisabled", { cacheDisabled: true });
  await command("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await command("Page.navigate", { url });
  await new Promise((resolve) => setTimeout(resolve, 2_500));
  const result = await command("Runtime.evaluate", {
    expression: `JSON.stringify((() => {
      const navigation = performance.getEntriesByType('navigation')[0];
      const resources = performance.getEntriesByType('resource');
      const bytes = (entries) => Math.round(entries.reduce((sum, entry) => sum + (entry.transferSize || entry.encodedBodySize || 0), 0));
      const byType = Object.fromEntries([...new Set(resources.map((entry) => entry.initiatorType))].map((type) => [type, { count: resources.filter((entry) => entry.initiatorType === type).length, transferBytes: bytes(resources.filter((entry) => entry.initiatorType === type)) }]));
      return {
        finalUrl: location.href,
        statusHint: navigation?.responseStatus || null,
        domContentLoadedMs: Math.round(navigation?.domContentLoadedEventEnd || 0),
        loadMs: Math.round(navigation?.loadEventEnd || 0),
        documentTransferBytes: Math.round(navigation?.transferSize || navigation?.encodedBodySize || 0),
        resourceCount: resources.length,
        resourceTransferBytes: bytes(resources),
        byType,
        largestResources: resources.map((entry) => ({ name: entry.name, type: entry.initiatorType, transferBytes: Math.round(entry.transferSize || entry.encodedBodySize || 0) })).sort((a, b) => b.transferBytes - a.transferBytes).slice(0, 5)
      };
    })())`,
    returnByValue: true
  });
  socket.close();
  return { path, ...JSON.parse(result.result.value) };
}

const pages = [];
for (const path of paths) pages.push(await inspect(path));
const report = {
  generatedAt: new Date().toISOString(),
  origin,
  scope: "Headless Chrome mobile lab snapshot; transfer sizes may reflect local or browser cache and are not field Core Web Vitals.",
  pages
};
const outputPath = join(process.cwd(), output);
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ output, pages: pages.map(({ path, loadMs, resourceCount, resourceTransferBytes }) => ({ path, loadMs, resourceCount, resourceTransferBytes })) }, null, 2));
