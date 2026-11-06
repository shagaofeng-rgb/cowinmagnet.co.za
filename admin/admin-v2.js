(function () {
  const state = {
    csrf: "",
    user: null,
    view: "dashboard",
    page: {},
    pageSize: 20,
    listFilters: {},
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
    users: ["账号与权限", "账号与权限"], sync: ["数据同步", "数据同步"],
    logs: ["操作日志", "操作日志"], settings: ["站点设置", "站点设置"]
  };

  const qs = (selector, root = document) => root.querySelector(selector);
  const qsa = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
  const southAfricaTime = new Intl.DateTimeFormat("zh-CN", { dateStyle: "short", timeStyle: "short", hourCycle: "h23", timeZone: "Africa/Johannesburg" });
  const pendingRequests = new WeakMap();
  const motion = () => matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth";
  let statusTimer;
  const can = (permission) => state.permissions?.some((value) => value === "*" || value === permission || value === permission.split(":")[0] + ":*");
  const allowedView = (view) => can(`${view === "visitors" ? "analytics" : view}:view`);

  function setStatus(message, type = "success") {
    const node = qs("[data-status]");
    if (!node) return;
    node.textContent = message;
    node.className = `notice ${type}`;
    clearTimeout(statusTimer);
    if (message && type !== "error") statusTimer = setTimeout(() => { node.textContent = ""; node.className = "notice"; }, 4500);
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

  // Refresh just the result region. The visible report is preserved until the
  // newest request succeeds; older responses may not replace it.
  async function panelRequest(target, url, render, retry) {
    pendingRequests.get(target)?.abort();
    const request = new AbortController();
    pendingRequests.set(target, request);
    target.setAttribute("aria-busy", "true");
    target.previousElementSibling?.matches("[data-panel-feedback]") && target.previousElementSibling.remove();
    const feedback = document.createElement("div");
    feedback.dataset.panelFeedback = "";
    feedback.className = "panel-feedback";
    feedback.setAttribute("role", "status");
    feedback.textContent = "正在更新…";
    target.before(feedback);
    try {
      const data = await api(url, { signal: request.signal });
      if (pendingRequests.get(target) !== request || !target.isConnected) return;
      await render(data);
      feedback.remove();
    } catch (error) {
      if (request.signal.aborted || !target.isConnected) return;
      if (!target.dataset.hasResults) target.textContent = "";
      feedback.classList.add("error-copy");
      feedback.textContent = error.message + (target.dataset.hasResults ? "（下方仍显示上次查询结果）" : "");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "text-button";
      button.textContent = "重试";
      button.addEventListener("click", retry);
      feedback.append(button);
      return;
    } finally {
      if (pendingRequests.get(target) === request) {
        target.removeAttribute("aria-busy");
        pendingRequests.delete(target);
      }
    }
    target.dataset.hasResults = "true";
  }

  function tryLoad(load) {
    return Promise.resolve().then(load).catch((error) => setStatus(error.message, "error"));
  }

  function closeAdminMenu() {
    qs("[data-admin-menu]").setAttribute("aria-expanded", "false");
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
    if (!titles[view] || !allowedView(view)) view = Object.keys(titles).find(allowedView);
    if (!view) { setStatus("当前账号没有可访问的栏目。", "error"); return; }
    state.view = view;
    closeAdminMenu();
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
    setStatus("");
    tryLoad(loader);
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
      <span class="range-dates" data-range-dates hidden><input type="date" data-from aria-label="开始日期"><input type="date" data-to aria-label="结束日期"></span>
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
    [["q", "[data-q]"], ["status", "[data-status]"]].forEach(([name, selector]) => {
      const value = bar?.querySelector(selector)?.value?.trim();
      if (value) params.set(name, value);
    });
    if (bar?.querySelector("[data-range]")?.value === "custom") {
      [["from", "[data-from]"], ["to", "[data-to]"]].forEach(([name, selector]) => {
        const value = bar.querySelector(selector)?.value?.trim();
        if (value) params.set(name, value);
      });
    }
    qsa("[data-query]", bar).forEach((node) => {
      const value = node.value?.trim();
      if (value && node.dataset.query) params.set(node.dataset.query, value);
    });
    state.listFilters[key] = Object.fromEntries(params);
    return params.toString();
  }

  function syncRangeDateVisibility(root) {
    if (!root) return;
    const isCustom = root.querySelector("[data-range]")?.value === "custom";
    qsa("[data-range-dates]", root).forEach((node) => { node.hidden = !isCustom; });
  }

  function bindToolbar(panel, key, load) {
    const root = qs(`[data-toolbar="${key}"]`, panel);
    const saved = state.listFilters[key] || {};
    [["q", "[data-q]"], ["status", "[data-status]"], ["range", "[data-range]"], ["from", "[data-from]"], ["to", "[data-to]"], ["pageSize", "[data-page-size]"]].forEach(([name, selector]) => {
      const control = qs(selector, root);
      if (control && saved[name] != null) control.value = saved[name];
    });
    qsa("[data-query]", root).forEach((control) => { if (saved[control.dataset.query]) control.value = saved[control.dataset.query]; });
    syncRangeDateVisibility(root);
    qs("[data-range]", root)?.addEventListener("change", () => syncRangeDateVisibility(root));
    qs("[data-search]", panel)?.addEventListener("click", () => { state.page[key] = 1; tryLoad(load); });
    qs("[data-page-size]", panel)?.addEventListener("change", (event) => { state.pageSize = Number(event.target.value) || 20; state.page[key] = 1; tryLoad(load); });
    root?.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" || !event.target.matches("input")) return;
      event.preventDefault(); state.page[key] = 1; tryLoad(load);
    });
    qs("[data-reset]", panel)?.addEventListener("click", () => {
      qsa("input,select", qs(`[data-toolbar="${key}"]`, panel)).forEach((node) => { node.value = ""; });
      const toolbarNode = qs(`[data-toolbar="${key}"]`, panel);
      if (toolbarNode) {
        qs("[data-range]", toolbarNode).value = "all";
        qs("[data-page-size]", toolbarNode).value = "20";
      }
      state.pageSize = 20;
      syncRangeDateVisibility(toolbarNode);
      state.page[key] = 1;
      tryLoad(load);
    });
  }

  function bindPager(panel, key, load) {
    qsa("[data-page]", panel).forEach((button) => button.addEventListener("click", () => {
      state.page[key] = Number(button.dataset.page);
      tryLoad(load);
    }));
    qs("[data-page-jump-go]", panel)?.addEventListener("click", () => {
      const input = qs("[data-page-jump]", panel);
      const pages = Number(input?.max || 1);
      state.page[key] = Math.max(1, Math.min(pages, Number(input?.value || 1)));
      tryLoad(load);
    });
  }

  function bindPagerWithin(root, key, load) {
    qsa("[data-page]", root).forEach((button) => button.addEventListener("click", () => {
      state.page[key] = Number(button.dataset.page);
      tryLoad(load);
    }));
    qs("[data-page-jump-go]", root)?.addEventListener("click", () => {
      const input = qs("[data-page-jump]", root);
      const pages = Number(input?.max || 1);
      state.page[key] = Math.max(1, Math.min(pages, Number(input?.value || 1)));
      tryLoad(load);
    });
  }

  function pager(data, key) {
    const page = data.page || 1;
    const pages = data.pages || data.totalPages || 1;
    return `<div class="pager"><button class="button secondary" data-page="${Math.max(1, page - 1)}" ${page <= 1 ? "disabled" : ""}>上一页</button><span>第 ${page} / ${pages} 页 · 共 ${data.total || 0} 条</span><label class="page-jump">跳至 <input type="number" data-page-jump min="1" max="${pages}" value="${page}" aria-label="跳转页码"> 页</label><button class="button secondary" data-page-jump-go>跳转</button><button class="button secondary" data-page="${Math.min(pages, page + 1)}" ${page >= pages ? "disabled" : ""}>下一页</button></div>`;
  }

  function table(rows, fields, empty = "\u6682\u65e0\u6570\u636e") {
    if (!rows?.length) return `<p class="empty-copy">${esc(empty)}</p>`;
    return `<div class="table-wrap" tabindex="0" role="region" aria-label="数据表格"><table><thead><tr>${fields.map((field) => `<th scope="col">${esc(field.label)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${fields.map((field) => `<td>${field.html ? field.html(row) : esc(typeof field.value === "function" ? field.value(row) : row[field.value])}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  }

  function renderLocalPage(target, key, rows, fields, empty, pageSize = 20) {
    const pages = Math.max(1, Math.ceil(rows.length / pageSize));
    const page = state.page[key] = Math.min(pages, state.page[key] || 1);
    target.innerHTML = table(rows.slice((page - 1) * pageSize, page * pageSize), fields, empty)
      + (pages > 1 ? pager({ page, pages, total: rows.length }, key) : "");
    bindPagerWithin(target, key, () => renderLocalPage(target, key, rows, fields, empty, pageSize));
  }

  function formatNumber(value) {
    return new Intl.NumberFormat("zh-CN").format(Number(value || 0));
  }

  function formatTime(value) {
    if (!value) return "-";
    const date = new Date(value);
    return Number.isNaN(date.valueOf()) ? "-" : southAfricaTime.format(date);
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
      <span class="range-dates" data-range-dates ${String(current.range || options.defaultRange || "today") === "custom" ? "" : "hidden"}><label>开始日期<input type="date" data-from value="${esc(current.from || "")}"></label><label>结束日期<input type="date" data-to value="${esc(current.to || "")}"></label></span>
      <div class="analytics-toolbar-actions"><button class="button primary" data-analytics-apply>应用筛选</button><button class="button secondary" data-analytics-reset>重置</button></div>
      <details class="analytics-extra" ${(current.country || current.channel || current.device || current.q) ? "open" : ""}><summary>更多筛选</summary><div>
      <label>国家<input data-country placeholder="例如 ZA" value="${esc(current.country || "")}"></label>
      <label>渠道<select data-channel><option value="" ${sourceSelected("")}>全部渠道</option><option value="Direct" ${sourceSelected("Direct")}>Direct</option><option value="Organic Search" ${sourceSelected("Organic Search")}>Organic Search</option><option value="Referral" ${sourceSelected("Referral")}>Referral</option><option value="Social" ${sourceSelected("Social")}>Social</option><option value="Paid" ${sourceSelected("Paid")}>Paid</option><option value="Email" ${sourceSelected("Email")}>Email</option><option value="WhatsApp" ${sourceSelected("WhatsApp")}>WhatsApp</option><option value="Other" ${sourceSelected("Other")}>Other</option></select></label>
      <label>设备<select data-device><option value="" ${deviceSelected("")}>全部设备</option><option value="Desktop" ${deviceSelected("Desktop")}>Desktop</option><option value="Mobile" ${deviceSelected("Mobile")}>Mobile</option><option value="Tablet" ${deviceSelected("Tablet")}>Tablet</option></select></label>
      <label>搜索<input data-visitor-q placeholder="访问路径 / 来源" value="${esc(current.q || "")}"></label>
      <label>每页<select data-page-size><option value="20" ${(current.pageSize || state.pageSize) === "20" || Number(current.pageSize || state.pageSize) === 20 ? "selected" : ""}>20 条</option><option value="50" ${Number(current.pageSize || state.pageSize) === 50 ? "selected" : ""}>50 条</option><option value="100" ${Number(current.pageSize || state.pageSize) === 100 ? "selected" : ""}>100 条</option></select></label>
      </div></details><p class="data-note filter-zone">南非时间 (SAST)</p>
    </div>`;
  }

  function analyticsParams(key) {
    const root = qs(`[data-analytics-toolbar="${key}"]`);
    const params = new URLSearchParams();
    params.set("range", root?.querySelector("[data-range]")?.value || "all");
    params.set("page", state.page[key] || 1);
    params.set("pageSize", root?.querySelector("[data-page-size]")?.value || state.pageSize || 20);
    [["country", "[data-country]"], ["channel", "[data-channel]"], ["device", "[data-device]"], ["q", "[data-visitor-q]"]].forEach(([name, selector]) => {
      const value = root?.querySelector(selector)?.value?.trim();
      if (value) params.set(name, value);
    });
    if (root?.querySelector("[data-range]")?.value === "custom") {
      [["from", "[data-from]"], ["to", "[data-to]"]].forEach(([name, selector]) => {
        const value = root.querySelector(selector)?.value?.trim();
        if (value) params.set(name, value);
      });
    }
    return params;
  }

  function bindAnalyticsControls(panel, key, load) {
    const root = qs(`[data-analytics-toolbar="${key}"]`, panel);
    syncRangeDateVisibility(root);
    qs("[data-range]", root)?.addEventListener("change", () => syncRangeDateVisibility(root));
    const apply = () => { state.page[key] = 1; tryLoad(load); };
    qs("[data-analytics-apply]", panel)?.addEventListener("click", apply);
    root?.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" || !event.target.matches("input")) return;
      event.preventDefault(); apply();
    });
    qs("[data-analytics-reset]", panel)?.addEventListener("click", () => {
      const root = qs(`[data-analytics-toolbar="${key}"]`, panel);
      qsa("input,select", root).forEach((node) => { if (node.type === "checkbox") node.checked = false; else node.value = ""; });
      qs("[data-range]", root).value = "today";
      qs("[data-page-size]", root).value = "20";
      state.analyticsFilters[key] = { range: "today", pageSize: 20 };
      state.page[key] = 1;
      syncRangeDateVisibility(root);
      tryLoad(load);
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
    return `<div class="table-wrap visitor-table" tabindex="0" role="region" aria-label="访客列表"><table><thead><tr><th>最后访问</th><th>访客</th><th>地区 / IP</th><th>来源</th><th>设备</th><th>回访</th><th>最后页面</th><th>客户状态</th>${allowJourney ? "<th>路径</th>" : ""}</tr></thead><tbody>${items.map((item) => `<tr>
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
      await panelRequest(results, `/api/admin/analytics?${params.toString()}`, (report) => {
      results.innerHTML = [
      metrics([
        { label: "PV", value: formatNumber(report.pv), note: report.lastSync ? "最近记录 " + formatTime(report.lastSync) : "当前范围暂无记录" },
        { label: "UV", value: formatNumber(report.uv), note: "独立访客" },
        { label: "有效会话", value: formatNumber(report.sessions), note: "按访客会话归并" },
        { label: "询盘提交", value: formatNumber(report.enquiries), note: `询盘会话占比 ${report.conversionRate || 0}%` },
        { label: "WhatsApp 点击", value: formatNumber(report.whatsappClicks), note: "高意向动作" }
      ]),
      `<div class="dashboard-grid"><section class="section-card span-2"><div class="card-heading"><h2>访问趋势</h2><a class="text-link" href="?view=analytics">查看分析</a></div>${lineChart(report.timeline || [])}</section>
      <section class="section-card"><h2>来源渠道</h2>${miniBars(report.channels || [])}</section></div>`,
      `<div class="dashboard-grid"><section class="section-card span-2"><div class="card-heading"><h2>最近访客</h2><a class="text-link" href="?view=visitors">查看足迹</a></div>${visitorTable({ ...report, visitors: { ...(report.visitors || {}), items: (report.visitors?.items || []).slice(0, 8) } }, false)}</section>
      <section class="section-card"><h2>来源平台</h2>${miniBars((report.sources || []).map((item) => ({ name: item.source, count: item.pv })))}</section></div>`
      ].join("");
      }, load);
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
      const target = qs("[data-list]", panel);
      await panelRequest(target, `/api/admin/categories?${queryString}`, (data) => {
      const exportLink = qs("a[href^='/api/admin/categories/export']", panel);
      if (exportLink) exportLink.href = `/api/admin/categories/export?${queryString}`;
      target.innerHTML = table(data.items || [], [{ label: "\u540d\u79f0", value: (row) => row.name || row.title }, { label: "Slug", value: "slug" }, { label: "\u72b6\u6001", value: "status" }, { label: "\u6392\u5e8f", value: "sortOrder" }, { label: "\u66f4\u65b0", value: "updatedAt" }]) + pager(data, key);
      bindPagerWithin(target, key, load);
      }, load);
    };
    bindToolbar(panel, key, load);
    await load();
  }

  async function products() {
    const key = "products";
    const panel = qs("[data-panel='products']");
    panel.innerHTML = card("产品列表", `${toolbar(key)}<div class="actions"><a class="button secondary" href="/api/admin/products/export">${label.exportCsv}</a></div><div data-list>${label.loading}</div><div data-product-editor hidden></div>`);
    const load = async () => {
      const queryString = query(key);
      const results = qs("[data-list]", panel);
      await panelRequest(results, `/api/admin/products?${queryString}`, (data) => {
        qs("a[href^='/api/admin/products/export']", panel).href = `/api/admin/products/export?${queryString}`;
        results.innerHTML = table(data.items || [], [
          { label: "产品", value: (row) => row.name || row.title },
          { label: "分类", value: (row) => row.category || row.categoryName || row.categorySlug },
          { label: "前台文案", value: (row) => ({ draft: "草稿待发布", published: "已发布", release: "采用网站版本" })[row.publication] },
          { label: "最近发布", value: (row) => formatTime(row.publishedAt) },
          { label: "操作", html: (row) => `<button class="text-button" data-edit-product="${esc(row.slug)}">查看与编辑</button>` }
        ]) + pager(data, key);
        bindPagerWithin(results, key, load);
        qsa("[data-edit-product]", results).forEach((button) => button.addEventListener("click", () => tryLoad(() => productEditor(panel, button.dataset.editProduct, load))));
      }, load);
    };
    bindToolbar(panel, key, load);
    await load();
  }

  async function productEditor(panel, slug, refreshList) {
    const target = qs("[data-product-editor]", panel);
    const endpoint = `/api/admin/products/${encodeURIComponent(slug)}`;
    target.hidden = false;
    const render = (data) => {
      const fields = data.draft?.fields || data.live?.fields || {};
      const url = new URL(data.url, location.origin);
      const website = url.hostname === "cowinmagnet.co.za" || url.origin === location.origin ? url.pathname : "/en-za/products/";
      target.innerHTML = card(data.name || slug, `<p class="data-note">此处管理详情简介和搜索摘要。保存为草稿后可单独发布；留空的字段使用网站原有内容。发布后可能需要等待最多 5 分钟的缓存刷新。</p>
        <p class="data-note">${data.draft ? `草稿更新：${formatTime(data.draft.updatedAt)} · ` : ""}${data.live ? `最近发布：${formatTime(data.live.publishedAt)}` : "当前显示网站版本"}</p>
        <form class="product-editorial-form" data-product-fields>
          <label>详情简介<textarea name="shortDescription" maxlength="460" rows="3">${esc(fields.shortDescription)}</textarea></label>
          <label>搜索标题<input name="seoTitle" maxlength="75" value="${esc(fields.seoTitle)}"></label>
          <label>搜索摘要<textarea name="seoDescription" maxlength="170" rows="2">${esc(fields.seoDescription)}</textarea></label>
          <div class="actions">${can("products:edit") ? '<button class="button primary" type="submit">保存草稿</button>' : ""}
          ${data.draft && can("products:publish") ? '<button class="button secondary" type="button" data-publish-product>发布已保存草稿</button>' : ""}
          <a class="button secondary" href="${esc(website)}" target="_blank" rel="noopener">查看前台详情</a>
          <button class="text-button" type="button" data-close-product>收起</button></div>
        </form>`);
      const form = qs("[data-product-fields]", target);
      if (!can("products:edit")) qsa("textarea,input", form).forEach((field) => { field.readOnly = true; });
      const act = async (action) => {
        const buttons = qsa("button", form);
        buttons.forEach((button) => { button.disabled = true; });
        await tryLoad(async () => {
          const next = await api(endpoint + (action === "publish" ? "/publish" : ""), {
            method: action === "publish" ? "POST" : "PUT",
            body: JSON.stringify({ revision: data.revision || "", ...(action === "save" ? { fields: Object.fromEntries(new FormData(form)) } : {}) })
          });
          setStatus(action === "publish" ? "已发布" : "草稿已保存");
          render({ ...data, ...next, draft: next.draft });
          await refreshList();
        });
        buttons.forEach((button) => { button.disabled = false; });
      };
      form.addEventListener("submit", (event) => { event.preventDefault(); act("save"); });
      qs("[data-publish-product]", form)?.addEventListener("click", () => act("publish"));
      qs("[data-close-product]", form).addEventListener("click", () => { target.hidden = true; });
    };
    const load = () => panelRequest(target, endpoint, render, load);
    await load();
    target.scrollIntoView({ behavior: motion(), block: "nearest" });
  }

  async function news() {
    const key = "news";
    const panel = qs("[data-panel='news']");
    panel.innerHTML = card("\u65b0\u95fb\u5185\u5bb9", `${toolbar(key, `<select data-status><option value="">\u5168\u90e8</option><option value="published">Published</option><option value="draft">Draft</option></select>`)}<div class="actions"><a class="button secondary" href="/api/admin/news/export">${label.exportCsv}</a></div><div data-list>${label.loading}</div>`);
    const load = async () => {
      const queryString = query(key);
      const target = qs("[data-list]", panel);
      await panelRequest(target, `/api/admin/news?${queryString}`, (data) => {
      const exportLink = qs("a[href^='/api/admin/news/export']", panel);
      if (exportLink) exportLink.href = `/api/admin/news/export?${queryString}`;
      target.innerHTML = table(data.items || [], [{ label: "\u6807\u9898", value: "title" }, { label: "\u5206\u7c7b", value: "category" }, { label: "\u72b6\u6001", value: "status" }, { label: "\u65e5\u671f", value: (row) => row.date || row.publishedAt }, { label: "Slug", value: "slug" }]) + pager(data, key);
      bindPagerWithin(target, key, load);
      }, load);
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
      const results = qs("[data-list]", panel);
      await panelRequest(results, `/api/admin/enquiries?${queryString}`, (data) => {
      const exportLink = qs("[data-export-enquiries]", panel);
      if (exportLink) {
        exportLink.href = `/api/admin/enquiries/export?${queryString}`;
        exportLink.hidden = !can("forms:export");
      }
      results.innerHTML = table(data.items || [], [
        { label: "提交时间", value: (row) => formatTime(row.submissionTime || row.createdAt) },
        { label: "客户", value: (row) => [row.name, row.company].filter(Boolean).join(" / ") || "-" },
        { label: "邮箱", value: "email" }, { label: "产品", value: "product" },
        { label: "客户记录", value: (row) => `${formatNumber(row.customerInquiryCount || 1)} 条` },
        { label: "跟进状态", value: (row) => enquiryState[row.status] || row.status },
        { label: "通知", value: (row) => notificationLabel(row.notification) },
        { label: "操作", html: (row) => `<button class="text-button" data-enquiry-id="${esc(row.id)}">查看详情</button>` }
      ]) + pager(data, key);
      bindPagerWithin(results, key, load);
      qsa("[data-enquiry-id]", results).forEach((button) => button.addEventListener("click", () => openEnquiryDetail(panel, button.dataset.enquiryId, load)));
      }, load);
    };
    bindToolbar(panel, key, load);
    await load();
    const linkedId = new URLSearchParams(location.search).get("enquiry");
    if (linkedId && state.view === "forms") await openEnquiryDetail(panel, linkedId, load);
  }

  const enquiryState = { New: "新询盘", "In Progress": "跟进中", Closed: "已关闭" };
  function notificationLabel(notice) {
    return ({
      queued: "待发送", processing: "发送处理中", accepted: "邮件服务商已接收", sent: "邮件服务商已接收",
      delivered: "已送达", delivery_delayed: "送达延迟", bounced: "退信", complained: "收到投诉",
      cancelled: "已取消", retry_wait: "等待重试", failed: "发送失败", not_configured: "邮件服务待配置",
      needs_review: "需核对投递结果"
    })[notice?.status] || "无历史回执";
  }

  function detailGrid(items) {
    return `<div class="detail-grid">${items.map(([label, value]) => `<div><span>${esc(label)}</span><strong>${esc(value || "-")}</strong></div>`).join("")}</div>`;
  }

  function detailSection(title, items, open = false) {
    if (!items.length) return "";
    return `<details class="detail-section" ${open ? "open" : ""}><summary>${esc(title)} <span>${items.length} 项</span></summary>${detailGrid(items)}</details>`;
  }

  async function openEnquiryDetail(panel, enquiryId, refreshList, focus = true) {
    const detail = qs("[data-enquiry-detail]", panel);
    if (!detail) return;
    const opened = Symbol();
    detail.openedEnquiry = opened;
    const endpoint = `/api/admin/enquiries/${encodeURIComponent(enquiryId)}`;
    detail.hidden = false;
    detail.innerHTML = `<div class="card-heading"><div><h2>询盘详情</h2><p>正在读取客户资料与关联访问记录…</p></div><button class="text-button" data-close-enquiry>收起</button></div>`;
    try {
      const data = await api(endpoint);
      if (detail.openedEnquiry !== opened || !detail.isConnected) return;
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
      const attachment = enquiry.attachment;
      const notification = enquiry.notification;
      detail.innerHTML = `<div class="card-heading"><div><h2>${esc(enquiry.name || "客户询盘")}</h2><p>${esc(enquiry.id || "")} · ${formatTime(enquiry.submissionTime)}</p></div><button class="text-button" data-close-enquiry>收起</button></div>
        <h3>客户与询盘</h3>${detailGrid([["公司", enquiry.company], ["邮箱", enquiry.email], ["电话 / WhatsApp", enquiry.phone || enquiry.whatsapp], ["国家 / 地区", enquiry.country || enquiry.region], ["意向产品", enquiry.product], ["行业", enquiry.industry], ["处理状态", enquiryState[enquiry.status] || enquiry.status], ["提交页面", enquiry.sourcePage]])}
        <h3>询盘附件</h3>${attachment?.id && can("forms:download") ? `<a class="button secondary" download href="${endpoint}/attachments/${encodeURIComponent(attachment.id)}">下载 ${esc(attachment.name)}</a> <small>${formatNumber(Math.ceil(attachment.size / 1024))} KB</small>` : `<p class="data-note">${attachment?.id ? "当前账号没有附件下载权限。" : "无可下载附件。"}</p>`}
        <h3>通知与回执</h3>${detailGrid([["投递状态", notificationLabel(notification)], ["收件人", notification?.recipient], ["服务商接收时间", formatTime(notification?.acceptedAt)], ["上次核对时间", formatTime(notification?.receiptCheckedAt)]])}
        ${notification?.receiptError ? '<p class="data-note">未能取得最新回执，当前保留上次确认的状态。</p>' : ""}
        ${can("forms:edit") && notification?.providerId && !["delivered", "bounced", "complained", "failed", "cancelled"].includes(notification.status) ? '<button class="button secondary" data-enquiry-receipt>核对邮件回执</button>' : ""}
        ${can("forms:edit") && notification && !notification.providerId && ["queued", "retry_wait", "failed"].includes(notification.status) ? '<button class="button secondary" data-enquiry-receipt>重试邮件通知</button>' : ""}
        <h3>来源归因</h3>${visitor ? detailGrid([["首次来源", `${visitor.firstChannel || "Direct"} / ${visitor.firstSource || "Direct"}`], ["最近来源", `${visitor.lastChannel || visitor.channel || "Direct"} / ${visitor.lastSource || visitor.source || "Direct"}`], ["首次访问", formatTime(visitor.firstSeenAt)], ["最近访问", formatTime(visitor.lastSeenAt)], ["访客编号", shortVisitorId(visitor.visitorId)]]) : `<p class="empty-copy">${data.visitor?.unavailable ? "访问记录暂时无法读取，可稍后重试。" : "这条询盘没有可关联的访问记录。"}</p>`}
        ${visitor ? `<div class="actions"><button class="button secondary" data-open-enquiry-visitor="${esc(visitor.visitorId)}">查看完整浏览路径</button></div>` : ""}
        <h3>同一客户历史</h3><div data-enquiry-history></div>
        <h3>客户填写内容</h3>${payload.length ? `${detailSection("技术与产品要求", technicalPayload.map(([key, value]) => [key, typeof value === "boolean" ? (value ? "Yes" : "No") : String(value)]), true)}${detailSection("项目环境与安装信息", projectPayload.map(([key, value]) => [key, typeof value === "boolean" ? (value ? "Yes" : "No") : String(value)]))}${detailSection("其他填写内容", otherPayload.map(([key, value]) => [key, typeof value === "boolean" ? (value ? "Yes" : "No") : String(value)]))}` : '<p class="empty-copy">没有额外填写字段。</p>'}
        <h3>跟进记录</h3>
        ${can("forms:edit") ? `<form class="enquiry-followup" data-enquiry-followup><label>状态<select name="status">${Object.entries(enquiryState).map(([value, label]) => `<option value="${esc(value)}" ${enquiry.status === value ? "selected" : ""}>${esc(label)}</option>`).join("")}</select></label><label>新增备注<textarea name="note" maxlength="2000" rows="2"></textarea></label><button class="button primary">保存跟进</button></form>` : ""}
        <div data-enquiry-notes></div>`;
      renderLocalPage(qs("[data-enquiry-notes]", detail), `notes-${enquiryId}`, [...notes].reverse(), [{ label: "时间", value: (item) => formatTime(item.time) }, { label: "操作人", value: "user" }, { label: "记录", value: "note" }], "暂无跟进记录。", 10);
      renderLocalPage(qs("[data-enquiry-history]", detail), `history-${enquiryId}`, data.customer?.enquiries || [], [{ label: "提交时间", value: (item) => formatTime(item.submissionTime) }, { label: "产品", value: "product" }, { label: "状态", value: (row) => enquiryState[row.status] || row.status }, { label: "提交页面", value: "sourcePage" }], "该客户暂无其他询盘记录。", 10);
      qs("[data-close-enquiry]", detail)?.addEventListener("click", () => { detail.hidden = true; });
      qs("[data-enquiry-followup]", detail)?.addEventListener("submit", async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const button = qs("button", form);
        button.disabled = true;
        await tryLoad(async () => {
          await api(endpoint, { method: "PUT", body: JSON.stringify(Object.fromEntries(new FormData(form))) });
          setStatus("跟进记录已保存");
          await refreshList?.();
          if (detail.openedEnquiry === opened && !detail.hidden) await openEnquiryDetail(panel, enquiryId, refreshList, false);
        });
        button.disabled = false;
      });
      qs("[data-enquiry-receipt]", detail)?.addEventListener("click", async (event) => {
        const button = event.currentTarget;
        button.disabled = true;
        await tryLoad(async () => {
          const latest = await api(`${endpoint}/notification`, { method: "POST" });
          setStatus(notificationLabel(latest));
          await refreshList?.();
          if (detail.openedEnquiry === opened && !detail.hidden) await openEnquiryDetail(panel, enquiryId, refreshList, false);
        });
        button.disabled = false;
      });
      qs("[data-open-enquiry-visitor]", detail)?.addEventListener("click", (event) => {
        state.openVisitorId = event.currentTarget.dataset.openEnquiryVisitor || "";
        activate("visitors");
      });
      if (focus) {
        detail.scrollIntoView({ behavior: motion(), block: "start" });
        qs("[data-close-enquiry]", detail)?.focus({ preventScroll: true });
      }
    } catch (error) {
      if (detail.openedEnquiry !== opened) return;
      detail.innerHTML = `<h2>询盘详情</h2><p class="error-copy">${esc(error.message)}</p><button class="button secondary" data-enquiry-retry>重试</button>`;
      qs("[data-enquiry-retry]", detail).addEventListener("click", () => openEnquiryDetail(panel, enquiryId, refreshList));
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
      await panelRequest(results, `/api/admin/analytics?${params.toString()}`, (data) => {
      results.innerHTML = [
        metrics([
          { label: "PV", value: formatNumber(data.pv), note: "当前日期与筛选条件" },
          { label: "UV", value: formatNumber(data.uv), note: "独立访客" },
          { label: "会话", value: formatNumber(data.sessions), note: "访问会话" },
          { label: "询盘", value: formatNumber(data.enquiries), note: `询盘会话占比 ${data.conversionRate || 0}%` },
          { label: "WhatsApp", value: formatNumber(data.whatsappClicks), note: "点击事件" }
        ]),
        `<div class="dashboard-grid"><section class="section-card span-2"><h2>访问趋势</h2>${lineChart(data.timeline || [])}</section><section class="section-card"><h2>国家 / 地区</h2>${miniBars(data.countries || [])}</section></div>`,
        `<div class="dashboard-grid"><section class="section-card"><h2>来源渠道</h2>${miniBars(data.channels || [])}</section><section class="section-card"><h2>来源平台</h2>${miniBars((data.sources || []).map((item) => ({ name: item.source, count: item.pv })))}</section><section class="section-card"><h2>热门页面</h2>${miniBars(data.pages || [])}</section></div>`,
        `<section class="section-card"><h2>设备与浏览器</h2>${table(data.deviceBrowsers || [], [{ label: "设备", value: "device" }, { label: "浏览器", value: "browser" }, { label: "访问", value: "views" }])}</section>`
      ].join("");
      }, load);
    };
    bindAnalyticsControls(panel, key, load);
    await load();
  }

  async function openVisitorJourney(panel, visitorId, refreshList) {
    const journey = qs("[data-journey]", panel);
    if (!journey || !visitorId) return;
    const requested = Symbol();
    journey.requested = requested;
    const url = `/api/admin/analytics/visitors/${encodeURIComponent(visitorId)}`;
    journey.hidden = false;
    journey.innerHTML = "<h2>访问路径</h2><p>正在读取访客的浏览记录…</p>";
    try {
      const detail = await api(`${url}?eventPageSize=20`);
      if (journey.requested !== requested) return;
      const sessions = detail.sessions || [];
      const linkedEnquiries = detail.enquiries || [];
      journey.innerHTML = `<div class="card-heading"><div><h2>访客详情：${esc(shortVisitorId(detail.visitor?.visitorId))}</h2><p>${esc(detail.visitor?.country || "Unknown")} · ${esc(detail.visitor?.firstChannel || detail.visitor?.channel || "Direct")} / ${esc(detail.visitor?.firstSource || detail.visitor?.source || "Direct")} · ${formatNumber(detail.visitor?.pv)} 次页面访问 · ${formatNumber(detail.visitor?.sessionCount || sessions.length)} 个会话</p></div><button class="text-button" data-close-journey>收起</button></div>
        <div class="journey-summary"><div><span>首次访问</span><strong>${formatTime(detail.visitor?.firstSeenAt)}</strong></div><div><span>最近访问</span><strong>${formatTime(detail.visitor?.lastSeenAt)}</strong></div><div><span>设备</span><strong>${esc(detail.visitor?.device || "-")} / ${esc(detail.visitor?.browser || "-")}</strong></div><div><span>脱敏 IP</span><strong>${esc(detail.visitor?.ip || "-")}</strong></div></div>
        ${can("analytics:edit") ? '<div class="visitor-classification"><label>客户分类<select data-lead-status><option value="Anonymous">匿名访客</option><option value="Potential lead">潜在线索</option><option value="Lead">线索</option><option value="Customer">客户</option></select></label><button class="button secondary" data-save-visitor>保存分类</button></div>' : ""}
        <h3>访问会话</h3><div data-journey-sessions></div>
        <h3>已关联客户表单</h3><div data-journey-forms></div>
        <h3>浏览明细</h3><p class="data-note">“预计停留”按同一会话的下一次操作估算；无后续操作或相隔超过 30 分钟时显示为 —。</p><div data-journey-events></div>`;
      renderLocalPage(qs("[data-journey-sessions]", journey), `sessions-${visitorId}`, sessions, [{ label: "开始", value: (item) => formatTime(item.startedAt) }, { label: "结束", value: (item) => formatTime(item.endedAt) }, { label: "预计时长", value: (item) => formatDuration(item.estimatedDurationSeconds) }, { label: "入口页面", value: "entryPage" }, { label: "退出页面", value: "exitPage" }, { label: "来源", value: (item) => item.source || item.channel }, { label: "页面浏览", value: "pv" }], "暂无有效会话");
      renderLocalPage(qs("[data-journey-forms]", journey), `leads-${visitorId}`, linkedEnquiries, [{ label: "提交时间", value: (item) => formatTime(item.submissionTime) }, { label: "客户", value: (item) => [item.name, item.company].filter(Boolean).join(" / ") || "-" }, { label: "产品", value: "product" }, { label: "状态", value: (row) => enquiryState[row.status] || row.status }, { label: "来源页面", value: "sourcePage" }], "该访客尚未提交表单");
      const eventKey = `events-${visitorId}`;
      state.page[eventKey] = 1;
      const target = qs("[data-journey-events]", journey);
      const renderEvents = ({ events }) => {
        target.innerHTML = table(events?.items || [], [{ label: "时间", value: (item) => formatTime(item.time) }, { label: "会话", value: (item) => shortVisitorId(item.sessionId) }, { label: "行为", value: "eventType" }, { label: "页面", value: "page" }, { label: "预计停留", value: (item) => formatDuration(item.estimatedDwellSeconds) }, { label: "来源", value: (item) => item.source || item.channel }])
          + (events?.totalPages > 1 ? pager(events, eventKey) : "");
        bindPagerWithin(target, eventKey, loadEvents);
      };
      const loadEvents = () => panelRequest(target, `${url}?eventPageSize=20&eventPage=${state.page[eventKey]}`, renderEvents, loadEvents);
      renderEvents(detail);
      const statusField = qs("[data-lead-status]", journey);
      if (statusField) statusField.value = detail.visitor?.leadStatus || "Anonymous";
      qs("[data-save-visitor]", journey)?.addEventListener("click", async () => {
        await tryLoad(async () => {
          await api(`/api/admin/analytics/visitors/${encodeURIComponent(visitorId)}`, { method: "POST", body: JSON.stringify({ leadStatus: statusField?.value || "Anonymous" }) });
          setStatus("访客分类已保存");
          await refreshList();
        });
      });
      qs("[data-close-journey]", journey)?.addEventListener("click", () => { journey.hidden = true; });
      journey.scrollIntoView({ behavior: motion(), block: "nearest" });
    } catch (error) {
      if (journey.requested !== requested) return;
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
      await panelRequest(results, `/api/admin/analytics?${params.toString()}`, (data) => {
      const exportUrl = `/api/admin/analytics/export?${params.toString()}`;
      results.innerHTML = `<section class="section-card"><div class="card-heading"><div><h2>访客列表</h2><p>每页 ${data.visitors?.pageSize || 20} 条</p></div>${can("analytics:export") ? `<a class="button secondary" href="${exportUrl}">导出本页 CSV</a>` : ""}</div>${visitorTable(data, true)}${pager(data.visitors || {}, key)}</section>`;
      bindPager(panel, key, load);
      qsa("[data-visitor-id]", results).forEach((button) => button.addEventListener("click", () => openVisitorJourney(panel, button.dataset.visitorId, load)));
      if (state.openVisitorId) {
        const visitorId = state.openVisitorId;
        state.openVisitorId = "";
        openVisitorJourney(panel, visitorId, load);
      }
      }, load);
    };
    bindAnalyticsControls(panel, key, load);
    await load();
  }

  async function seo() {
    const panel = qs("[data-panel='seo']");
    panel.innerHTML = '<div data-seo-results></div>';
    const target = qs("[data-seo-results]", panel);
    const load = async () => {
      target.setAttribute("aria-busy", "true");
      try {
        const [data, google] = await Promise.all([api("/api/admin/seo"), api("/api/admin/google-seo")]);
        const report = google.latest || {};
        const receipt = google.sitemapSubmission;
        const inspected = google.inspection;
        const searchStatus = report.syncedAt
          ? "最近同步：" + formatTime(report.syncedAt) + " · " + report.startDate + " 至 " + report.endDate
          : google.configured ? "Google 已连接，暂无搜索表现回执。" : "Google Search Console 尚未配置。";
        const sitemapStatus = receipt ? (receipt.searchConsole.submitted ? "Google 已接收站点地图" : "最近一次提交失败") + " · " + formatTime(receipt.finishedAt) : "暂无站点地图提交回执";
        const inspectionStatus = inspected?.inspectedAt ? "上次 URL 检查：" + formatTime(inspected.inspectedAt) + " · 待重试 " + (inspected.retryPending ?? inspected.byVerdict?.ERROR ?? 0) + " 条" : "暂无 URL 检查记录";
        target.innerHTML = metrics([
          { label: "站点地图 URL", value: data.sitemapTotal ?? "—", note: "站点地图记录" },
          { label: "内容记录", value: data.total, note: "产品、栏目与文章" },
          { label: "待补内容字段", value: data.issues.length, note: "标题、摘要或主图" },
          { label: "Google 点击", value: report.summary?.clicks ?? "—", note: "按同步区间统计" },
          { label: "Google 展示", value: report.summary?.impressions ?? "—", note: "按同步区间统计" }
        ]) + card("Google Search Console", '<p class="data-note">' + esc(searchStatus) + '</p><p class="data-note">' + esc(sitemapStatus) + ' · 周一计划提交</p><p class="data-note">' + esc(inspectionStatus) + '</p>' +
          (google.configured && can("seo:edit") ? '<div class="actions"><button class="button secondary" data-gsc>同步搜索表现</button></div>' : "") + '<div data-gsc-pages></div>')
          + card("内容字段检查", "<div data-seo-issues></div>");
        const gscRows = (report.topPages || []).map((row) => ({ page: row.keys?.[0] || "—", clicks: row.clicks, impressions: row.impressions, ctr: (Number(row.ctr || 0) * 100).toFixed(2) + "%", position: Number(row.position || 0).toFixed(1) }));
        renderLocalPage(qs("[data-gsc-pages]", target), "seoGsc", gscRows, [{ label: "页面", value: "page" }, { label: "点击", value: "clicks" }, { label: "展示", value: "impressions" }, { label: "点击率", value: "ctr" }, { label: "平均排名", value: "position" }], "暂无页面搜索表现数据。");
        renderLocalPage(qs("[data-seo-issues]", target), "seoIssues", data.issues, [{ label: "类型", value: "type" }, { label: "页面", value: "page" }, { label: "说明", value: "message" }], "内容记录未发现上述字段缺项。");
        qs("[data-gsc]", target)?.addEventListener("click", async (event) => {
          const button = event.currentTarget;
          button.disabled = true;
          await tryLoad(async () => {
            await api("/api/admin/google-seo/sync", { method: "POST" });
            setStatus("搜索表现已同步");
            await load();
          });
          button.disabled = false;
        });
      } catch (error) {
        target.innerHTML = '<p class="error-copy">' + esc(error.message) + '</p><button class="button secondary" data-seo-retry>重试</button>';
        qs("[data-seo-retry]", target).addEventListener("click", load);
      } finally { target.removeAttribute("aria-busy"); }
    };
    await load();
  }

  async function media() {
    const key = "media";
    const panel = qs("[data-panel='media']");
    panel.innerHTML = card("\u5a92\u4f53\u8d44\u4ea7", `${toolbar(key)}<form class="form-row" data-media-form><input name="title" placeholder="\u6807\u9898"><input name="url" placeholder="URL"><input name="alt" placeholder="Alt text"><button class="button primary">${label.save}</button></form><div class="actions"><a class="button secondary" href="/api/admin/media/export">${label.exportCsv}</a></div><div data-list>${label.loading}</div>`);
    const load = async () => {
      const queryString = query(key);
      const target = qs("[data-list]", panel);
      await panelRequest(target, `/api/admin/media?${queryString}`, (data) => {
      const exportLink = qs("a[href^='/api/admin/media/export']", panel);
      if (exportLink) exportLink.href = `/api/admin/media/export?${queryString}`;
      target.innerHTML = table(data.items || [], [{ label: "\u6807\u9898", value: (row) => row.title || row.filename }, { label: "URL", value: "url" }, { label: "Alt", value: "alt" }, { label: "\u66f4\u65b0", value: "updatedAt" }]) + pager(data, key);
      bindPagerWithin(target, key, load);
      }, load);
    };
    qs("[data-media-form]", panel).addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      await tryLoad(async () => {
        await api("/api/admin/media", { method: "POST", body: JSON.stringify(Object.fromEntries(new FormData(form))) });
        form.reset();
        setStatus("媒体资料已保存");
        await load();
      });
    });
    bindToolbar(panel, key, load);
    await load();
  }

  async function users() {
    const key = "users";
    const panel = qs("[data-panel='users']");
    panel.innerHTML = card("账号与角色", `${toolbar(key)}<form class="form-row" data-user-form><input name="name" placeholder="姓名" aria-label="姓名"><input name="email" type="email" required placeholder="邮箱" aria-label="邮箱"><select name="role" aria-label="角色"><option>Admin</option><option>Editor</option><option>Sales</option><option>Viewer</option></select><select name="status" aria-label="登录状态"><option value="active">启用</option><option value="disabled">停用</option></select><button class="button primary">${label.save}</button></form><div data-list>${label.loading}</div><div data-role-list></div>`);
    const load = async () => {
      const target = qs("[data-list]", panel);
      await panelRequest(target, `/api/admin/users?${query(key)}`, (data) => {
        target.innerHTML = table(data.users?.items || [], [{ label: "姓名", value: "name" }, { label: "邮箱", value: "email" }, { label: "角色", value: "role" }, { label: "登录状态", value: (row) => row.loginEnabled ? "已开通" : row.status === "disabled" ? "已停用" : "未开通" }]) + pager(data.users, key);
        bindPagerWithin(target, key, load);
        qs("[data-role-list]", panel).innerHTML = card("角色", table(data.roles || [], [{ label: "角色", value: "name" }, { label: "说明", value: "description" }]));
      }, load);
    };
    qs("[data-user-form]", panel).addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      await tryLoad(async () => {
        await api("/api/admin/users", { method: "POST", body: JSON.stringify(Object.fromEntries(new FormData(form))) });
        form.reset();
        setStatus("账号记录已保存");
        await load();
      });
    });
    bindToolbar(panel, key, load);
    await load();
  }

  async function sync() {
    const key = "syncJobs";
    const panel = qs("[data-panel='sync']");
    panel.innerHTML = card("数据源", `${can("sync:edit") ? '<div class="actions"><button class="button secondary" data-sync-gsc>同步 Google 搜索表现</button></div>' : ""}<div data-sync-sources></div>`) + card("最近任务", `${toolbar(key)}<div data-sync-jobs>${label.loading}</div>`);
    const load = async () => {
      const results = qs("[data-sync-jobs]", panel);
      await panelRequest(results, `/api/admin/sync?${query(key)}`, (data) => {
        qs("[data-sync-sources]", panel).innerHTML = table(data.sources || [], [{ label: "数据源", value: "name" }, { label: "状态", value: "status" }, { label: "最近写入或任务时间", value: (row) => formatTime(row.lastSync) }, { label: "耗时", value: (row) => Number.isFinite(row.durationMs) ? row.durationMs + " ms" : "—" }]);
        const jobs = data.jobs || { items: [] };
        results.innerHTML = table(jobs.items || [], [{ label: "时间", value: (row) => formatTime(row.time) }, { label: "类型", value: "type" }, { label: "状态", value: "status" }]) + pager(jobs, key);
        bindPagerWithin(results, key, load);
      }, load);
    };
    qs("[data-sync-gsc]", panel)?.addEventListener("click", () => tryLoad(async () => { await api("/api/admin/sync/google-seo", { method: "POST" }); state.page[key] = 1; setStatus("Google 搜索表现已同步"); await load(); }));
    bindToolbar(panel, key, load);
    await load();
  }

  async function logs() {
    const key = "logs";
    const panel = qs("[data-panel='logs']");
    panel.innerHTML = card("\u64cd\u4f5c\u65e5\u5fd7", `${toolbar(key)}<div class="actions"><a class="button secondary" href="/api/admin/audit-logs/export">${label.exportCsv}</a></div><div data-list>${label.loading}</div>`);
    const load = async () => {
      const queryString = query(key);
      const target = qs("[data-list]", panel);
      await panelRequest(target, `/api/admin/audit-logs?${queryString}`, (data) => {
      const exportLink = qs("a[href^='/api/admin/audit-logs/export']", panel);
      if (exportLink) exportLink.href = `/api/admin/audit-logs/export?${queryString}`;
      target.innerHTML = table(data.items || [], [{ label: "\u65f6\u95f4", value: "time" }, { label: "\u7528\u6237", value: "user" }, { label: "\u64cd\u4f5c", value: "action" }, { label: "\u5bf9\u8c61", value: "object" }, { label: "\u6458\u8981", value: "summary" }]) + pager(data, key);
      bindPagerWithin(target, key, load);
      }, load);
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
      <label>\u90ae\u7bb1<input name="email" readonly></label>
      <label>WhatsApp<input name="whatsapp"></label>
      <label>\u9ed8\u8ba4\u8bed\u8a00<input name="defaultLanguage"></label>
      <label>\u652f\u6301\u8bed\u8a00<textarea name="supportedLanguages"></textarea></label>
      <label>\u5e02\u573a\u8986\u76d6<textarea name="marketCoverage"></textarea></label>
      <label>\u9ed8\u8ba4\u65f6\u533a<input name="timezone" value="Africa/Johannesburg" readonly></label>
      ${can("settings:edit") ? `<button class="button primary">${label.save}</button>` : ""}
    </form>`);
    qsa("[data-settings] [name]", panel).forEach((input) => {
      const value = input.name === "email" ? "info@cowinmagnet.com" : input.name === "timezone" ? "Africa/Johannesburg" : data[input.name];
      if (value != null) input.value = Array.isArray(value) ? value.join(", ") : value;
      if (!can("settings:edit")) input.readOnly = true;
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
      state.permissions = session.permissions || [];
      qs("[data-user-email]").textContent = session.email || session.user || "";
      qsa("[data-view]").forEach((button) => { button.hidden = !allowedView(button.dataset.view); });
    } catch {
      window.location.href = "/admin/login/";
      return;
    }
    qsa("[data-view]").forEach((button) => button.addEventListener("click", () => activate(button.dataset.view)));
    qs("[data-refresh]").addEventListener("click", () => activate(state.view));
    const menu = qs("[data-admin-menu]");
    menu.addEventListener("click", () => menu.setAttribute("aria-expanded", String(menu.getAttribute("aria-expanded") !== "true")));
    qs(".sidebar").addEventListener("keydown", (event) => {
      if (event.key === "Escape" && menu.getAttribute("aria-expanded") === "true") { closeAdminMenu(); menu.focus(); }
    });
    qs("[data-logout]").addEventListener("click", async () => {
      await api("/api/logout", { method: "POST" }).catch(() => null);
      window.location.href = "/admin/login/";
    });
    activate(new URLSearchParams(window.location.search).get("view") || "dashboard");
  }

  init();
})();
