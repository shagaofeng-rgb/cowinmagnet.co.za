(function () {
  const state = {
    csrf: "",
    user: null,
    view: "dashboard",
    page: {},
    pageSize: 20,
    analyticsFilters: {},
    openVisitorId: ""
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
    dashboard: ["经营概览", "经营概览"], categories: ["产品分类", "产品分类"], products: ["产品管理", "产品管理"],
    news: ["新闻管理", "新闻与博客"], forms: ["客户线索", "客户线索"], analytics: ["数据分析", "数据分析"],
    visitors: ["客户足迹", "客户足迹"], seo: ["SEO 数据", "SEO 数据"], media: ["媒体库", "媒体库"],
    users: ["账号与权限", "账号与权限"], settings: ["站点设置", "站点设置"]
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
    if (!titles[view]) view = "dashboard";
    state.view = view;
    const info = titles[view] || titles.dashboard;
    qs("[data-section-kicker]").textContent = "Cowinmagnet Africa";
    qs("[data-section-title]").textContent = info[1];
    qsa("[data-view]").forEach((button) => {
      const active = button.dataset.view === view;
      button.classList.toggle("active", active);
      if (active) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
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

  function toolbar(key, filters = "", options = {}) {
    const range = options.range || "all";
    return `<div class="toolbar compact data-toolbar" data-toolbar="${key}">
      <input data-q placeholder="关键词 / 名称 / URL">
      ${filters}
      <select data-range aria-label="时间范围"><option value="all" ${range === "all" ? "selected" : ""}>全部时间</option><option value="today" ${range === "today" ? "selected" : ""}>今天</option><option value="7d" ${range === "7d" ? "selected" : ""}>近 7 天</option><option value="15d" ${range === "15d" ? "selected" : ""}>近 15 天</option><option value="week" ${range === "week" ? "selected" : ""}>本周</option><option value="month" ${range === "month" ? "selected" : ""}>本月</option><option value="custom" ${range === "custom" ? "selected" : ""}>自定义</option></select>
      <input type="date" data-from aria-label="开始日期">
      <input type="date" data-to aria-label="结束日期">
      <select data-page-size aria-label="每页显示数量"><option value="20">20 / 页</option><option value="50">50 / 页</option><option value="100">100 / 页</option></select>
      <button class="button primary" data-search>${label.search}</button>
      <button class="button secondary" data-reset>${label.reset}</button>
    </div>`;
  }

  function query(key) {
    const bar = qs(`[data-toolbar="${key}"]`);
    const params = new URLSearchParams();
    params.set("page", state.page[key] || 1);
    params.set("pageSize", bar?.querySelector("[data-page-size]")?.value || state.pageSize);
    params.set("range", bar?.querySelector("[data-range]")?.value || "all");
    [["q", "[data-q]"], ["status", "[data-status]"], ["from", "[data-from]"], ["to", "[data-to]"]].forEach(([name, selector]) => {
      const value = bar?.querySelector(selector)?.value?.trim();
      if (value) params.set(name, value);
    });
    qsa("[data-query]", bar).forEach((node) => {
      const value = node.value?.trim();
      if (value && node.dataset.query) params.set(node.dataset.query, value);
    });
    return params.toString();
  }

  function bindToolbar(panel, key, load) {
    qs("[data-search]", panel)?.addEventListener("click", () => { state.page[key] = 1; load(); });
    qs("[data-page-size]", panel)?.addEventListener("change", (event) => { state.pageSize = Number(event.target.value) || 20; state.page[key] = 1; load(); });
    qs("[data-reset]", panel)?.addEventListener("click", () => {
      qsa("input,select", qs(`[data-toolbar="${key}"]`, panel)).forEach((node) => { node.value = ""; });
      const toolbarNode = qs(`[data-toolbar="${key}"]`, panel);
      if (toolbarNode) {
        qs("[data-range]", toolbarNode).value = "all";
        qs("[data-page-size]", toolbarNode).value = "20";
      }
      state.page[key] = 1;
      load();
    });
  }

  function bindPager(panel, key, load) {
    qsa("[data-page]", panel).forEach((button) => button.addEventListener("click", () => {
      state.page[key] = Number(button.dataset.page);
      load();
    }));
    qs("[data-page-jump-go]", panel)?.addEventListener("click", () => {
      const input = qs("[data-page-jump]", panel);
      const pages = Number(input?.max || 1);
      state.page[key] = Math.max(1, Math.min(pages, Number(input?.value || 1)));
      load();
    });
  }

  function pager(data, key) {
    const page = data.page || 1;
    const pages = data.pages || data.totalPages || 1;
    return `<div class="pager"><button class="button secondary" data-page="${Math.max(1, page - 1)}" ${page <= 1 ? "disabled" : ""}>上一页</button><span>第 ${page} / ${pages} 页 · 共 ${data.total || 0} 条</span><label class="page-jump">跳至 <input type="number" data-page-jump min="1" max="${pages}" value="${page}" aria-label="跳转页码"> 页</label><button class="button secondary" data-page-jump-go>跳转</button><button class="button secondary" data-page="${Math.min(pages, page + 1)}" ${page >= pages ? "disabled" : ""}>下一页</button></div>`;
  }

  function table(rows, fields, empty = "\u6682\u65e0\u6570\u636e") {
    if (!rows?.length) return `<p>${empty}</p>`;
    return `<div class="table-wrap"><table><thead><tr>${fields.map((field) => `<th>${esc(field.label)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${fields.map((field) => `<td>${field.html ? field.html(row) : esc(typeof field.value === "function" ? field.value(row) : row[field.value])}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  }

  function formatNumber(value) {
    return new Intl.NumberFormat("zh-CN").format(Number(value || 0));
  }

  function formatTime(value) {
    if (!value) return "-";
    const date = new Date(value);
    return Number.isNaN(date.valueOf()) ? String(value) : new Intl.DateTimeFormat("zh-CN", { dateStyle: "short", timeStyle: "short", hour12: false }).format(date);
  }

  function formatDuration(seconds) {
    const total = Math.max(0, Number(seconds || 0));
    if (!total) return "-";
    const minutes = Math.floor(total / 60);
    const remainder = total % 60;
    return minutes ? `${minutes} 分 ${remainder} 秒` : `${remainder} 秒`;
  }

  function shortVisitorId(value) {
    const text = String(value || "");
    return text.length > 14 ? `${text.slice(0, 7)}…${text.slice(-5)}` : text || "-";
  }

  function statusBadge(value, tone = "neutral") {
    return `<span class="status-badge ${tone}">${esc(value || "-")}</span>`;
  }

  function analyticsControls(key, options = {}) {
    const current = state.analyticsFilters[key] || { range: options.defaultRange || "today" };
    const selected = (value) => String(current.range || options.defaultRange || "today") === value ? "selected" : "";
    const sourceSelected = (value) => String(current.channel || "") === value ? "selected" : "";
    const deviceSelected = (value) => String(current.device || "") === value ? "selected" : "";
    return `<div class="analytics-toolbar" data-analytics-toolbar="${key}">
      <label>日期范围<select data-range><option value="all" ${selected("all")}>全部时间</option><option value="today" ${selected("today")}>今天</option><option value="7d" ${selected("7d")}>近 7 天</option><option value="15d" ${selected("15d")}>近 15 天</option><option value="week" ${selected("week")}>本周</option><option value="month" ${selected("month")}>本月</option><option value="custom" ${selected("custom")}>自定义</option></select></label>
      <label>开始日期<input type="date" data-from value="${esc(current.from || "")}"></label>
      <label>结束日期<input type="date" data-to value="${esc(current.to || "")}"></label>
      <label>国家<input data-country placeholder="例如 ZA" value="${esc(current.country || "")}"></label>
      <label>渠道<select data-channel><option value="" ${sourceSelected("")}>全部渠道</option><option value="Direct" ${sourceSelected("Direct")}>Direct</option><option value="Organic Search" ${sourceSelected("Organic Search")}>Organic Search</option><option value="Referral" ${sourceSelected("Referral")}>Referral</option><option value="Social" ${sourceSelected("Social")}>Social</option><option value="Paid" ${sourceSelected("Paid")}>Paid</option><option value="Email" ${sourceSelected("Email")}>Email</option><option value="WhatsApp" ${sourceSelected("WhatsApp")}>WhatsApp</option><option value="Other" ${sourceSelected("Other")}>Other</option></select></label>
      <label>设备<select data-device><option value="" ${deviceSelected("")}>全部设备</option><option value="Desktop" ${deviceSelected("Desktop")}>Desktop</option><option value="Mobile" ${deviceSelected("Mobile")}>Mobile</option><option value="Tablet" ${deviceSelected("Tablet")}>Tablet</option></select></label>
      <label>搜索<input data-visitor-q placeholder="访问路径 / 来源" value="${esc(current.q || "")}"></label>
      <label>每页<select data-page-size><option value="20" ${(current.pageSize || state.pageSize) === "20" || Number(current.pageSize || state.pageSize) === 20 ? "selected" : ""}>20 条</option><option value="50" ${Number(current.pageSize || state.pageSize) === 50 ? "selected" : ""}>50 条</option><option value="100" ${Number(current.pageSize || state.pageSize) === 100 ? "selected" : ""}>100 条</option></select></label>
      <div class="analytics-toolbar-actions"><button class="button primary" data-analytics-apply>应用筛选</button><button class="button secondary" data-analytics-reset>重置</button></div>
    </div>`;
  }

  function analyticsParams(key) {
    const root = qs(`[data-analytics-toolbar="${key}"]`);
    const params = new URLSearchParams();
    params.set("range", root?.querySelector("[data-range]")?.value || "all");
    params.set("page", state.page[key] || 1);
    params.set("pageSize", root?.querySelector("[data-page-size]")?.value || state.pageSize || 20);
    [["from", "[data-from]"], ["to", "[data-to]"], ["country", "[data-country]"], ["channel", "[data-channel]"], ["device", "[data-device]"], ["q", "[data-visitor-q]"]].forEach(([name, selector]) => {
      const value = root?.querySelector(selector)?.value?.trim();
      if (value) params.set(name, value);
    });
    return params;
  }

  function bindAnalyticsControls(panel, key, load) {
    qs("[data-analytics-apply]", panel)?.addEventListener("click", () => { state.page[key] = 1; load(); });
    qs("[data-analytics-reset]", panel)?.addEventListener("click", () => {
      const root = qs(`[data-analytics-toolbar="${key}"]`, panel);
      qsa("input,select", root).forEach((node) => { if (node.type === "checkbox") node.checked = false; else node.value = ""; });
      qs("[data-range]", root).value = "all";
      state.analyticsFilters[key] = { range: "all" };
      state.page[key] = 1;
      load();
    });
  }

  function miniBars(items) {
    const max = Math.max(1, ...items.map((item) => Number(item.pv || item.count || 0)));
    return `<div class="mini-bars">${items.map((item) => {
      const value = Number(item.pv || item.count || 0);
      const width = Math.max(3, Math.round((value / max) * 100));
      return `<div class="mini-bar-row"><span title="${esc(item.bucket || item.name || item.source || item.page)}">${esc(item.bucket || item.name || item.source || item.page)}</span><i><b style="width:${width}%"></b></i><strong>${formatNumber(value)}</strong></div>`;
    }).join("") || '<p class="empty-copy">暂无数据</p>'}</div>`;
  }

  function lineChart(items) {
    const points = items.map((item) => Number(item.pv || item.count || 0));
    if (!points.length) return '<p class="empty-copy">暂无数据</p>';
    const max = Math.max(1, ...points); const width = 680; const height = 210;
    const coords = points.map((value, index) => `${Math.round((index / Math.max(1, points.length - 1)) * width)},${height - Math.round((value / max) * 170) - 18}`).join(" ");
    return `<div class="trend-chart" role="img" aria-label="访问趋势"><svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none"><line x1="0" y1="${height - 18}" x2="${width}" y2="${height - 18}"></line><polyline points="${coords}"></polyline>${points.map((value, index) => { const [x, y] = coords.split(" ")[index].split(","); return `<circle cx="${x}" cy="${y}" r="4"><title>${esc(items[index].bucket || "")}：${formatNumber(value)}</title></circle>`; }).join("")}</svg><div class="chart-labels"><span>${esc(items[0]?.bucket || "")}</span><span>${esc(items.at(-1)?.bucket || "")}</span></div></div>`;
  }

  function visitorTable(report, allowJourney) {
    const items = report?.visitors?.items || [];
    if (!items.length) return '<p class="empty-copy">当前筛选条件下暂无访客记录。</p>';
    return `<div class="table-wrap visitor-table"><table><thead><tr><th>最后访问</th><th>访客</th><th>地区 / IP</th><th>来源</th><th>设备</th><th>回访</th><th>最后页面</th><th>客户状态</th>${allowJourney ? "<th>路径</th>" : ""}</tr></thead><tbody>${items.map((item) => `<tr>
      <td>${formatTime(item.lastSeenAt)}</td><td><code>${esc(shortVisitorId(item.visitorId))}</code><small>PV ${formatNumber(item.pv)}</small></td>
      <td>${esc(item.country || "Unknown")}<small>${esc(item.ip || "masked")}</small></td>
      <td>${esc(item.channel || "Direct")}<small>${esc(item.source || "-")}</small></td>
      <td>${esc(item.device || "-")}<small>${esc(item.browser || "-")}</small></td>
      <td>${formatNumber(item.visitCount || 1)} 次</td><td class="page-path">${esc(item.lastPage || "-")}</td>
      <td>${statusBadge(item.leadStatus, item.leadStatus === "Lead" ? "success" : "neutral")}</td>
      ${allowJourney ? `<td><button class="text-button" data-visitor-id="${esc(item.visitorId)}">查看路径</button></td>` : ""}</tr>`).join("")}</tbody></table></div>`;
  }

  async function dashboard() {
    const panel = qs("[data-panel='dashboard']");
    const key = "dashboard";
    if (!state.analyticsFilters[key]) state.analyticsFilters[key] = { range: "today", pageSize: 20 };
    panel.innerHTML = `${analyticsControls(key, { defaultRange: "today" })}<div data-dashboard-results><section class="section-card">${label.loading}</section></div>`;
    const load = async () => {
      const params = analyticsParams(key);
      params.set("includeVisitors", "1");
      params.set("pageSize", "8");
      state.analyticsFilters[key] = Object.fromEntries(params.entries());
      const results = qs("[data-dashboard-results]", panel);
      results.innerHTML = '<section class="section-card"><p class="empty-copy">正在更新当前筛选数据…</p></section>';
      const [site, report] = await Promise.all([
        api(`/api/admin/dashboard?${params.toString()}`),
        api(`/api/admin/analytics?${params.toString()}`)
      ]);
      results.innerHTML = [
      metrics([
        { label: "PV", value: formatNumber(report.pv), note: "当前筛选条件" },
        { label: "UV", value: formatNumber(report.uv), note: "独立访客" },
        { label: "有效会话", value: formatNumber(report.sessions), note: "按访客会话归并" },
        { label: "询盘提交", value: formatNumber(report.enquiries || site.unreadEnquiries), note: `转化率 ${report.conversionRate || 0}%` },
        { label: "WhatsApp 点击", value: formatNumber(report.whatsappClicks), note: "高意向动作" }
      ]),
      `<div class="dashboard-grid"><section class="section-card span-2"><div class="card-heading"><h2>访问趋势</h2><a class="text-link" href="?view=analytics">查看分析</a></div>${lineChart(report.timeline || [])}</section>
      <section class="section-card"><h2>来源渠道</h2>${miniBars(report.channels || [])}</section></div>`,
      `<div class="dashboard-grid"><section class="section-card span-2"><div class="card-heading"><h2>最近访客</h2><a class="text-link" href="?view=visitors">查看足迹</a></div>${visitorTable({ ...report, visitors: { ...(report.visitors || {}), items: (report.visitors?.items || []).slice(0, 8) } }, false)}</section>
      <section class="section-card"><h2>来源平台</h2>${miniBars((report.sources || []).map((item) => ({ name: item.source, count: item.pv })))}</section></div>`
      ].join("");
    };
    bindAnalyticsControls(panel, key, load);
    await load();
  }

  async function categories() {
    const key = "categories";
    const panel = qs("[data-panel='categories']");
    panel.innerHTML = card("\u4ea7\u54c1\u5206\u7c7b", `${toolbar(key, `<select data-status><option value="">\u5168\u90e8\u72b6\u6001</option><option value="active">Active</option><option value="disabled">Disabled</option></select>`)}<div class="actions"><a class="button secondary" href="/api/admin/categories/export">${label.exportCsv}</a></div><div data-list>${label.loading}</div>`);
    const load = async () => {
      const queryString = query(key);
      const data = await api(`/api/admin/categories?${queryString}`);
      const exportLink = qs("a[href^='/api/admin/categories/export']", panel);
      if (exportLink) exportLink.href = `/api/admin/categories/export?${queryString}`;
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
      const queryString = query(key);
      const data = await api(`/api/admin/products?${queryString}`);
      const exportLink = qs("a[href^='/api/admin/products/export']", panel);
      if (exportLink) exportLink.href = `/api/admin/products/export?${queryString}`;
      qs("[data-list]", panel).innerHTML = table(data.items || [], [{ label: "\u4ea7\u54c1", value: (row) => row.name || row.title }, { label: "\u5206\u7c7b", value: (row) => row.category || row.categoryName || row.categorySlug }, { label: "Slug", value: "slug" }, { label: "SEO Title", value: "seoTitle" }, { label: "\u56fe\u7247", value: (row) => row.image || row.featuredImage }]) + pager(data, key);
      bindPager(panel, key, load);
    };
    bindToolbar(panel, key, load);
    await load();
  }

  async function news() {
    const key = "news";
    const panel = qs("[data-panel='news']");
    panel.innerHTML = card("\u65b0\u95fb\u5185\u5bb9", `${toolbar(key, `<select data-status><option value="">\u5168\u90e8</option><option value="published">Published</option><option value="draft">Draft</option></select>`)}<div class="actions"><a class="button secondary" href="/api/admin/news/export">${label.exportCsv}</a></div><div data-list>${label.loading}</div>`);
    const load = async () => {
      const queryString = query(key);
      const data = await api(`/api/admin/news?${queryString}`);
      const exportLink = qs("a[href^='/api/admin/news/export']", panel);
      if (exportLink) exportLink.href = `/api/admin/news/export?${queryString}`;
      qs("[data-list]", panel).innerHTML = table(data.items || [], [{ label: "\u6807\u9898", value: "title" }, { label: "\u5206\u7c7b", value: "category" }, { label: "\u72b6\u6001", value: "status" }, { label: "\u65e5\u671f", value: (row) => row.date || row.publishedAt }, { label: "Slug", value: "slug" }]) + pager(data, key);
      bindPager(panel, key, load);
    };
    bindToolbar(panel, key, load);
    await load();
  }

  async function forms() {
    const key = "forms";
    const panel = qs("[data-panel='forms']");
    panel.innerHTML = card("\u5ba2\u6237\u8868\u5355", `${toolbar(key, `<select data-status><option value="">\u5168\u90e8\u72b6\u6001</option><option value="New">New</option><option value="In Progress">In Progress</option><option value="Closed">Closed</option></select><input data-query="country" placeholder="\u56fd\u5bb6 / \u5730\u533a"><input data-query="product" placeholder="\u4ea7\u54c1\u5173\u952e\u8bcd"><input data-query="source" placeholder="\u6765\u6e90 / \u843d\u5730\u9875">`)}<div class="actions"><a class="button secondary" data-export-enquiries href="/api/admin/enquiries/export">${label.exportCsv}</a></div><div data-list>${label.loading}</div><section class="section-card enquiry-detail" data-enquiry-detail hidden></section>`);
    const load = async () => {
      const queryString = query(key);
      const data = await api(`/api/admin/enquiries?${queryString}`);
      const exportLink = qs("[data-export-enquiries]", panel);
      if (exportLink) exportLink.href = `/api/admin/enquiries/export?${queryString}`;
      qs("[data-list]", panel).innerHTML = table(data.items || [], [{ label: "\u63d0\u4ea4\u65f6\u95f4", value: (row) => formatTime(row.submissionTime || row.createdAt) }, { label: "\u5ba2\u6237", value: (row) => [row.name, row.company].filter(Boolean).join(" / ") || "-" }, { label: "\u90ae\u7bb1", value: "email" }, { label: "\u4ea7\u54c1", value: "product" }, { label: "\u72b6\u6001", value: "status" }, { label: "\u64cd\u4f5c", html: (row) => `<button class="text-button" data-enquiry-id="${esc(row.id)}">\u67e5\u770b\u8be6\u60c5</button>` }]) + pager(data, key);
      bindPager(panel, key, load);
      qsa("[data-enquiry-id]", panel).forEach((button) => button.addEventListener("click", () => openEnquiryDetail(panel, button.dataset.enquiryId)));
    };
    bindToolbar(panel, key, load);
    await load();
  }

  function detailGrid(items) {
    return `<div class="detail-grid">${items.map(([label, value]) => `<div><span>${esc(label)}</span><strong>${esc(value || "-")}</strong></div>`).join("")}</div>`;
  }

  function detailSection(title, items, open = false) {
    if (!items.length) return "";
    return `<details class="detail-section" ${open ? "open" : ""}><summary>${esc(title)} <span>${items.length} 项</span></summary>${detailGrid(items)}</details>`;
  }

  async function openEnquiryDetail(panel, enquiryId) {
    const detail = qs("[data-enquiry-detail]", panel);
    if (!detail) return;
    detail.hidden = false;
    detail.innerHTML = `<div class="card-heading"><div><h2>询盘详情</h2><p>正在读取客户资料与关联访问记录…</p></div><button class="text-button" data-close-enquiry>收起</button></div>`;
    try {
      const data = await api(`/api/admin/enquiries/${encodeURIComponent(enquiryId)}`);
      const enquiry = data.enquiry || {};
      const visitor = data.visitor?.visitor;
      const payload = Object.entries(enquiry.payload || {})
        .filter(([key, value]) => !["website", "analyticsClientId", "analyticsSessionId", "fileUpload", "duplicateKey"].includes(key) && (typeof value === "string" || typeof value === "number" || typeof value === "boolean"))
        .filter(([, value]) => typeof value === "boolean" || (String(value || "").trim() && String(value).trim() !== "-"));
      const technicalKeys = /^(product|productRequired|capacity|material|belt|tramp|cleaning|voltage|frequency|suspension)/i;
      const projectKeys = /^(project|installation|siteType|region|coastal|temperature|humidity|altitude|dust|operating)/i;
      const technicalPayload = payload.filter(([key]) => technicalKeys.test(key));
      const projectPayload = payload.filter(([key]) => projectKeys.test(key));
      const otherPayload = payload.filter(([key]) => !technicalKeys.test(key) && !projectKeys.test(key));
      const notes = enquiry.internalNotes || [];
      detail.innerHTML = `<div class="card-heading"><div><h2>${esc(enquiry.name || "客户询盘")}</h2><p>${esc(enquiry.id || "")} · ${formatTime(enquiry.submissionTime)}</p></div><button class="text-button" data-close-enquiry>收起</button></div>
        <h3>客户与询盘</h3>${detailGrid([["公司", enquiry.company], ["邮箱", enquiry.email], ["电话 / WhatsApp", enquiry.phone || enquiry.whatsapp], ["国家 / 地区", enquiry.country || enquiry.region], ["意向产品", enquiry.product], ["行业", enquiry.industry], ["处理状态", enquiry.status], ["提交页面", enquiry.sourcePage]])}
        <h3>来源归因</h3>${visitor ? detailGrid([["首次来源", `${visitor.firstChannel || "Direct"} / ${visitor.firstSource || "Direct"}`], ["最近来源", `${visitor.lastChannel || visitor.channel || "Direct"} / ${visitor.lastSource || visitor.source || "Direct"}`], ["首次访问", formatTime(visitor.firstSeenAt)], ["最近访问", formatTime(visitor.lastSeenAt)], ["访客编号", shortVisitorId(visitor.visitorId)]]) : '<p class="empty-copy">该历史询盘没有可关联的访客访问记录。</p>'}
        ${visitor ? `<div class="actions"><button class="button secondary" data-open-enquiry-visitor="${esc(visitor.visitorId)}">查看完整浏览路径</button></div>` : ""}
        <h3>客户填写内容</h3>${payload.length ? `${detailSection("技术与产品要求", technicalPayload.map(([key, value]) => [key, typeof value === "boolean" ? (value ? "Yes" : "No") : String(value)]), true)}${detailSection("项目环境与安装信息", projectPayload.map(([key, value]) => [key, typeof value === "boolean" ? (value ? "Yes" : "No") : String(value)]))}${detailSection("其他填写内容", otherPayload.map(([key, value]) => [key, typeof value === "boolean" ? (value ? "Yes" : "No") : String(value)]))}` : '<p class="empty-copy">没有额外填写字段。</p>'}
        <h3>跟进记录</h3>${notes.length ? table(notes, [{ label: "时间", value: (item) => formatTime(item.time) }, { label: "操作人", value: "user" }, { label: "记录", value: "note" }]) : '<p class="empty-copy">暂无跟进记录。</p>'}`;
      qs("[data-close-enquiry]", detail)?.addEventListener("click", () => { detail.hidden = true; });
      qs("[data-open-enquiry-visitor]", detail)?.addEventListener("click", (event) => {
        state.openVisitorId = event.currentTarget.dataset.openEnquiryVisitor || "";
        activate("visitors");
      });
      detail.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } catch (error) {
      detail.innerHTML = `<h2>询盘详情</h2><p class="error-copy">${esc(error.message)}</p>`;
    }
  }

  async function analytics() {
    const key = "analytics";
    const panel = qs("[data-panel='analytics']");
    panel.innerHTML = `${analyticsControls(key)}<div data-analytics-results><section class="section-card">${label.loading}</section></div>`;
    const load = async () => {
      const params = analyticsParams(key);
      state.analyticsFilters[key] = Object.fromEntries(params.entries());
      params.set("includeVisitors", "0");
      const results = qs("[data-analytics-results]", panel);
      results.innerHTML = '<section class="section-card"><p class="empty-copy">正在更新当前筛选数据…</p></section>';
      const data = await api(`/api/admin/analytics?${params.toString()}`);
      results.innerHTML = [
        metrics([
          { label: "PV", value: formatNumber(data.pv), note: "当前日期与筛选条件" },
          { label: "UV", value: formatNumber(data.uv), note: "独立访客" },
          { label: "会话", value: formatNumber(data.sessions), note: "访问会话" },
          { label: "询盘", value: formatNumber(data.enquiries), note: `转化率 ${data.conversionRate || 0}%` },
          { label: "WhatsApp", value: formatNumber(data.whatsappClicks), note: "点击事件" }
        ]),
        `<div class="dashboard-grid"><section class="section-card span-2"><h2>访问趋势</h2>${lineChart(data.timeline || [])}</section><section class="section-card"><h2>国家 / 地区</h2>${miniBars(data.countries || [])}</section></div>`,
        `<div class="dashboard-grid"><section class="section-card"><h2>来源渠道</h2>${miniBars(data.channels || [])}</section><section class="section-card"><h2>来源平台</h2>${miniBars((data.sources || []).map((item) => ({ name: item.source, count: item.pv })))}</section><section class="section-card"><h2>热门页面</h2>${miniBars(data.pages || [])}</section></div>`,
        `<section class="section-card"><h2>设备与浏览器</h2>${table(data.deviceBrowsers || [], [{ label: "设备", value: "device" }, { label: "浏览器", value: "browser" }, { label: "访问", value: "views" }])}</section>`
      ].join("");
    };
    bindAnalyticsControls(panel, key, load);
    await load();
  }

  async function openVisitorJourney(panel, visitorId, refreshList) {
    const journey = qs("[data-journey]", panel);
    if (!journey || !visitorId) return;
    journey.hidden = false;
    journey.innerHTML = "<h2>访问路径</h2><p>正在读取访客的浏览记录…</p>";
    try {
      const detail = await api(`/api/admin/analytics/visitors/${encodeURIComponent(visitorId)}`);
      const sessions = detail.sessions || [];
      const linkedEnquiries = detail.enquiries || [];
      journey.innerHTML = `<div class="card-heading"><div><h2>访客详情：${esc(shortVisitorId(detail.visitor?.visitorId))}</h2><p>${esc(detail.visitor?.country || "Unknown")} · ${esc(detail.visitor?.firstChannel || detail.visitor?.channel || "Direct")} / ${esc(detail.visitor?.firstSource || detail.visitor?.source || "Direct")} · ${formatNumber(detail.visitor?.pv)} 次页面访问 · ${formatNumber(detail.visitor?.sessionCount || sessions.length)} 个会话</p></div><button class="text-button" data-close-journey>收起</button></div>
        <div class="journey-summary"><div><span>首次访问</span><strong>${formatTime(detail.visitor?.firstSeenAt)}</strong></div><div><span>最近访问</span><strong>${formatTime(detail.visitor?.lastSeenAt)}</strong></div><div><span>设备</span><strong>${esc(detail.visitor?.device || "-")} / ${esc(detail.visitor?.browser || "-")}</strong></div><div><span>脱敏 IP</span><strong>${esc(detail.visitor?.ip || "-")}</strong></div></div>
        <div class="visitor-classification"><label>客户分类<select data-lead-status><option value="Anonymous">匿名访客</option><option value="Potential lead">潜在线索</option><option value="Lead">线索</option><option value="Customer">客户</option></select></label><button class="button secondary" data-save-visitor>保存分类</button></div>
        <h3>访问会话</h3>${table(sessions, [{ label: "开始", value: (item) => formatTime(item.startedAt) }, { label: "结束", value: (item) => formatTime(item.endedAt) }, { label: "预计时长", value: (item) => formatDuration(item.estimatedDurationSeconds) }, { label: "入口页面", value: "entryPage" }, { label: "退出页面", value: "exitPage" }, { label: "来源", value: (item) => item.source || item.channel }, { label: "页面浏览", value: "pv" }], "暂无有效会话")}
        <h3>已关联客户表单</h3>${table(linkedEnquiries, [{ label: "提交时间", value: (item) => formatTime(item.submissionTime) }, { label: "客户", value: (item) => [item.name, item.company].filter(Boolean).join(" / ") || "-" }, { label: "产品", value: "product" }, { label: "状态", value: "status" }, { label: "来源页面", value: "sourcePage" }], "该访客尚未提交表单")}
        <h3>浏览明细</h3><p class="data-note">“预计停留”按同一会话的下一次行为计算，超过 30 分钟或无后续行为时不计入，避免虚构停留时长。</p>${table(detail.events?.items || detail.items || [], [{ label: "时间", value: (item) => formatTime(item.time) }, { label: "会话", value: (item) => shortVisitorId(item.sessionId) }, { label: "行为", value: "eventType" }, { label: "页面", value: "page" }, { label: "预计停留", value: (item) => formatDuration(item.estimatedDwellSeconds) }, { label: "来源", value: (item) => item.source || item.channel }, { label: "UTM", value: (item) => [item.utmSource, item.utmMedium, item.utmCampaign].filter(Boolean).join(" / ") || "-" }])}`;
      const statusField = qs("[data-lead-status]", journey);
      if (statusField) statusField.value = detail.visitor?.leadStatus || "Anonymous";
      qs("[data-save-visitor]", journey)?.addEventListener("click", async () => {
        await api(`/api/admin/analytics/visitors/${encodeURIComponent(visitorId)}`, { method: "POST", body: JSON.stringify({ leadStatus: statusField?.value || "Anonymous" }) });
        setStatus("访客分类已保存");
        await refreshList();
      });
      qs("[data-close-journey]", journey)?.addEventListener("click", () => { journey.hidden = true; });
      journey.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } catch (error) {
      journey.innerHTML = `<h2>访问路径</h2><p class="error-copy">${esc(error.message)}</p>`;
    }
  }

  async function visitors() {
    const key = "visitors";
    const panel = qs("[data-panel='visitors']");
    panel.innerHTML = `${analyticsControls(key)}<div data-visitors-results><section class="section-card">${label.loading}</section></div><section class="section-card visitor-journey" data-journey hidden></section>`;
    const load = async () => {
      const params = analyticsParams(key);
      state.analyticsFilters[key] = Object.fromEntries(params.entries());
      params.set("scope", "visitors");
      const results = qs("[data-visitors-results]", panel);
      results.innerHTML = '<section class="section-card"><p class="empty-copy">正在更新当前筛选数据…</p></section>';
      const data = await api(`/api/admin/analytics?${params.toString()}`);
      const exportUrl = `/api/admin/analytics/export?${params.toString()}`;
      results.innerHTML = `<section class="section-card"><div class="card-heading"><div><h2>访客列表</h2><p>每页 ${data.visitors?.pageSize || 20} 条</p></div><a class="button secondary" href="${exportUrl}">导出 CSV</a></div>${visitorTable(data, true)}${pager(data.visitors || {}, key)}</section>`;
      bindPager(panel, key, load);
      qsa("[data-visitor-id]", results).forEach((button) => button.addEventListener("click", () => openVisitorJourney(panel, button.dataset.visitorId, load)));
      if (state.openVisitorId) {
        const visitorId = state.openVisitorId;
        state.openVisitorId = "";
        await openVisitorJourney(panel, visitorId, load);
      }
    };
    bindAnalyticsControls(panel, key, load);
    await load();
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
      const queryString = query(key);
      const data = await api(`/api/admin/media?${queryString}`);
      const exportLink = qs("a[href^='/api/admin/media/export']", panel);
      if (exportLink) exportLink.href = `/api/admin/media/export?${queryString}`;
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
    qs("[data-panel='sync']").innerHTML = card("\u6570\u636e\u6e90", `<div class="actions"><button class="button primary" data-sync-gsc>\u540c\u6b65 Google SEO</button></div>${table(data.sources || [], [{ label: "\u6570\u636e\u6e90", value: "name" }, { label: "\u914d\u7f6e", value: (row) => row.configured ? "\u5df2\u914d\u7f6e" : "\u672a\u914d\u7f6e" }, { label: "\u72b6\u6001", value: "status" }, { label: "\u6700\u8fd1\u540c\u6b65", value: "lastSync" }])}`) + card("\u6700\u8fd1\u4efb\u52a1", table(data.jobs || [], [{ label: "\u65f6\u95f4", value: "time" }, { label: "\u7c7b\u578b", value: "type" }, { label: "\u72b6\u6001", value: "status" }, { label: "\u8bf4\u660e", value: "message" }]));
    qs("[data-sync-gsc]")?.addEventListener("click", async () => { await api("/api/admin/sync/google-seo", { method: "POST" }); setStatus("Google SEO \u540c\u6b65\u5b8c\u6210"); activate("sync"); });
  }

  async function logs() {
    const key = "logs";
    const panel = qs("[data-panel='logs']");
    panel.innerHTML = card("\u64cd\u4f5c\u65e5\u5fd7", `${toolbar(key)}<div class="actions"><a class="button secondary" href="/api/admin/audit-logs/export">${label.exportCsv}</a></div><div data-list>${label.loading}</div>`);
    const load = async () => {
      const queryString = query(key);
      const data = await api(`/api/admin/audit-logs?${queryString}`);
      const exportLink = qs("a[href^='/api/admin/audit-logs/export']", panel);
      if (exportLink) exportLink.href = `/api/admin/audit-logs/export?${queryString}`;
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

  const loaders = { dashboard, categories, products, news, forms, analytics, visitors, seo, media, users, settings };

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
