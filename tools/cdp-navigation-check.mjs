const [url] = process.argv.slice(2);
if (!url) throw new Error("Usage: node tools/cdp-navigation-check.mjs <url>");

const target = await fetch(`http://localhost:9223/json/new?${encodeURIComponent(url)}`, { method: "PUT" }).then((response) => response.json());
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});

let id = 0;
const pending = new Map();
socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    pending.get(message.id)(message);
    pending.delete(message.id);
  }
});
const command = (method, params = {}) => new Promise((resolve, reject) => {
  const commandId = ++id;
  pending.set(commandId, (message) => message.error ? reject(new Error(message.error.message)) : resolve(message.result));
  socket.send(JSON.stringify({ id: commandId, method, params }));
});
const evaluate = async (expression) => {
  const result = await command("Runtime.evaluate", { expression, returnByValue: true });
  return result.result.value;
};

await command("Page.enable");
await command("Runtime.enable");
await command("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, screenWidth: 390, screenHeight: 844, deviceScaleFactor: 1, mobile: true });
await command("Page.navigate", { url });
await new Promise((resolve) => setTimeout(resolve, 900));

const mobile = await evaluate(`(() => {
  const button = document.querySelector('[data-mobile-toggle]');
  const panel = document.querySelector('[data-mobile-panel]');
  const products = panel?.querySelector('a[href="/en-za/products/"]');
  button?.click();
  const opened = button?.getAttribute('aria-expanded') === 'true' && !panel?.hasAttribute('hidden');
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  const closed = button?.getAttribute('aria-expanded') === 'false' && panel?.hasAttribute('hidden');
  return { directProductsHref: products?.getAttribute('href') || null, opened, closed };
})()`);

await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, screenWidth: 1440, screenHeight: 900, deviceScaleFactor: 1, mobile: false });
await command("Page.navigate", { url });
await new Promise((resolve) => setTimeout(resolve, 900));
const desktop = await evaluate(`(() => {
  const link = document.querySelector('.desktop-nav a[href="/en-za/products/"]');
  const button = document.querySelector('[data-mega-button][aria-controls="mega-products"]');
  const panel = document.getElementById('mega-products');
  button?.click();
  const opened = button?.getAttribute('aria-expanded') === 'true' && !panel?.hasAttribute('hidden');
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  return { directProductsHref: link?.getAttribute('href') || null, opened, closed: panel?.hasAttribute('hidden') === true };
})()`);

socket.close();
const result = { url, mobile, desktop, passed: mobile.directProductsHref === '/en-za/products/' && mobile.opened && mobile.closed && desktop.directProductsHref === '/en-za/products/' && desktop.opened && desktop.closed };
console.log(JSON.stringify(result, null, 2));
if (!result.passed) process.exitCode = 1;
