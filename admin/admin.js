(function () {
  const state = {
    csrf: "",
    view: "dashboard",
    analytics: null,
    products: [],
    selectedProduct: null,
    selectedArticle: null,
    content: null,
  };

  const titles = {
    dashboard: ["数据总览", "网站数据总览", "PV、UV、产品、询盘、SEO 与页面表现的集中看板。"],
    traffic: ["流量分析", "流量分析", "按来源、页面、国家和访问设备查看非洲站访问质量。"],
    seo: ["SEO 数据", "SEO 数据", "检查页面标题、描述、图片、canonical、hreflang、索引风险和 Google Search Console 数据。"],
    products: ["产品管理", "产品管理", "维护主站同步过来的产品内容、SEO、图片路径和发布状态。"],
    news: ["新闻管理", "新闻管理", "管理本地新闻、行业文章、发布状态和 SEO 信息。"],
    links: ["内外链审计", "内外链审计", "检查内链覆盖、外链、空链接、锚文本和重要页面入口。"],
    visitors: ["访客记录", "近期客户访问记录", "匿名化查看客户访问记录，保留国家地区、设备、浏览器和来源渠道。"],
    pages: ["页面表现", "页面表现", "查看页面访问量、入口页面、重点页面和转化入口表现。"],
    paths: ["访问路径", "访问路径", "查看客户进入、浏览和离开的路径，辅助判断询盘转化路线。"],
    settings: ["系统设置", "系统设置", "维护站点信息、账号、同步、语言和市场覆盖设置。"],
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
    document.querySelector("[data-toggle-password]")?.addEventListener("click", (event) => {
      const input = form.querySelector("input[name='password']");
      const visible = input.type === "text";
      input.type = visible ? "password" : "text";
      event.currentTarget.textContent = visible ? "显示" : "隐藏";
    });
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
    return null;
  }

  async function setView(name) {
    state.view = name;
    document.querySelectorAll("[data-view]").forEach((button) => button.classList.toggle("active", button.dataset.view === name));
    document.querySelectorAll("[data-panel]").forEach((panel) => { panel.hidden = panel.dataset.panel !== name; });
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

  async function getAnalytics(force = false) {
    if (!state.analytics || force) state.analytics = await api("/api/admin/analytics");
    document.querySelector("[data-sync-state]").textContent = `Frontend refresh: ${new Date().toLocaleTimeString()}; latest success: ${state.analytics.lastSync}; status: success; processed: ${state.analytics.events}`;
    document.querySelector("[data-side-summary]").textContent = `30-min auto sync ${state.analytics.pv} PV / ${state.analytics.enquiries || 0} enquiries`;
    document.querySelector("[data-side-sync]").textContent = `Latest sync: ${new Date().toLocaleTimeString()} Beijing time`;
    return state.analytics;
  }

  async function loadAnalyticsView(name) {
    const data = await getAnalytics(true);
    if (name === "dashboard") await renderDashboard(data);
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
        ${metric("Products", dashboard.products)}
        ${metric("Unread Enquiries", dashboard.unreadEnquiries)}
        ${metric("Missing SEO", dashboard.missingSeo)}
        ${metric("Missing Images", dashboard.missingImages)}
        ${metric("Market Pages", dashboard.markets)}
        ${metric("Languages", dashboard.languages.length)}
        ${metric("瀛樺偍妯″紡", dashboard.storageMode || "local-file")}
      </div>
      <div class="mini-grid">
        <div class="section-card"><h2>Top Pages</h2>${rankList(analytics.pages, "page", "views")}</div>
        <div class="section-card"><h2>鏉ユ簮娓犻亾</h2>${rankList(analytics.sources, "source", "views")}</div>
      </div>
      <div class="section-card"><h2>Recent Visitors</h2>${visitorTable(analytics.visitors.slice(0, 8))}</div>
      <div class="section-card"><h2>Recent Enquiries</h2>${table(dashboard.recentEnquiries || [], ["id", "name", "country", "email", "product", "status", "submissionTime"])}</div>`;
  }

  function renderTraffic(data) {
    document.querySelector("[data-panel='traffic']").innerHTML = `
      <div class="cards">${metric("PV", data.pv)}${metric("UV", data.uv)}${metric("Events", data.events)}${metric("Sources", data.sources.length)}</div>
      <div class="mini-grid">
        <div class="section-card"><h2>鏉ユ簮 / 骞冲彴</h2>${rankList(data.sources, "source", "views")}</div>
        <div class="section-card"><h2>Countries / Regions</h2>${rankList(data.countries, "name", "count")}</div>
      </div>
      <div class="section-card"><h2>Devices and Browsers</h2>${table(data.deviceBrowsers || [], ["device", "browser", "views"])}</div>`;
  }

  function renderVisitors(data) {
    const panel = document.querySelector("[data-panel='visitors']");
    const countries = unique(data.visitors.map((item) => item.country || "Unknown"));
    const sources = unique(data.visitors.map((item) => item.source || "Direct"));
    panel.innerHTML = `
      <div class="section-card">
        <p class="eyebrow">Realtime visitors</p>
        <h2>Recent visit records</h2>
        <button class="button secondary" data-export-visitors>Export CSV</button>
        <div class="toolbar">
          <input data-visitor-search placeholder="Search client ID, page, IP, source">
          <select data-country-filter><option value="">All countries</option>${countries.map((country) => `<option>${escapeHtml(country)}</option>`).join("")}</select>
          <select data-source-filter><option value="">鏉ユ簮 / 骞冲彴</option>${sources.map((source) => `<option>${escapeHtml(source)}</option>`).join("")}</select>
          <button class="button primary" data-clear-filters>娓呯┖</button>
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
    const rows = (data.pages || []).map((item) => ({
      page: item.page,
      views: item.views,
      share: data.pv ? `${Math.round((Number(item.views || 0) / data.pv) * 100)}%` : "0%",
      type: item.page?.includes("/products/") ? "Product" : item.page?.includes("/news/") ? "News" : "Page",
    }));
    document.querySelector("[data-panel='pages']").innerHTML = `
      <div class="section-card">
        <h2>Page Performance</h2>
        ${table(rows, ["page", "type", "views", "share"])}
      </div>`;
  }

  function renderPaths(data) {
    const grouped = {};
    data.visitors.slice().reverse().forEach((item) => {
      grouped[item.clientId] ||= [];
      grouped[item.clientId].push(item.page);
    });
    const rows = Object.keys(grouped).map((clientId) => ({
      clientId,
      steps: grouped[clientId].length,
      entrance: grouped[clientId][0] || "",
      exit: grouped[clientId][grouped[clientId].length - 1] || "",
      path: grouped[clientId].slice(-8).join(" -> "),
    }));
    document.querySelector("[data-panel='paths']").innerHTML = `<div class="section-card"><h2>Visit Paths</h2>${table(rows, ["clientId", "steps", "entrance", "exit", "path"])}</div>`;
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
      tag: item.tag === "New" ? "New visitor" : "Returning visitor",
      visitDay: item.visitDay,
      ip: item.ip,
    })), ["time", "clientId", "country", "device", "browser", "source", "sourcePlatform", "sourceDetail", "page", "tag", "visitDay", "ip"]);
  }

  async function loadProducts() {
    const panel = document.querySelector("[data-panel='products']");
    panel.innerHTML = "<div class='section-card'>Loading products...</div>";
    state.products = await api("/api/admin/products");
    renderProducts();
  }

  function renderProducts() {
    const panel = document.querySelector("[data-panel='products']");
    const products = state.products;
    panel.innerHTML = `
      <div class="split">
        <div class="section-card">
          <h2>Product List</h2>
          <div class="toolbar">
            <input data-product-search placeholder="Search product, slug, category">
            <select data-category-filter><option value="">All categories</option>${unique(products.map((p) => p.categorySlug)).map((cat) => `<option>${escapeHtml(cat)}</option>`).join("")}</select>
            <select data-product-status><option value="">All status</option><option value="missingSeo">Missing SEO</option><option value="missingImage">Missing image</option></select>
            <button class="button secondary" data-export-products type="button">Export CSV</button>
          </div>
          <div class="table-wrap"><table><thead><tr><th>Product</th><th>Category</th><th>SEO</th><th>Image</th><th>Action</th></tr></thead><tbody data-product-rows></tbody></table></div>
        </div>
        <form class="editor" data-product-editor>
          <h2>Product Editor</h2>
          <label>Name<input name="name" required></label>
          <label>Category Slug<input name="categorySlug" required></label>
          <label>Short Description<textarea name="shortDescription"></textarea></label>
          <label>Applications, comma separated<input name="applications"></label>
          <label>Features, comma separated<input name="features"></label>
          <label>SEO Title<input name="seoTitle"></label>
          <label>SEO Description<textarea name="seoDescription"></textarea></label>
          <label>Main Image<input name="image"></label>
          <button class="button primary" type="submit">Save Product</button>
        </form>
      </div>`;
    const search = panel.querySelector("[data-product-search]");
    const category = panel.querySelector("[data-category-filter]");
    const status = panel.querySelector("[data-product-status]");
    const update = () => {
      const q = search.value.toLowerCase();
      const cat = category.value;
      const flag = status.value;
      const rows = products.filter((p) => {
        const matched = !q || `${p.name} ${p.slug} ${p.category}`.toLowerCase().includes(q);
        const categoryMatched = !cat || p.categorySlug === cat;
        const statusMatched = !flag || (flag === "missingSeo" && (!p.seoTitle || !p.seoDescription)) || (flag === "missingImage" && !p.image);
        return matched && categoryMatched && statusMatched;
      });
      panel.querySelector("[data-product-rows]").innerHTML = rows.map((p) => `
        <tr><td><strong>${escapeHtml(p.name)}</strong><br><span class="muted">${escapeHtml(p.slug)}</span></td><td>${escapeHtml(p.categorySlug)}</td><td>${p.seoTitle && p.seoDescription ? "<span class='badge'>OK</span>" : "<span class='danger'>Missing</span>"}</td><td>${p.image ? "<span class='badge'>OK</span>" : "<span class='danger'>Missing</span>"}</td><td><button class="button secondary" data-edit-product="${escapeHtml(p.slug)}">Edit</button></td></tr>`).join("");
    };
    [search, category, status].forEach((el) => el.addEventListener("input", update));
    panel.querySelector("[data-export-products]").addEventListener("click", () => exportCsv("products.csv", products));
    panel.addEventListener("click", (event) => {
      const button = event.target.closest("[data-edit-product]");
      if (!button) return;
      const product = products.find((item) => item.slug === button.dataset.editProduct);
      state.selectedProduct = product;
      const form = panel.querySelector("[data-product-editor]");
      ["name", "categorySlug", "shortDescription", "seoTitle", "seoDescription", "image"].forEach((key) => { form.elements[key].value = product[key] || ""; });
      form.elements.applications.value = (product.applications || []).join(", ");
      form.elements.features.value = (product.features || []).join(", ");
    });
    panel.querySelector("[data-product-editor]").addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!state.selectedProduct) return showStatus("Please select a product first.", true);
      const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
      payload.applications = payload.applications.split(",").map((item) => item.trim()).filter(Boolean);
      payload.features = payload.features.split(",").map((item) => item.trim()).filter(Boolean);
      await api(`/api/admin/products/${encodeURIComponent(state.selectedProduct.slug)}`, { method: "PUT", body: JSON.stringify(payload) });
      showStatus("Product saved. Regenerate static pages before publishing static output.");
      await loadProducts();
    });
    update();
  }

  async function loadSeo() {
    const [data, googleSeo] = await Promise.all([
      api("/api/admin/seo"),
      api("/api/admin/google-seo").catch((error) => ({ configured: false, error: error.message, latest: null, jobs: [] }))
    ]);
    const latest = googleSeo.latest || {};
    const summary = latest.summary || {};
    const deltas = latest.deltas || {};
    document.querySelector("[data-panel='seo']").innerHTML = `
      <div class="cards">
        ${metric("Pages", data.total)}
        ${metric("Missing Title", data.missingTitle)}
        ${metric("Missing Description", data.missingDescription)}
        ${metric("Missing Image", data.missingImage)}
        ${metric("GSC Clicks", summary.clicks ?? "Not synced")}
        ${metric("GSC Impressions", summary.impressions ?? "Not synced")}
      </div>
      <div class="section-card">
        <h2>Google SEO Data Sync</h2>
        <p class="muted">Property: ${escapeHtml(googleSeo.propertyUrl || "Not configured")} | Service Account: ${escapeHtml(googleSeo.serviceAccountEmail || "Not configured")} | Last sync: ${escapeHtml(latest.syncedAt || "Never")}</p>
        <div class="toolbar">
          <button class="button primary" data-sync-google-seo type="button">${googleSeo.configured ? "Sync Google SEO Now" : "Google Not Configured"}</button>
          <a class="button secondary" href="https://search.google.com/search-console" target="_blank" rel="noreferrer">Open Search Console</a>
        </div>
        <div class="cards">
          ${metric("Clicks Delta", deltas.clicks ?? 0)}
          ${metric("Impressions Delta", deltas.impressions ?? 0)}
          ${metric("CTR", summary.ctr ? `${(summary.ctr * 100).toFixed(2)}%` : 0)}
          ${metric("Avg Position", summary.position ? summary.position.toFixed(1) : 0)}
        </div>
        <div class="mini-grid">
          <div><h3>Top Pages</h3>${table((latest.topPages || []).slice(0, 10).map(gscRow), ["name", "clicks", "impressions", "ctr", "position"])}</div>
          <div><h3>Top Queries</h3>${table((latest.topQueries || []).slice(0, 10).map(gscRow), ["name", "clicks", "impressions", "ctr", "position"])}</div>
          <div><h3>Countries</h3>${table((latest.countries || []).slice(0, 10).map(gscRow), ["name", "clicks", "impressions", "ctr", "position"])}</div>
          <div><h3>Devices</h3>${table((latest.devices || []).slice(0, 10).map(gscRow), ["name", "clicks", "impressions", "ctr", "position"])}</div>
        </div>
        <h3>Sync Jobs</h3>${table((googleSeo.jobs || []).slice(0, 8), ["id", "status", "started_at", "completed_at", "clicks", "impressions", "error_message"])}
      </div>
      <div class="section-card"><h2>SEO Check</h2>${table(data.rows, ["page", "title", "description", "image", "canonical", "status"])}</div>`;
    document.querySelector("[data-sync-google-seo]")?.addEventListener("click", async (event) => {
      if (!googleSeo.configured) return showStatus("Google Search Console service account is not configured.", true);
      event.currentTarget.disabled = true;
      event.currentTarget.textContent = "Syncing...";
      try {
        const result = await api("/api/admin/google-seo/sync", { method: "POST", body: "{}" });
        showStatus(`Google SEO synced: ${result.data.summary.clicks} clicks / ${result.data.summary.impressions} impressions`);
        await loadSeo();
      } catch (error) {
        showStatus(error.message, true);
        event.currentTarget.disabled = false;
        event.currentTarget.textContent = "Sync Google SEO Now";
      }
    });
  }

  function gscRow(row) {
    return {
      name: (row.keys || [])[0] || "",
      clicks: row.clicks || 0,
      impressions: row.impressions || 0,
      ctr: row.ctr ? `${(row.ctr * 100).toFixed(2)}%` : "0%",
      position: row.position ? row.position.toFixed(1) : "0"
    };
  }
  async function loadNews() {
    const panel = document.querySelector("[data-panel='news']");
    const [articles, newsState] = await Promise.all([api("/api/admin/news"), api("/api/admin/news/state")]);
    state.articles = articles;
    panel.innerHTML = `
      <div class="cards">
        ${metric("Daily Target", newsState.settings.dailyTarget)}
        ${metric("Published News", articles.filter((item) => (item.status || "published") === "published").length)}
        ${metric("Sources", newsState.sources.length)}
        ${metric("Latest Audit", newsState.audits[0]?.status || "pending")}
      </div>
      <div class="section-card">
        <h2>News Automation</h2>
        <p>Runs every 3 hours on Vercel cron. Manual controls trigger source collection or publish-until-target execution.</p>
        <div class="toolbar">
          <button class="button secondary" data-collect-news type="button">Collect Candidates</button>
          <button class="button primary" data-publish-news type="button">Run Publish Task</button>
          <a class="button secondary" href="/en-za/news/" target="_blank" rel="noreferrer">Open News</a>
          <a class="button secondary" href="/en-za/news/feed.xml" target="_blank" rel="noreferrer">Open RSS</a>
        </div>
        <div class="mini-grid">
          <div><h3>Daily Audits</h3>${table((newsState.audits || []).slice(0, 8), ["date", "timezone", "target_count", "published_count", "missing_count", "status", "checked_at"])}</div>
          <div><h3>Recent Jobs</h3>${table((newsState.jobs || []).slice(0, 8), ["job_type", "status", "started_at", "completed_at", "retry_count", "error_message"])}</div>
        </div>
        <h3>Sources</h3>${table((newsState.sources || []).map((item) => ({ id: item.id, publisher: item.publisher_name, type: item.source_type, enabled: item.enabled, autoPublish: item.allowed_for_auto_publish, score: item.credibility_score })), ["id", "publisher", "type", "enabled", "autoPublish", "score"])}
      </div>
      <div class="split">
        <div class="section-card">
          <h2>News / Blog</h2>
          <div class="toolbar">
            <input data-news-search placeholder="Search news title, slug, summary">
            <select data-news-status><option value="">All status</option><option value="published">Published</option><option value="draft">Draft</option></select>
            <button class="button secondary" data-new-article type="button">New Article</button>
            <button class="button secondary" data-export-news type="button">Export CSV</button>
          </div>
          <div data-news-table></div>
        </div>
        <form class="editor" data-news-editor>
          <h2>News Editor</h2>
          <label>Slug<input name="slug" required></label>
          <label>Title<input name="title" required></label>
          <label>Summary<textarea name="summary"></textarea></label>
          <label>Date<input name="date" type="date"></label>
          <label>Status<select name="status"><option value="published">published</option><option value="draft">draft</option></select></label>
          <label>Source URL<input name="sourceUrl"></label>
          <label>SEO Title<input name="seoTitle"></label>
          <label>SEO Description<textarea name="seoDescription"></textarea></label>
          <button class="button primary" type="submit">Save News</button>
        </form>
      </div>`;
    const render = () => {
      const q = panel.querySelector("[data-news-search]").value.toLowerCase();
      const status = panel.querySelector("[data-news-status]").value;
      const rows = articles.filter((item) => {
        const haystack = `${item.slug} ${item.title} ${item.summary}`.toLowerCase();
        return (!q || haystack.includes(q)) && (!status || (item.status || "published") === status);
      });
      panel.querySelector("[data-news-table]").innerHTML = table(rows.map((item) => ({
        slug: item.slug,
        title: item.title,
        date: item.date,
        status: item.status || "published",
        action: `<button class="button secondary" data-edit-news="${escapeHtml(item.slug)}">Edit</button>`,
      })), ["slug", "title", "date", "status", "action"], true);
    };
    panel.querySelector("[data-news-search]").addEventListener("input", render);
    panel.querySelector("[data-news-status]").addEventListener("input", render);
    panel.querySelector("[data-export-news]").addEventListener("click", () => exportCsv("news.csv", articles));
    panel.querySelector("[data-collect-news]").addEventListener("click", async () => {
      const result = await api("/api/admin/news/collect", { method: "POST", body: JSON.stringify({}) });
      showStatus(`Collected ${result.candidates.length} candidates. Source errors: ${result.errors.length}`);
      await loadNews();
    });
    panel.querySelector("[data-publish-news]").addEventListener("click", async () => {
      const result = await api("/api/admin/news/publish", { method: "POST", body: JSON.stringify({}) });
      showStatus(`Published ${result.published.length} articles. Job status: ${result.job.status}`);
      await loadNews();
    });
    panel.querySelector("[data-new-article]").addEventListener("click", () => {
      state.selectedArticle = null;
      panel.querySelector("[data-news-editor]").reset();
      panel.querySelector("[name='date']").value = new Date().toISOString().slice(0, 10);
    });
    panel.addEventListener("click", (event) => {
      const button = event.target.closest("[data-edit-news]");
      if (!button) return;
      const article = articles.find((item) => item.slug === button.dataset.editNews);
      state.selectedArticle = article;
      const form = panel.querySelector("[data-news-editor]");
      ["slug", "title", "summary", "date", "status", "sourceUrl", "seoTitle", "seoDescription"].forEach((key) => { form.elements[key].value = article[key] || (key === "status" ? "published" : ""); });
    });
    panel.querySelector("[data-news-editor]").addEventListener("submit", async (event) => {
      event.preventDefault();
      const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
      await api("/api/admin/news", { method: "PUT", body: JSON.stringify(payload) });
      showStatus("News saved.");
      await loadNews();
    });
    render();
  }

  async function loadLinks() {
    const data = await api("/api/admin/links");
    document.querySelector("[data-panel='links']").innerHTML = `
      <div class="cards">
        ${metric("鍐呴摼", data.internal)}
        ${metric("External Links", data.external)}
        ${metric("Empty Links", data.empty)}
        ${metric("Warnings", data.warnings)}
      </div>
      <div class="section-card"><h2>Link Audit</h2>${table(data.rows, ["module", "count", "status", "note"])}</div>`;
  }

  async function loadSettings() {
    const panel = document.querySelector("[data-panel='settings']");
    const data = await api("/api/admin/settings");
    panel.innerHTML = `
      <form class="editor form-grid" data-settings-form>
        <h2>System Settings</h2>
        <label>Company Name<input name="companyName"></label>
        <label>Brand Name<input name="brandName"></label>
        <label>Global Website<input name="globalWebsite"></label>
        <label>Africa Website<input name="africaWebsite"></label>
        <label>Email<input name="email"></label>
        <label>WhatsApp<input name="whatsapp"></label>
        <label>Default Language<input name="defaultLanguage"></label>
        <label>Supported Languages<textarea name="supportedLanguages"></textarea></label>
        <label>Market Coverage<textarea name="marketCoverage"></textarea></label>
        <button class="button primary">Save Settings</button>
      </form>`;
    const form = panel.querySelector("[data-settings-form]");
    Object.keys(data || {}).forEach((key) => {
      if (form.elements[key]) form.elements[key].value = Array.isArray(data[key]) ? data[key].join(", ") : data[key];
    });
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const payload = Object.fromEntries(new FormData(form).entries());
      payload.marketCoverage = splitList(payload.marketCoverage);
      payload.supportedLanguages = splitList(payload.supportedLanguages);
      await api("/api/admin/settings", { method: "PUT", body: JSON.stringify(payload) });
      showStatus("System settings saved.");
    });
  }

  function metric(label, value) {
    return `<div class="metric"><span class="muted">${label}</span><strong>${value ?? 0}</strong></div>`;
  }

  function rankList(items, labelKey, valueKey) {
    const max = Math.max(1, ...(items || []).map((item) => Number(item[valueKey] || 0)));
    const html = (items || []).map((item) => `<p><strong>${escapeHtml(item[labelKey] || "Unknown")}</strong><span class="muted"> ${item[valueKey] || 0}</span></p><div class="bar"><span style="width:${Math.max(6, (Number(item[valueKey] || 0) / max) * 100)}%"></span></div>`).join("");
    return `<div>${html || "<p class='muted'>No data yet. Open frontend pages to record visits.</p>"}</div>`;
  }

  function table(items, keys, allowHtml = false) {
    const rows = (items || []).map((item) => `<tr>${keys.map((key) => `<td>${allowHtml && key === "action" ? item[key] : key === "tag" ? tagBadge(item[key]) : escapeHtml(formatValue(item?.[key]))}</td>`).join("")}</tr>`).join("");
    return `<div class="table-wrap"><table><thead><tr>${keys.map((key) => `<th>${escapeHtml(key)}</th>`).join("")}</tr></thead><tbody>${rows || `<tr><td colspan="${keys.length}">鏆傛棤鏁版嵁</td></tr>`}</tbody></table></div>`;
  }

  function tagBadge(value) {
    const old = String(value).includes("Returning");
    return `<span class="badge ${old ? "old" : "new"}">${escapeHtml(value)}</span>`;
  }

  function exportCsv(filename, rows) {
    const keys = unique(rows.flatMap((row) => Object.keys(row || {}))).filter((key) => typeof rows[0]?.[key] !== "object");
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

  function splitList(value) {
    return String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
  }

  function unique(items) {
    return [...new Set((items || []).filter(Boolean))];
  }

  async function initAdmin() {
    if (!document.body.classList.contains("admin-shell")) return;
    const session = await requireSession();
    if (!session) return;
    document.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => setView(button.dataset.view)));
    document.querySelectorAll("[data-logout]").forEach((button) => button.addEventListener("click", async () => {
      await api("/api/logout", { method: "POST", body: "{}" });
      location.href = "/admin/login/";
    }));
    document.querySelector("[data-refresh]")?.addEventListener("click", () => setView(state.view));
    setView("dashboard");
  }

  initLogin();
  initAdmin();
})();
