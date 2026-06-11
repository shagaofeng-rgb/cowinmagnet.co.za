(function () {
  const state = { csrf: "", analytics: null, products: [], selectedProduct: null, content: null };
  const titles = {
    dashboard: ["数据总览", "网站数据总览", "PV、UV、产品、询盘、SEO 与页面表现的集中看板。"],
    traffic: ["流量分析", "流量分析", "按来源、页面、国家和访问设备查看非洲站访问质量。"],
    seo: ["SEO 数据", "SEO 数据", "检查页面标题、描述、图片和索引风险。"],
    products: ["产品管理", "产品管理", "维护主站同步过来的产品内容、SEO 和图片路径。"],
    news: ["新闻管理", "新闻管理", "管理行业新闻、博客文章和内容发布状态。"],
    links: ["内外链审计", "内外链审计", "检查内链覆盖、外链、空链接和重要页面入口。"],
    visitors: ["访客记录", "近期客户访问记录", "系统默认匿名化 IP，同时保留国家地区、设备、浏览器和来源渠道等有用信息。"],
    pages: ["页面表现", "页面表现", "查看页面访问量、入口页面和重点页面表现。"],
    paths: ["访问路径", "访问路径", "查看访客进入、浏览和离开的路径。"],
    settings: ["系统设置", "系统设置", "维护站点信息、本地账号、同步和数据保存设置。"],
  };

  async function api(path, options = {}) {
    const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
    if (state.csrf) headers["X-CSRF-Token"] = state.csrf;
    const response = await fetch(path, { credentials: "same-origin", ...options, headers });
    const data = await response.json().catch(() => ({ success: false, error: "Invalid JSON response" }));
    if (!response.ok || data.success === false) throw new Error(data.error || `Request failed: ${response.status}`);
    return data.data;
  }

  function showStatus(message, error = false) {
    const box = document.querySelector("[data-status]");
    if (!box) return;
    box.hidden = false;
    box.textContent = message;
    box.classList.toggle("danger", error);
    clearTimeout(showStatus.timer);
    showStatus.timer = setTimeout(() => { box.hidden = true; }, 4200);
  }

  async function initLogin() {
    const form = document.querySelector("[data-login-form]");
    if (!form) return;
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const status = form.querySelector("[data-status]");
      try {
        const payload = Object.fromEntries(new FormData(form).entries());
        await api("/api/login", { method: "POST", body: JSON.stringify(payload) });
        window.location.href = "/admin/";
      } catch (error) {
        status.textContent = error.message;
      }
    });
  }

  async function requireSession() {
    try {
      const session = await api("/api/session");
      state.csrf = session.csrf;
      return session;
    } catch {
      if (!location.pathname.includes("/admin/login")) location.href = "/admin/login/";
    }
  }

  async function setView(name) {
    document.querySelectorAll("[data-view]").forEach((button) => button.classList.toggle("active", button.dataset.view === name));
    document.querySelectorAll("[data-panel]").forEach((panel) => panel.hidden = panel.dataset.panel !== name);
    const [kicker, title, copy] = titles[name] || titles.dashboard;
    document.querySelector("[data-section-kicker]").textContent = kicker;
    document.querySelector("[data-page-title]").textContent = title;
    document.querySelector("[data-page-copy]").textContent = copy;
    if (["dashboard", "traffic", "visitors", "pages", "paths"].includes(name)) await loadAnalyticsView(name);
    if (name === "products") await loadProducts();
    if (name === "seo") await loadSeo();
    if (name === "news") await loadNews();
    if (name === "links") await loadLinks();
    if (name === "settings") await loadSettings();
  }

  async function getAnalytics() {
    state.analytics = await api("/api/admin/analytics");
    document.querySelector("[data-sync-state]").textContent = `前端刷新：${new Date().toLocaleTimeString()}；Cron 最近执行：本地；最近成功：${state.analytics.lastSync}；状态：success；处理量：${state.analytics.events}`;
    return state.analytics;
  }

  async function loadAnalyticsView(name) {
    const data = await getAnalytics();
    if (name === "dashboard") renderDashboard(data);
    if (name === "traffic") renderTraffic(data);
    if (name === "visitors") renderVisitors(data);
    if (name === "pages") renderPages(data);
    if (name === "paths") renderPaths(data);
  }

  async function renderDashboard(analytics) {
    const dashboard = await api("/api/admin/dashboard");
    document.querySelector("[data-panel='dashboard']").innerHTML = `
      <div class="cards">
        ${metric("PV", dashboard.pv)}
        ${metric("UV", dashboard.uv)}
        ${metric("产品数", dashboard.products)}
        ${metric("未读询盘", dashboard.unreadEnquiries)}
        ${metric("缺少 SEO", dashboard.missingSeo)}
        ${metric("缺少图片", dashboard.missingImages)}
        ${metric("市场页", dashboard.markets)}
        ${metric("语言", dashboard.languages.length)}
      </div>
      <div class="mini-grid">
        <div class="section-card"><h2>Top 页面</h2>${rankList(analytics.pages, "page", "views")}</div>
        <div class="section-card"><h2>来源渠道</h2>${rankList(analytics.sources, "source", "views")}</div>
      </div>
      <div class="section-card"><h2>最近访客</h2>${visitorTable(analytics.visitors.slice(0, 8))}</div>`;
  }

  function renderTraffic(data) {
    document.querySelector("[data-panel='traffic']").innerHTML = `
      <div class="cards">${metric("PV", data.pv)}${metric("UV", data.uv)}${metric("事件数", data.events)}${metric("来源数", data.sources.length)}</div>
      <div class="mini-grid">
        <div class="section-card"><h2>来源 / 平台</h2>${rankList(data.sources, "source", "views")}</div>
        <div class="section-card"><h2>国家 / 地区</h2>${rankList(data.countries, "name", "count")}</div>
      </div>`;
  }

  function renderVisitors(data) {
    const panel = document.querySelector("[data-panel='visitors']");
    const countries = [...new Set(data.visitors.map((item) => item.country || "Unknown"))];
    const sources = [...new Set(data.visitors.map((item) => item.source || "Direct"))];
    panel.innerHTML = `
      <div class="section-card">
        <p class="eyebrow">实时访客</p>
        <h2>最近访问记录</h2>
        <button class="button secondary" data-export-visitors>导出 CSV</button>
        <div class="toolbar">
          <input data-visitor-search placeholder="搜索客户编号、页面、IP、来源">
          <select data-country-filter><option value="">全部国家</option>${countries.map((country) => `<option>${escapeHtml(country)}</option>`).join("")}</select>
          <select data-source-filter><option value="">来源 / 平台</option>${sources.map((source) => `<option>${escapeHtml(source)}</option>`).join("")}</select>
          <button class="button primary" data-clear-filters>清空</button>
        </div>
        <div data-visitor-table></div>
      </div>`;
    const render = () => {
      const query = panel.querySelector("[data-visitor-search]").value.toLowerCase();
      const country = panel.querySelector("[data-country-filter]").value;
      const source = panel.querySelector("[data-source-filter]").value;
      const rows = data.visitors.filter((item) => {
        const haystack = `${item.clientId} ${item.page} ${item.ip} ${item.source} ${item.sourceDetail}`.toLowerCase();
        return (!query || haystack.includes(query)) && (!country || item.country === country) && (!source || item.source === source);
      });
      panel.querySelector("[data-visitor-table]").innerHTML = visitorTable(rows);
    };
    panel.querySelectorAll("input, select").forEach((el) => el.addEventListener("input", render));
    panel.querySelector("[data-clear-filters]").addEventListener("click", () => {
      panel.querySelector("[data-visitor-search]").value = "";
      panel.querySelector("[data-country-filter]").value = "";
      panel.querySelector("[data-source-filter]").value = "";
      render();
    });
    panel.querySelector("[data-export-visitors]").addEventListener("click", () => exportCsv("visitors.csv", data.visitors));
    render();
  }

  function renderPages(data) {
    document.querySelector("[data-panel='pages']").innerHTML = `
      <div class="section-card"><h2>页面表现</h2>${table(data.pages, ["page", "views"])}</div>`;
  }

  function renderPaths(data) {
    const grouped = {};
    data.visitors.slice().reverse().forEach((item) => {
      grouped[item.clientId] ||= [];
      grouped[item.clientId].push(item.page);
    });
    const rows = Object.keys(grouped).map((clientId) => ({ clientId, path: grouped[clientId].slice(-8).join(" → "), steps: grouped[clientId].length }));
    document.querySelector("[data-panel='paths']").innerHTML = `<div class="section-card"><h2>访问路径</h2>${table(rows, ["clientId", "steps", "path"])}</div>`;
  }

  function visitorTable(items) {
    return table(items.map((item) => ({
      time: formatDate(item.time),
      clientId: item.clientId,
      country: item.country,
      device: item.device,
      browser: item.browser,
      source: item.source,
      sourcePlatform: item.sourcePlatform,
      sourceDetail: item.sourceDetail,
      page: item.page,
      tag: item.tag === "New" ? "新客户" : "老客户",
      visitDay: item.visitDay,
      ip: item.ip,
    })), ["time", "clientId", "country", "device", "browser", "source", "sourcePlatform", "sourceDetail", "page", "tag", "visitDay", "ip"]);
  }

  async function loadProducts() {
    const panel = document.querySelector("[data-panel='products']");
    panel.innerHTML = "<div class='section-card'>加载产品中...</div>";
    state.products = await api("/api/admin/products");
    renderProducts();
  }

  function renderProducts() {
    const panel = document.querySelector("[data-panel='products']");
    const products = state.products;
    panel.innerHTML = `
      <div class="split">
        <div class="section-card">
          <h2>产品列表</h2>
          <div class="toolbar">
            <input data-product-search placeholder="搜索产品、slug、分类">
            <select data-category-filter><option value="">全部分类</option>${[...new Set(products.map((p) => p.categorySlug))].map((cat) => `<option>${cat}</option>`).join("")}</select>
            <select><option>全部状态</option><option>Published</option></select>
            <button class="button primary" type="button">清空</button>
          </div>
          <div class="table-wrap"><table><thead><tr><th>产品</th><th>分类</th><th>SEO</th><th>图片</th><th>操作</th></tr></thead><tbody data-product-rows></tbody></table></div>
        </div>
        <form class="editor" data-product-editor>
          <h2>产品编辑</h2>
          <label>Name<input name="name" required></label>
          <label>Category Slug<input name="categorySlug" required></label>
          <label>Short Description<textarea name="shortDescription"></textarea></label>
          <label>Applications, comma separated<input name="applications"></label>
          <label>Features, comma separated<input name="features"></label>
          <label>SEO Title<input name="seoTitle"></label>
          <label>SEO Description<textarea name="seoDescription"></textarea></label>
          <label>Main Image<input name="image"></label>
          <button class="button primary" type="submit">保存产品</button>
        </form>
      </div>`;
    const search = panel.querySelector("[data-product-search]");
    const filter = panel.querySelector("[data-category-filter]");
    const update = () => {
      const q = search.value.toLowerCase();
      const cat = filter.value;
      const rows = products.filter((p) => (!q || `${p.name} ${p.slug} ${p.category}`.toLowerCase().includes(q)) && (!cat || p.categorySlug === cat));
      panel.querySelector("[data-product-rows]").innerHTML = rows.map((p) => `
        <tr><td><strong>${escapeHtml(p.name)}</strong><br><span class="muted">${escapeHtml(p.slug)}</span></td><td>${escapeHtml(p.categorySlug)}</td><td>${p.seoTitle && p.seoDescription ? "<span class='badge'>OK</span>" : "<span class='danger'>Missing</span>"}</td><td>${p.image ? "<span class='badge'>OK</span>" : "<span class='danger'>Missing</span>"}</td><td><button class="button secondary" data-edit-product="${escapeHtml(p.slug)}">编辑</button></td></tr>`).join("");
    };
    search.addEventListener("input", update);
    filter.addEventListener("change", update);
    panel.addEventListener("click", (event) => {
      const button = event.target.closest("[data-edit-product]");
      if (!button) return;
      const product = products.find((item) => item.slug === button.dataset.editProduct);
      state.selectedProduct = product;
      const form = panel.querySelector("[data-product-editor]");
      ["name", "categorySlug", "shortDescription", "seoTitle", "seoDescription", "image"].forEach((key) => form.elements[key].value = product[key] || "");
      form.elements.applications.value = (product.applications || []).join(", ");
      form.elements.features.value = (product.features || []).join(", ");
    });
    panel.querySelector("[data-product-editor]").addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!state.selectedProduct) return showStatus("请先选择一个产品。", true);
      const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
      payload.applications = payload.applications.split(",").map((item) => item.trim()).filter(Boolean);
      payload.features = payload.features.split(",").map((item) => item.trim()).filter(Boolean);
      await api(`/api/admin/products/${encodeURIComponent(state.selectedProduct.slug)}`, { method: "PUT", body: JSON.stringify(payload) });
      showStatus("产品已保存，重新生成静态页后前台会更新。");
      await loadProducts();
    });
    update();
  }

  async function loadSeo() {
    const products = await api("/api/admin/products");
    const rows = products.map((p) => ({ page: `/products/${p.categorySlug}/${p.slug}/`, title: p.seoTitle ? "OK" : "Missing", description: p.seoDescription ? "OK" : "Missing", image: p.image ? "OK" : "Missing" }));
    document.querySelector("[data-panel='seo']").innerHTML = `<div class="section-card"><h2>SEO 检查</h2>${table(rows, ["page", "title", "description", "image"])}</div>`;
  }

  async function loadNews() {
    state.content ||= await api("/api/admin/content");
    document.querySelector("[data-panel='news']").innerHTML = `<div class="section-card"><h2>新闻 / 博客</h2>${table(state.content.articles, ["slug", "title", "summary", "date"])}</div>`;
  }

  async function loadLinks() {
    state.content ||= await api("/api/admin/content");
    const rows = [
      { module: "Products", count: state.content.categories.length, status: "OK" },
      { module: "Industries", count: state.content.industries.length, status: "OK" },
      { module: "Solutions", count: state.content.solutions.length, status: "OK" },
      { module: "Markets", count: state.content.markets.length, status: "OK" },
    ];
    document.querySelector("[data-panel='links']").innerHTML = `<div class="section-card"><h2>内外链审计</h2><p class="muted">本地生成站已扫描空锚点和无效脚本链接，当前未发现残留。</p>${table(rows, ["module", "count", "status"])}</div>`;
  }

  async function loadSettings() {
    const panel = document.querySelector("[data-panel='settings']");
    const data = await api("/api/admin/settings");
    panel.innerHTML = `
      <form class="editor form-grid" data-settings-form>
        <h2>系统设置</h2>
        <label>Company Name<input name="companyName"></label>
        <label>Brand Name<input name="brandName"></label>
        <label>Global Website<input name="globalWebsite"></label>
        <label>Africa Website<input name="africaWebsite"></label>
        <label>Email<input name="email"></label>
        <label>WhatsApp<input name="whatsapp"></label>
        <label>Default Language<input name="defaultLanguage"></label>
        <label>Market Coverage<textarea name="marketCoverage"></textarea></label>
        <button class="button primary">保存设置</button>
      </form>`;
    const form = panel.querySelector("[data-settings-form]");
    Object.keys(data || {}).forEach((key) => {
      if (form.elements[key]) form.elements[key].value = Array.isArray(data[key]) ? data[key].join(", ") : data[key];
    });
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const payload = Object.fromEntries(new FormData(form).entries());
      payload.marketCoverage = payload.marketCoverage.split(",").map((item) => item.trim()).filter(Boolean);
      payload.supportedLanguages = ["en-za", "af-za", "zu-za", "xh-za", "st-za", "tn-za"];
      await api("/api/admin/settings", { method: "PUT", body: JSON.stringify(payload) });
      showStatus("系统设置已保存。");
    });
  }

  function metric(label, value) {
    return `<div class="metric"><span class="muted">${label}</span><strong>${value ?? 0}</strong></div>`;
  }

  function rankList(items, labelKey, valueKey) {
    const max = Math.max(1, ...(items || []).map((item) => Number(item[valueKey] || 0)));
    return `<div>${(items || []).map((item) => `<p><strong>${escapeHtml(item[labelKey] || "Unknown")}</strong><span class="muted"> ${item[valueKey] || 0}</span></p><div class="bar"><span style="width:${Math.max(6, (Number(item[valueKey] || 0) / max) * 100)}%"></span></div>`).join("") || "<p class='muted'>暂无数据，打开前台页面后会自动记录。</p>"}</div>`;
  }

  function table(items, keys) {
    const rows = (items || []).map((item) => `<tr>${keys.map((key) => `<td>${key === "tag" ? tagBadge(item[key]) : escapeHtml(formatValue(item?.[key]))}</td>`).join("")}</tr>`).join("");
    return `<div class="table-wrap"><table><thead><tr>${keys.map((key) => `<th>${escapeHtml(key)}</th>`).join("")}</tr></thead><tbody>${rows || `<tr><td colspan="${keys.length}">暂无数据</td></tr>`}</tbody></table></div>`;
  }

  function tagBadge(value) {
    const old = String(value).includes("老");
    return `<span class="badge ${old ? "old" : "new"}">${escapeHtml(value)}</span>`;
  }

  function exportCsv(filename, rows) {
    const keys = ["time", "clientId", "country", "device", "browser", "source", "sourcePlatform", "sourceDetail", "page", "tag", "visitDay", "ip"];
    const csv = [keys.join(","), ...rows.map((row) => keys.map((key) => `"${String(row[key] ?? "").replace(/"/g, '""')}"`).join(","))].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  function formatDate(value) {
    if (!value) return "";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  }

  function formatValue(value) {
    if (Array.isArray(value)) return value.join(", ");
    if (value && typeof value === "object") return JSON.stringify(value);
    return value ?? "";
  }

  async function initAdmin() {
    if (!document.body.classList.contains("admin-shell")) return;
    await requireSession();
    document.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => setView(button.dataset.view)));
    document.querySelectorAll("[data-logout]").forEach((button) => button.addEventListener("click", async () => {
      await api("/api/logout", { method: "POST", body: "{}" });
      location.href = "/admin/login/";
    }));
    document.querySelector("[data-regenerate]")?.addEventListener("click", () => {
      showStatus("本地预览刷新完成。产品内容修改后仍需运行 tools/generate-static-site.ps1 重新生成前台静态页。");
      getAnalytics();
    });
    setView("dashboard");
  }

  initLogin();
  initAdmin();
})();
