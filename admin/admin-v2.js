(function () {
  const state = {
    csrf: "",
    user: null,
    view: "dashboard",
    page: {},
    pageSize: 20
  };

  const label = {
    adminTitle: "Cowinmagnet Africa",
    accountLabel: "\u5f53\u524d\u8d26\u53f7",
    viewSite: "\u67e5\u770b\u7f51\u7ad9",
    refresh: "\u5237\u65b0",
    logout: "\u9000\u51fa\u767b\u5f55",
    loading: "\u52a0\u8f7d\u4e2d...",
    search: "\u641c\u7d22",
    reset: "\u6e05\u7a7a",
    exportCsv: "\u5bfc\u51fa CSV",
    save: "\u4fdd\u5b58",
    edit: "\u7f16\u8f91",
    delete: "\u5220\u9664",
    restore: "\u6062\u590d",
    enable: "\u542f\u7528",
    disable: "\u505c\u7528",
    manualSync: "\u624b\u52a8\u540c\u6b65"
  };

  const titles = {
    dashboard: ["\u6570\u636e\u6982\u89c8", "\u7f51\u7ad9\u6570\u636e\u603b\u89c8", "\u67e5\u770b\u8bbf\u95ee\u3001\u4ea7\u54c1\u3001\u8be2\u76d8\u3001SEO \u4e0e\u540c\u6b65\u72b6\u6001\u3002"],
    categories: ["\u4ea7\u54c1\u5206\u7c7b", "\u4ea7\u54c1\u5206\u7c7b\u7ba1\u7406", "\u7ba1\u7406\u5206\u7c7b\u5c42\u7ea7\u3001\u6392\u5e8f\u3001\u542f\u7528\u72b6\u6001\u548c SEO \u4fe1\u606f\u3002"],
    products: ["\u4ea7\u54c1\u7ba1\u7406", "\u4ea7\u54c1\u5185\u5bb9\u7ba1\u7406", "\u67e5\u770b\u4e3b\u7ad9\u540c\u6b65\u7684\u4ea7\u54c1\u3001\u56fe\u7247\u3001\u5206\u7c7b\u548c SEO \u5b57\u6bb5\u3002"],
    news: ["\u65b0\u95fb\u7ba1\u7406", "\u65b0\u95fb\u4e0e\u535a\u5ba2\u7ba1\u7406", "\u7ba1\u7406\u65b0\u95fb\u3001\u672c\u5730\u5185\u5bb9\u3001\u53d1\u5e03\u72b6\u6001\u548c\u540c\u6b65\u4efb\u52a1\u3002"],
    forms: ["\u5ba2\u6237\u8868\u5355", "\u5ba2\u6237\u8be2\u76d8\u7ba1\u7406", "\u67e5\u770b\u3001\u5206\u7c7b\u3001\u8ddf\u8fdb\u548c\u5bfc\u51fa\u5ba2\u6237\u8868\u5355\u3002"],
    analytics: ["\u8bbf\u95ee\u5206\u6790", "\u7f51\u7ad9\u8bbf\u95ee\u5206\u6790", "\u6309\u9875\u9762\u3001\u6765\u6e90\u3001\u56fd\u5bb6\u3001\u8bbe\u5907\u548c\u8def\u5f84\u67e5\u770b\u8bbf\u95ee\u8868\u73b0\u3002"],
    seo: ["SEO \u6570\u636e", "SEO \u6570\u636e\u4e0e\u95ee\u9898\u68c0\u67e5", "\u68c0\u67e5\u7ad9\u5185 SEO\uff0c\u5e76\u540c\u6b65 Google Search Console \u6570\u636e\u3002"],
    media: ["\u5a92\u4f53\u5e93", "\u5a92\u4f53\u8d44\u4ea7\u7ba1\u7406", "\u767b\u8bb0\u56fe\u7247\u3001PDF\u3001\u89c6\u9891\u548c\u4f7f\u7528\u4f4d\u7f6e\u3002"],
    users: ["\u7528\u6237\u4e0e\u6743\u9650", "\u7528\u6237\u4e0e\u89d2\u8272\u6743\u9650", "\u7ef4\u62a4\u540e\u53f0\u8d26\u53f7\u3001\u89d2\u8272\u548c\u6743\u9650\u6570\u636e\u7ed3\u6784\u3002"],
    sync: ["\u6570\u636e\u540c\u6b65", "\u6570\u636e\u540c\u6b65\u4e2d\u5fc3", "\u67e5\u770b\u5916\u90e8\u6570\u636e\u6e90\u3001\u540c\u6b65\u4efb\u52a1\u548c\u624b\u52a8\u540c\u6b65\u5165\u53e3\u3002"],
    logs: ["\u64cd\u4f5c\u65e5\u5fd7", "\u540e\u53f0\u64cd\u4f5c\u5ba1\u8ba1", "\u67e5\u770b\u767b\u5f55\u3001\u7f16\u8f91\u3001\u5bfc\u51fa\u3001\u540c\u6b65\u7b49\u5173\u952e\u64cd\u4f5c\u8bb0\u5f55\u3002"],
    settings: ["\u7cfb\u7edf\u8bbe\u7f6e", "\u7cfb\u7edf\u8bbe\u7f6e", "\u7ef4\u62a4\u7ad9\u70b9\u3001\u8bed\u8a00\u3001\u65f6\u533a\u3001\u5e02\u573a\u548c\u540c\u6b65\u914d\u7f6e\u3002"]
  };

  const qs = (selector, root = document) => root.querySelector(selector);
  const qsa = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));

  function setStatus(message, type = "success") {
    const node = qs("[data-status]");
    if (!node) return;
    node.textContent = message;
    node.className = `notice ${type}`;
    if (message) setTimeout(() => { node.textContent = ""; node.className = "notice"; }, 4500);
  }

  async function api(url, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (options.body && !headers["content-type"]) headers["content-type"] = "application/json";
    if (!["GET", "HEAD"].includes(String(options.method || "GET").toUpperCase()) && state.csrf) headers["x-csrf-token"] = state.csrf;
    const response = await fetch(url, { ...options, headers, credentials: "same-origin" });
    const json = await response.json().catch(() => ({}));
    if (!response.ok || json.success === false) throw new Error(json.error || `HTTP ${response.status}`);
    return json.data ?? json;
  }

  function localizeShell() {
    Object.entries(label).forEach(([key, value]) => {
      qsa(`[data-i18n="${key}"]`).forEach((node) => { node.textContent = value; });
    });
    qs("[data-refresh]").textContent = label.refresh;
    qs("[data-logout]").textContent = label.logout;
    Object.entries(titles).forEach(([view, value]) => {
      const button = qs(`[data-view="${view}"]`);
      if (button) button.textContent = value[0];
    });
  }

  function activate(view) {
    state.view = view;
    const info = titles[view] || titles.dashboard;
    qs("[data-section-kicker]").textContent = "Cowinmagnet Africa";
    qs("[data-section-title]").textContent = info[1];
    qs("[data-section-desc]").textContent = info[2];
    qsa("[data-view]").forEach((button) => button.classList.toggle("active", button.dataset.view === view));
    qsa("[data-panel]").forEach((panel) => panel.classList.toggle("active", panel.dataset.panel === view));
    const loader = loaders[view] || loaders.dashboard;
    loader().catch((error) => setStatus(error.message, "error"));
  }

  function card(title, body) {
    return `<div class="section-card"><h2>${esc(title)}</h2>${body}</div>`;
  }

  function metrics(items) {
    return `<div class="metric-grid">${items.map((item) => `<article class="metric-card"><span>${esc(item.label)}</span><strong>${esc(item.value)}</strong><small>${esc(item.note || "")}</small></article>`).join("")}</div>`;
  }

  function toolbar(key, filters = "") {
    return `<div class="toolbar compact" data-toolbar="${key}">
      <input data-q placeholder="\u5173\u952e\u8bcd / \u540d\u79f0 / URL">
      ${filters}
      <button class="button secondary" data-search>${label.search}</button>
      <button class="button secondary" data-reset>${label.reset}</button>
    </div>`;
  }

  function query(key) {
    const bar = qs(`[data-toolbar="${key}"]`);
    const params = new URLSearchParams();
    params.set("page", state.page[key] || 1);
    params.set("pageSize", state.pageSize);
    if (bar?.querySelector("[data-q]")?.value) params.set("q", bar.querySelector("[data-q]").value.trim());
    if (bar?.querySelector("[data-status]")?.value) params.set("status", bar.querySelector("[data-status]").value);
    return params.toString();
  }

  function bindToolbar(panel, key, load) {
    qs("[data-search]", panel)?.addEventListener("click", () => { state.page[key] = 1; load(); });
    qs("[data-reset]", panel)?.addEventListener("click", () => {
      qsa("input,select", qs(`[data-toolbar="${key}"]`, panel)).forEach((node) => { node.value = ""; });
      state.page[key] = 1;
      load();
    });
  }

  function bindPager(panel, key, load) {
    qsa("[data-page]", panel).forEach((button) => button.addEventListener("click", () => {
      state.page[key] = Number(button.dataset.page);
      load();
    }));
  }

  function pager(data, key) {
    const page = data.page || 1;
    const pages = data.pages || 1;
    return `<div class="pager"><button class="button secondary" data-page="${Math.max(1, page - 1)}" ${page <= 1 ? "disabled" : ""}>\u4e0a\u4e00\u9875</button><span>${page} / ${pages} · ${data.total || 0}</span><button class="button secondary" data-page="${Math.min(pages, page + 1)}" ${page >= pages ? "disabled" : ""}>\u4e0b\u4e00\u9875</button></div>`;
  }

  function table(rows, fields, empty = "\u6682\u65e0\u6570\u636e") {
    if (!rows?.length) return `<p>${empty}</p>`;
    return `<div class="table-wrap"><table><thead><tr>${fields.map((field) => `<th>${esc(field.label)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${fields.map((field) => `<td>${esc(typeof field.value === "function" ? field.value(row) : row[field.value])}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  }

  async function dashboard() {
    const panel = qs("[data-panel='dashboard']");
    panel.innerHTML = card(label.loading, "");
    const [data, sync] = await Promise.all([api("/api/admin/dashboard"), api("/api/admin/sync")]);
    panel.innerHTML = [
      metrics([
        { label: "PV", value: data.pv || 0, note: "\u9875\u9762\u8bbf\u95ee" },
        { label: "UV", value: data.uv || 0, note: "\u72ec\u7acb\u8bbf\u5ba2" },
        { label: "\u4ea7\u54c1", value: data.products || 0, note: "\u5df2\u540c\u6b65\u4ea7\u54c1" },
        { label: "\u8be2\u76d8", value: data.unreadEnquiries || 0, note: "\u672a\u5904\u7406\u8868\u5355" },
        { label: "\u5b58\u50a8", value: data.storageMode || "-", note: "\u5f53\u524d\u6570\u636e\u6a21\u5f0f" }
      ]),
      card("\u6700\u8fd1\u8bbf\u5ba2", table(data.recentVisitors || [], [{ label: "\u65f6\u95f4", value: "time" }, { label: "\u56fd\u5bb6", value: "country" }, { label: "\u9875\u9762", value: "page" }, { label: "\u6765\u6e90", value: "source" }])),
      card("\u540c\u6b65\u72b6\u6001", table(sync.sources || [], [{ label: "\u6570\u636e\u6e90", value: "name" }, { label: "\u72b6\u6001", value: "status" }, { label: "\u6700\u8fd1\u540c\u6b65", value: "lastSync" }, { label: "\u6210\u529f/\u5931\u8d25", value: (row) => `${row.successCount || 0}/${row.failedCount || 0}` }]))
    ].join("");
  }

  async function categories() {
    const key = "categories";
    const panel = qs("[data-panel='categories']");
    panel.innerHTML = card("\u4ea7\u54c1\u5206\u7c7b", `${toolbar(key, `<select data-status><option value="">\u5168\u90e8\u72b6\u6001</option><option value="active">Active</option><option value="disabled">Disabled</option></select>`)}<div class="actions"><a class="button secondary" href="/api/admin/categories/export">${label.exportCsv}</a></div><div data-list>${label.loading}</div>`);
    const load = async () => {
      const data = await api(`/api/admin/categories?${query(key)}`);
      qs("[data-list]", panel).innerHTML = table(data.items || [], [{ label: "\u540d\u79f0", value: (row) => row.name || row.title }, { label: "Slug", value: "slug" }, { label: "\u72b6\u6001", value: "status" }, { label: "\u6392\u5e8f", value: "sortOrder" }, { label: "\u66f4\u65b0", value: "updatedAt" }]) + pager(data, key);
      bindPager(panel, key, load);
    };
    bindToolbar(panel, key, load);
    await load();
  }

  async function products() {
    const key = "products";
    const panel = qs("[data-panel='products']");
    panel.innerHTML = card("\u4ea7\u54c1\u5217\u8868", `${toolbar(key)}<div class="actions"><a class="button secondary" href="/api/admin/products/export">${label.exportCsv}</a></div><div data-list>${label.loading}</div>`);
    const load = async () => {
      const data = await api(`/api/admin/products?${query(key)}`);
      qs("[data-list]", panel).innerHTML = table(data.items || [], [{ label: "\u4ea7\u54c1", value: (row) => row.name || row.title }, { label: "\u5206\u7c7b", value: (row) => row.category || row.categoryName || row.categorySlug }, { label: "Slug", value: "slug" }, { label: "SEO Title", value: "seoTitle" }, { label: "\u56fe\u7247", value: (row) => row.image || row.featuredImage }]) + pager(data, key);
      bindPager(panel, key, load);
    };
    bindToolbar(panel, key, load);
    await load();
  }

  async function news() {
    const key = "news";
    const panel = qs("[data-panel='news']");
    panel.innerHTML = card("\u65b0\u95fb\u5185\u5bb9", `${toolbar(key, `<select data-status><option value="">\u5168\u90e8</option><option value="published">Published</option><option value="draft">Draft</option></select>`)}<div class="actions"><button class="button primary" data-news-sync>${label.manualSync}</button><a class="button secondary" href="/api/admin/news/export">${label.exportCsv}</a></div><div data-list>${label.loading}</div>`);
    const load = async () => {
      const data = await api(`/api/admin/news?${query(key)}`);
      qs("[data-list]", panel).innerHTML = table(data.items || [], [{ label: "\u6807\u9898", value: "title" }, { label: "\u5206\u7c7b", value: "category" }, { label: "\u72b6\u6001", value: "status" }, { label: "\u65e5\u671f", value: (row) => row.date || row.publishedAt }, { label: "Slug", value: "slug" }]) + pager(data, key);
      bindPager(panel, key, load);
    };
    qs("[data-news-sync]", panel).addEventListener("click", async () => { await api("/api/admin/sync/news", { method: "POST" }); setStatus("\u65b0\u95fb\u540c\u6b65\u4efb\u52a1\u5df2\u6267\u884c"); await load(); });
    bindToolbar(panel, key, load);
    await load();
  }

  async function forms() {
    const key = "forms";
    const panel = qs("[data-panel='forms']");
    panel.innerHTML = card("\u5ba2\u6237\u8868\u5355", `${toolbar(key, `<select data-status><option value="">\u5168\u90e8</option><option value="New">New</option><option value="In Progress">In Progress</option><option value="Closed">Closed</option></select>`)}<div class="actions"><a class="button secondary" href="/api/admin/enquiries/export">${label.exportCsv}</a></div><div data-list>${label.loading}</div>`);
    const load = async () => {
      const data = await api(`/api/admin/enquiries?${query(key)}`);
      qs("[data-list]", panel).innerHTML = table(data.items || [], [{ label: "\u65f6\u95f4", value: "createdAt" }, { label: "\u59d3\u540d", value: "name" }, { label: "\u90ae\u7bb1", value: "email" }, { label: "\u4ea7\u54c1", value: "product" }, { label: "\u72b6\u6001", value: "status" }]) + pager(data, key);
      bindPager(panel, key, load);
    };
    bindToolbar(panel, key, load);
    await load();
  }

  async function analytics() {
    const data = await api("/api/admin/analytics");
    qs("[data-panel='analytics']").innerHTML = metrics([
      { label: "PV", value: data.pv || 0 },
      { label: "UV", value: data.uv || 0 },
      { label: "\u8bbf\u5ba2", value: data.visitors?.length || 0 },
      { label: "\u6700\u8fd1\u540c\u6b65", value: data.lastSync || "-" }
    ]) + card("\u70ed\u95e8\u9875\u9762", table(data.pages || [], [{ label: "\u9875\u9762", value: "page" }, { label: "PV", value: "pv" }, { label: "UV", value: "uv" }])) + card("\u6765\u6e90\u6e20\u9053", table(data.sources || [], [{ label: "\u6765\u6e90", value: "source" }, { label: "PV", value: "pv" }, { label: "UV", value: "uv" }]));
  }

  async function seo() {
    const [seoData, google] = await Promise.all([api("/api/admin/seo"), api("/api/admin/google-seo")]);
    qs("[data-panel='seo']").innerHTML = metrics([
      { label: "\u9875\u9762", value: seoData.pages?.length || 0 },
      { label: "\u95ee\u9898", value: seoData.issues?.length || 0 },
      { label: "Clicks", value: google.summary?.clicks || 0 },
      { label: "Impressions", value: google.summary?.impressions || 0 }
    ]) + card("Google Search Console", `<div class="actions"><button class="button primary" data-gsc>${label.manualSync}</button></div>${table(google.pages || [], [{ label: "\u9875\u9762", value: "page" }, { label: "Clicks", value: "clicks" }, { label: "Impressions", value: "impressions" }, { label: "CTR", value: "ctr" }])}`) + card("SEO Issues", table(seoData.issues || [], [{ label: "\u7c7b\u578b", value: "type" }, { label: "\u9875\u9762", value: "page" }, { label: "\u8bf4\u660e", value: "message" }]));
    qs("[data-gsc]")?.addEventListener("click", async () => { await api("/api/admin/google-seo/sync", { method: "POST" }); setStatus("Google SEO \u540c\u6b65\u5df2\u5b8c\u6210"); activate("seo"); });
  }

  async function media() {
    const key = "media";
    const panel = qs("[data-panel='media']");
    panel.innerHTML = card("\u5a92\u4f53\u8d44\u4ea7", `${toolbar(key)}<form class="form-row" data-media-form><input name="title" placeholder="\u6807\u9898"><input name="url" placeholder="URL"><input name="alt" placeholder="Alt text"><button class="button primary">${label.save}</button></form><div class="actions"><a class="button secondary" href="/api/admin/media/export">${label.exportCsv}</a></div><div data-list>${label.loading}</div>`);
    const load = async () => {
      const data = await api(`/api/admin/media?${query(key)}`);
      qs("[data-list]", panel).innerHTML = table(data.items || [], [{ label: "\u6807\u9898", value: (row) => row.title || row.filename }, { label: "URL", value: "url" }, { label: "Alt", value: "alt" }, { label: "\u66f4\u65b0", value: "updatedAt" }]) + pager(data, key);
      bindPager(panel, key, load);
    };
    qs("[data-media-form]", panel).addEventListener("submit", async (event) => {
      event.preventDefault();
      await api("/api/admin/media", { method: "POST", body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget).entries())) });
      event.currentTarget.reset();
      setStatus("\u5a92\u4f53\u8d44\u4ea7\u5df2\u4fdd\u5b58");
      await load();
    });
    bindToolbar(panel, key, load);
    await load();
  }

  async function users() {
    const panel = qs("[data-panel='users']");
    panel.innerHTML = card("\u7528\u6237\u4e0e\u89d2\u8272", `<form class="form-row" data-user-form><input name="name" placeholder="\u59d3\u540d"><input name="email" placeholder="\u90ae\u7bb1"><select name="role"><option>Admin</option><option>Editor</option><option>Sales</option><option>Viewer</option></select><button class="button primary">${label.save}</button></form><div data-list>${label.loading}</div>`);
    const load = async () => {
      const data = await api("/api/admin/users");
      qs("[data-list]", panel).innerHTML = table(data.users?.items || data.items || [], [{ label: "\u59d3\u540d", value: "name" }, { label: "\u90ae\u7bb1", value: "email" }, { label: "\u89d2\u8272", value: "role" }, { label: "\u72b6\u6001", value: "status" }]) + card("\u89d2\u8272", table(data.roles || [], [{ label: "\u89d2\u8272", value: "name" }, { label: "\u8bf4\u660e", value: "description" }]));
    };
    qs("[data-user-form]", panel).addEventListener("submit", async (event) => {
      event.preventDefault();
      await api("/api/admin/users", { method: "POST", body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget).entries())) });
      event.currentTarget.reset();
      setStatus("\u7528\u6237\u5df2\u4fdd\u5b58");
      await load();
    });
    await load();
  }

  async function sync() {
    const data = await api("/api/admin/sync");
    qs("[data-panel='sync']").innerHTML = card("\u6570\u636e\u6e90", `<div class="actions"><button class="button primary" data-sync-news>\u540c\u6b65\u65b0\u95fb</button><button class="button primary" data-sync-gsc>\u540c\u6b65 Google SEO</button></div>${table(data.sources || [], [{ label: "\u6570\u636e\u6e90", value: "name" }, { label: "\u914d\u7f6e", value: (row) => row.configured ? "\u5df2\u914d\u7f6e" : "\u672a\u914d\u7f6e" }, { label: "\u72b6\u6001", value: "status" }, { label: "\u6700\u8fd1\u540c\u6b65", value: "lastSync" }])}`) + card("\u6700\u8fd1\u4efb\u52a1", table(data.jobs || [], [{ label: "\u65f6\u95f4", value: "time" }, { label: "\u7c7b\u578b", value: "type" }, { label: "\u72b6\u6001", value: "status" }, { label: "\u8bf4\u660e", value: "message" }]));
    qs("[data-sync-news]")?.addEventListener("click", async () => { await api("/api/admin/sync/news", { method: "POST" }); setStatus("\u65b0\u95fb\u540c\u6b65\u5b8c\u6210"); activate("sync"); });
    qs("[data-sync-gsc]")?.addEventListener("click", async () => { await api("/api/admin/sync/google-seo", { method: "POST" }); setStatus("Google SEO \u540c\u6b65\u5b8c\u6210"); activate("sync"); });
  }

  async function logs() {
    const key = "logs";
    const panel = qs("[data-panel='logs']");
    panel.innerHTML = card("\u64cd\u4f5c\u65e5\u5fd7", `${toolbar(key)}<div class="actions"><a class="button secondary" href="/api/admin/audit-logs/export">${label.exportCsv}</a></div><div data-list>${label.loading}</div>`);
    const load = async () => {
      const data = await api(`/api/admin/audit-logs?${query(key)}`);
      qs("[data-list]", panel).innerHTML = table(data.items || [], [{ label: "\u65f6\u95f4", value: "time" }, { label: "\u7528\u6237", value: "user" }, { label: "\u64cd\u4f5c", value: "action" }, { label: "\u5bf9\u8c61", value: "object" }, { label: "\u6458\u8981", value: "summary" }]) + pager(data, key);
      bindPager(panel, key, load);
    };
    bindToolbar(panel, key, load);
    await load();
  }

  async function settings() {
    const data = await api("/api/admin/settings");
    const panel = qs("[data-panel='settings']");
    panel.innerHTML = card("\u7cfb\u7edf\u8bbe\u7f6e", `<form class="editor form-grid" data-settings>
      <label>\u516c\u53f8\u540d\u79f0<input name="companyName"></label>
      <label>\u54c1\u724c\u540d\u79f0<input name="brandName"></label>
      <label>\u5168\u7403\u5b98\u7f51<input name="globalWebsite"></label>
      <label>\u975e\u6d32\u7ad9<input name="africaWebsite"></label>
      <label>\u90ae\u7bb1<input name="email"></label>
      <label>WhatsApp<input name="whatsapp"></label>
      <label>\u9ed8\u8ba4\u8bed\u8a00<input name="defaultLanguage"></label>
      <label>\u652f\u6301\u8bed\u8a00<textarea name="supportedLanguages"></textarea></label>
      <label>\u5e02\u573a\u8986\u76d6<textarea name="marketCoverage"></textarea></label>
      <label>\u9ed8\u8ba4\u65f6\u533a<input name="timezone" value="Africa/Johannesburg"></label>
      <button class="button primary">${label.save}</button>
    </form>`);
    Object.entries(data || {}).forEach(([key, value]) => {
      const input = qs(`[name="${key}"]`, panel);
      if (input) input.value = Array.isArray(value) ? value.join(", ") : value ?? "";
    });
    qs("[data-settings]", panel).addEventListener("submit", async (event) => {
      event.preventDefault();
      const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
      payload.supportedLanguages = String(payload.supportedLanguages || "").split(",").map((item) => item.trim()).filter(Boolean);
      payload.marketCoverage = String(payload.marketCoverage || "").split(",").map((item) => item.trim()).filter(Boolean);
      await api("/api/admin/settings", { method: "PUT", body: JSON.stringify(payload) });
      setStatus("\u7cfb\u7edf\u8bbe\u7f6e\u5df2\u4fdd\u5b58");
    });
  }

  const loaders = { dashboard, categories, products, news, forms, analytics, seo, media, users, sync, logs, settings };

  async function init() {
    localizeShell();
    try {
      const session = await api("/api/session");
      state.user = session.user;
      state.csrf = session.csrf;
    qs("[data-user-email]").textContent = session.email || session.user || "";
    } catch {
      window.location.href = "/admin/login/";
      return;
    }
    qsa("[data-view]").forEach((button) => button.addEventListener("click", () => activate(button.dataset.view)));
    qs("[data-refresh]").addEventListener("click", () => activate(state.view));
    qs("[data-logout]").addEventListener("click", async () => {
      await api("/api/logout", { method: "POST" }).catch(() => null);
      window.location.href = "/admin/login/";
    });
    activate(new URLSearchParams(window.location.search).get("view") || "dashboard");
  }

  init();
})();
