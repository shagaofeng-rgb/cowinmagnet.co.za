(function () {
  const state = {
    csrf: "",
    user: null,
    view: "dashboard",
    page: {},
    pageSize: 20,
    analyticsFilters: {}
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
    analytics: ["流量分析", "真实流量分析", "按日期、国家、渠道、设备与页面查看已过滤的真实访问数据。"],
    visitors: ["访客档案", "访客记录与访问路径", "查看匿名访客的地区、来源、访问时间、回访次数与实际浏览路径。"],
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
    if (!titles[view]) view = "dashboard";
    state.view = view;
    const info = titles[view] || titles.dashboard;
    qs("[data-section-kicker]").textContent = "Cowinmagnet Africa";
    qs("[data-section-title]").textContent = info[1];
    qs("[data-section-desc]").textContent = info[2];
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

  function toolbar(key, filters = "") {
    return `<div class="toolbar compact" data-toolbar="${key}">
      <input data-q placeholder="关键词 / 名称 / URL">
      ${filters}
      <select data-page-size aria-label="每页显示数量"><option value="20">20 / 页</option><option value="50">50 / 页</option><option value="100">100 / 页</option></select>
      <button class="button secondary" data-search>${label.search}</button>
      <button class="button secondary" data-reset>${label.reset}</button>
    </div>`;
  }

  function query(key) {
    const bar = qs(`[data-toolbar="${key}"]`);
    const params = new URLSearchParams();
    params.set("page", state.page[key] || 1);
    params.set("pageSize", bar?.querySelector("[data-page-size]")?.value || state.pageSize);
    if (bar?.querySelector("[data-q]")?.value) params.set("q", bar.querySelector("[data-q]").value.trim());
    if (bar?.querySelector("[data-status]")?.value) params.set("status", bar.querySelector("[data-status]").value);
    return params.toString();
  }

  function bindToolbar(panel, key, load) {
    qs("[data-search]", panel)?.addEventListener("click", () => { state.page[key] = 1; load(); });
    qs("[data-page-size]", panel)?.addEventListener("change", (event) => { state.pageSize = Number(event.target.value) || 20; state.page[key] = 1; load(); });
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
    const pages = data.pages || data.totalPages || 1;
    return `<div class="pager"><button class="button secondary" data-page="${Math.max(1, page - 1)}" ${page <= 1 ? "disabled" : ""}>\u4e0a\u4e00\u9875</button><span>${page} / ${pages} · ${data.total || 0}</span><button class="button secondary" data-page="${Math.min(pages, page + 1)}" ${page >= pages ? "disabled" : ""}>\u4e0b\u4e00\u9875</button></div>`;
  }

  function table(rows, fields, empty = "\u6682\u65e0\u6570\u636e") {
    if (!rows?.length) return `<p>${empty}</p>`;
    return `<div class="table-wrap"><table><thead><tr>${fields.map((field) => `<th>${esc(field.label)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${fields.map((field) => `<td>${esc(typeof field.value === "function" ? field.value(row) : row[field.value])}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  }

  function formatNumber(value) {
    return new Intl.NumberFormat("zh-CN").format(Number(value || 0));
  }

  function formatTime(value) {
    if (!value) return "-";
    const date = new Date(value);
    return Number.isNaN(date.valueOf()) ? String(value) : new Intl.DateTimeFormat("zh-CN", { dateStyle: "short", timeStyle: "short", hour12: false }).format(date);
  }

  function shortVisitorId(value) {
    const text = String(value || "");
    return text.length > 14 ? `${text.slice(0, 7)}…${text.slice(-5)}` : text || "-";
  }

  function statusBadge(value, tone = "neutral") {
    return `<span class="status-badge ${tone}">${esc(value || "-")}</span>`;
  }

  function analyticsControls(key, options = {}) {
    const current = state.analyticsFilters[key] || { range: "today" };
    const selected = (value) => String(current.range || "today") === value ? "selected" : "";
    const sourceSelected = (value) => String(current.channel || "") === value ? "selected" : "";
    const deviceSelected = (value) => String(current.device || "") === value ? "selected" : "";
    const includeExcluded = options.includeExcluded || current.includeExcluded === "1" ? "checked" : "";
    return `<div class="analytics-toolbar" data-analytics-toolbar="${key}">
      <label>日期范围<select data-range><option value="today" ${selected("today")}>今天</option><option value="yesterday" ${selected("yesterday")}>昨天</option><option value="7d" ${selected("7d")}>近 7 天</option><option value="30d" ${selected("30d")}>近 30 天</option><option value="month" ${selected("month")}>本月</option><option value="custom" ${selected("custom")}>自定义</option></select></label>
      <label>开始日期<input type="date" data-from value="${esc(current.from || "")}"></label>
      <label>结束日期<input type="date" data-to value="${esc(current.to || "")}"></label>
      <label>国家<input data-country placeholder="例如 ZA" value="${esc(current.country || "")}"></label>
      <label>渠道<select data-channel><option value="" ${sourceSelected("")}>全部渠道</option><option value="Direct" ${sourceSelected("Direct")}>Direct</option><option value="Organic Search" ${sourceSelected("Organic Search")}>Organic Search</option><option value="Referral" ${sourceSelected("Referral")}>Referral</option><option value="Social" ${sourceSelected("Social")}>Social</option><option value="Campaign" ${sourceSelected("Campaign")}>Campaign</option></select></label>
      <label>设备<select data-device><option value="" ${deviceSelected("")}>全部设备</option><option value="Desktop" ${deviceSelected("Desktop")}>Desktop</option><option value="Mobile" ${deviceSelected("Mobile")}>Mobile</option><option value="Tablet" ${deviceSelected("Tablet")}>Tablet</option></select></label>
      <label>搜索<input data-visitor-q placeholder="访问路径 / 来源" value="${esc(current.q || "")}"></label>
      <label class="check-control"><input type="checkbox" data-include-excluded ${includeExcluded}> 同时查看已排除流量</label>
      <div class="analytics-toolbar-actions"><button class="button primary" data-analytics-apply>应用筛选</button><button class="button secondary" data-analytics-reset>重置</button></div>
    </div>`;
  }

  function analyticsParams(key) {
    const root = qs(`[data-analytics-toolbar="${key}"]`);
    const params = new URLSearchParams();
    params.set("range", root?.querySelector("[data-range]")?.value || "today");
    params.set("page", state.page[key] || 1);
    params.set("pageSize", root?.querySelector("[data-page-size]")?.value || state.pageSize || 20);
    [["from", "[data-from]"], ["to", "[data-to]"], ["country", "[data-country]"], ["channel", "[data-channel]"], ["device", "[data-device]"], ["q", "[data-visitor-q]"]].forEach(([name, selector]) => {
      const value = root?.querySelector(selector)?.value?.trim();
      if (value) params.set(name, value);
    });
    if (root?.querySelector("[data-include-excluded]")?.checked) params.set("includeExcluded", "1");
    return params;
  }

  function bindAnalyticsControls(panel, key, load) {
    qs("[data-analytics-apply]", panel)?.addEventListener("click", () => { state.page[key] = 1; load(); });
    qs("[data-analytics-reset]", panel)?.addEventListener("click", () => {
      const root = qs(`[data-analytics-toolbar="${key}"]`, panel);
      qsa("input,select", root).forEach((node) => { if (node.type === "checkbox") node.checked = false; else node.value = ""; });
      qs("[data-range]", root).value = "today";
      state.analyticsFilters[key] = { range: "today" };
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
    }).join("") || '<p class="empty-copy">暂无符合条件的真实访问。</p>'}</div>`;
  }

  function dataHealth(health) {
    const ready = health?.configured && health?.mode === "postgresql";
    const message = ready ? `PostgreSQL 已连接，最近事件：${formatTime(health.latestEventAt)}。` : "持久化统计未连接，网站不会伪造访问数据；请在生产环境配置 DATABASE_URL 后启用。";
    return `<div class="data-health ${ready ? "ready" : "warning"}"><div><strong>${ready ? "真实数据采集已启用" : "数据采集待连接"}</strong><p>${esc(message)}</p></div><span>${ready ? "LIVE" : "ACTION REQUIRED"}</span></div>`;
  }

  function visitorTable(report, allowJourney) {
    const items = report?.visitors?.items || [];
    if (!items.length) return '<p class="empty-copy">当前筛选下没有真实访客记录。系统已自动排除机器人、Collects、测试与本机流量。</p>';
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
    panel.innerHTML = card(label.loading, "");
    const [site, report, health, sync] = await Promise.all([
      api("/api/admin/dashboard"),
      api("/api/admin/analytics?range=today&pageSize=8"),
      api("/api/admin/analytics/health"),
      api("/api/admin/sync")
    ]);
    panel.innerHTML = [
      dataHealth(health),
      metrics([
        { label: "今日 PV", value: formatNumber(report.pv), note: "已过滤无效流量" },
        { label: "今日 UV", value: formatNumber(report.uv), note: "独立访客" },
        { label: "有效会话", value: formatNumber(report.sessions), note: "按访客会话归并" },
        { label: "询盘提交", value: formatNumber(report.enquiries || site.unreadEnquiries), note: `转化率 ${report.conversionRate || 0}%` },
        { label: "WhatsApp 点击", value: formatNumber(report.whatsappClicks), note: "高意向动作" },
        { label: "已排除", value: formatNumber(report.excluded), note: "测试 / 机器人 / Collects" }
      ]),
      `<div class="dashboard-grid"><section class="section-card span-2"><div class="card-heading"><div><h2>今日流量趋势</h2><p>以 Africa/Johannesburg 时区统计，数据按实时事件汇总。</p></div><a class="text-link" href="?view=analytics">查看完整分析</a></div>${miniBars(report.timeline || [])}</section>
      <section class="section-card"><div class="card-heading"><div><h2>流量来源</h2><p>识别直接、自然搜索、引荐、社交和活动渠道。</p></div></div>${miniBars(report.channels || [])}</section></div>`,
      `<div class="dashboard-grid"><section class="section-card span-2"><div class="card-heading"><div><h2>最近真实访客</h2><p>仅展示未被排除的访问记录，IP 已做隐私脱敏。</p></div><a class="text-link" href="?view=visitors">访客档案</a></div>${visitorTable(report, false)}</section>
      <section class="section-card"><h2>同步与运行状态</h2>${table(sync.sources || [], [{ label: "数据源", value: "name" }, { label: "状态", value: "status" }, { label: "最近同步", value: "lastSync" }])}</section></div>`
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
    panel.innerHTML = card("\u65b0\u95fb\u5185\u5bb9", `${toolbar(key, `<select data-status><option value="">\u5168\u90e8</option><option value="published">Published</option><option value="draft">Draft</option></select>`)}<div class="actions"><a class="button secondary" href="/api/admin/news/export">${label.exportCsv}</a></div><div data-automation>${label.loading}</div><div data-list>${label.loading}</div>`);
    const load = async () => {
      const [data, automation] = await Promise.all([api(`/api/admin/news?${query(key)}`), api("/api/admin/news-automation")]);
      qs("[data-automation]", panel).innerHTML = `<p><strong>News QA gate:</strong> ${automation.productionReady ? "Ready" : "Blocked"}. Preproduction approvals: ${automation.approvedPreproduction}/${automation.requiredPreproductionApprovals}. ${esc((automation.blockers || []).join(" "))}</p>`;
      qs("[data-list]", panel).innerHTML = table(data.items || [], [{ label: "\u6807\u9898", value: "title" }, { label: "\u5206\u7c7b", value: "category" }, { label: "\u72b6\u6001", value: "status" }, { label: "\u65e5\u671f", value: (row) => row.date || row.publishedAt }, { label: "Slug", value: "slug" }]) + pager(data, key);
      bindPager(panel, key, load);
    };
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
    const key = "analytics";
    const panel = qs("[data-panel='analytics']");
    panel.innerHTML = `${analyticsControls(key)}<section class="section-card">${label.loading}</section>`;
    const load = async () => {
      const params = analyticsParams(key);
      state.analyticsFilters[key] = Object.fromEntries(params.entries());
      const [data, health, exclusions] = await Promise.all([
        api(`/api/admin/analytics?${params.toString()}`),
        api("/api/admin/analytics/health"),
        api("/api/admin/analytics/exclusions")
      ]);
      panel.innerHTML = [
        analyticsControls(key, { includeExcluded: params.get("includeExcluded") === "1" }),
        dataHealth(health),
        metrics([
          { label: "PV", value: formatNumber(data.pv), note: "当前日期与筛选条件" },
          { label: "UV", value: formatNumber(data.uv), note: "独立访客" },
          { label: "会话", value: formatNumber(data.sessions), note: "访问会话" },
          { label: "询盘", value: formatNumber(data.enquiries), note: `转化率 ${data.conversionRate || 0}%` },
          { label: "WhatsApp", value: formatNumber(data.whatsappClicks), note: "点击事件" },
          { label: "排除流量", value: formatNumber(data.excluded), note: "仅在勾选时计入明细" }
        ]),
        `<div class="dashboard-grid"><section class="section-card span-2"><h2>访问趋势</h2>${miniBars(data.timeline || [])}</section><section class="section-card"><h2>国家 / 地区</h2>${miniBars(data.countries || [])}</section></div>`,
        `<div class="dashboard-grid"><section class="section-card"><h2>来源渠道</h2>${miniBars(data.channels || [])}</section><section class="section-card"><h2>热门页面</h2>${miniBars(data.pages || [])}</section><section class="section-card"><h2>设备与浏览器</h2>${table(data.deviceBrowsers || [], [{ label: "设备", value: "device" }, { label: "浏览器", value: "browser" }, { label: "访问", value: "views" }])}</section></div>`,
        `<section class="section-card"><div class="card-heading"><div><h2>排除规则</h2><p>已启用 ${(exclusions.items || []).filter((item) => item.enabled).length} 条规则。机器人、测试、本机和 Collects 流量默认不进入业务指标。</p></div><a class="text-link" href="?view=visitors">检查访客</a></div>${table(exclusions.items || [], [{ label: "规则", value: "label" }, { label: "类型", value: "ruleType" }, { label: "匹配", value: "pattern" }, { label: "状态", value: (item) => item.enabled ? "启用" : "停用" }])}</section>`
      ].join("");
      bindAnalyticsControls(panel, key, load);
    };
    await load();
  }

  async function visitors() {
    const key = "visitors";
    const panel = qs("[data-panel='visitors']");
    panel.innerHTML = `${analyticsControls(key)}<section class="section-card">${label.loading}</section>`;
    const load = async () => {
      const params = analyticsParams(key);
      state.analyticsFilters[key] = Object.fromEntries(params.entries());
      const data = await api(`/api/admin/analytics?${params.toString()}`);
      const exportUrl = `/api/admin/analytics/export?${params.toString()}`;
      panel.innerHTML = [
        analyticsControls(key, { includeExcluded: params.get("includeExcluded") === "1" }),
        `<section class="section-card"><div class="card-heading"><div><h2>访客列表</h2><p>显示来源、国家、首次/最近访问、回访次数和最后访问页面。每页 ${data.visitors?.pageSize || 20} 条。</p></div><a class="button secondary" href="${exportUrl}">导出 CSV</a></div>${visitorTable(data, true)}${pager(data.visitors || {}, key)}</section>`,
        '<section class="section-card visitor-journey" data-journey hidden></section>'
      ].join("");
      bindAnalyticsControls(panel, key, load);
      bindPager(panel, key, load);
      qsa("[data-visitor-id]", panel).forEach((button) => button.addEventListener("click", async () => {
        const journey = qs("[data-journey]", panel);
        journey.hidden = false;
        journey.innerHTML = "<h2>访问路径</h2><p>正在读取访客的已过滤页面记录…</p>";
        try {
          const detail = await api(`/api/admin/analytics/visitors/${encodeURIComponent(button.dataset.visitorId)}`);
          journey.innerHTML = `<div class="card-heading"><div><h2>访问路径：${esc(shortVisitorId(detail.visitor?.visitorId))}</h2><p>${esc(detail.visitor?.country || "Unknown")} · ${esc(detail.visitor?.channel || "Direct")} · ${formatNumber(detail.visitor?.pv)} 次页面访问</p></div><button class="text-button" data-close-journey>收起</button></div>
            <div class="visitor-classification"><label>客户分类<select data-lead-status><option value="Anonymous">匿名访客</option><option value="Potential lead">潜在线索</option><option value="Lead">线索</option><option value="Customer">客户</option><option value="Excluded">排除</option></select></label><button class="button secondary" data-save-visitor>保存分类</button></div>
            ${table(detail.items || [], [{ label: "时间", value: (item) => formatTime(item.time) }, { label: "行为", value: "eventType" }, { label: "页面", value: "page" }, { label: "来源", value: (item) => item.source || item.channel }, { label: "UTM", value: (item) => [item.utmSource, item.utmMedium, item.utmCampaign].filter(Boolean).join(" / ") || "-" }])}`;
          const statusField = qs("[data-lead-status]", journey);
          if (statusField) statusField.value = detail.visitor?.leadStatus || "Anonymous";
          qs("[data-save-visitor]", journey)?.addEventListener("click", async () => {
            await api(`/api/admin/analytics/visitors/${encodeURIComponent(button.dataset.visitorId)}`, { method: "POST", body: JSON.stringify({ leadStatus: statusField?.value || "Anonymous" }) });
            setStatus("访客分类已保存");
            await load();
          });
          qs("[data-close-journey]", journey)?.addEventListener("click", () => { journey.hidden = true; });
          journey.scrollIntoView({ behavior: "smooth", block: "nearest" });
        } catch (error) {
          journey.innerHTML = `<h2>访问路径</h2><p class="error-copy">${esc(error.message)}</p>`;
        }
      }));
    };
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
    qs("[data-panel='sync']").innerHTML = card("\u6570\u636e\u6e90", `<div class="actions"><button class="button primary" data-sync-gsc>\u540c\u6b65 Google SEO</button></div>${table(data.sources || [], [{ label: "\u6570\u636e\u6e90", value: "name" }, { label: "\u914d\u7f6e", value: (row) => row.configured ? "\u5df2\u914d\u7f6e" : "\u672a\u914d\u7f6e" }, { label: "\u72b6\u6001", value: "status" }, { label: "\u6700\u8fd1\u540c\u6b65", value: "lastSync" }])}`) + card("\u6700\u8fd1\u4efb\u52a1", table(data.jobs || [], [{ label: "\u65f6\u95f4", value: "time" }, { label: "\u7c7b\u578b", value: "type" }, { label: "\u72b6\u6001", value: "status" }, { label: "\u8bf4\u660e", value: "message" }]));
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

  const loaders = { dashboard, categories, products, news, forms, analytics, visitors, seo, media, users, sync, logs, settings };

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
