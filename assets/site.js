(function () {
  function detectBrowser() {
    const ua = navigator.userAgent;
    if (/Edg\//.test(ua)) return "Edge";
    if (/Chrome\//.test(ua)) return "Chrome";
    if (/Safari\//.test(ua)) return "Safari";
    if (/Firefox\//.test(ua)) return "Firefox";
    return "Browser";
  }

  function trackPageview() {
    const key = "cowinmagnet_africa_client_id";
    let clientId = localStorage.getItem(key);
    if (!clientId) {
      clientId = `C${Math.random().toString(16).slice(2, 8).toUpperCase()}`;
      localStorage.setItem(key, clientId);
    }
    fetch("/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventType: "pageview",
        clientId,
        page: window.location.pathname,
        referrer: document.referrer,
        device: window.matchMedia("(max-width: 760px)").matches ? "Mobile" : "Desktop",
        browser: detectBrowser(),
        country: "",
        language: document.documentElement.dataset.locale || "en-za",
      }),
    }).catch(() => {});
  }

  trackPageview();

  // Keep the public information architecture focused on the decisions a buyer
  // needs to make. Existing detail URLs stay available behind these groups.
  const panelAliases = [
    ["mega-resources", "mega-solutions"],
    ["mega-company", "mega-resources"]
  ];
  panelAliases.forEach(([currentId, nextId]) => {
    const panel = document.getElementById(currentId);
    if (panel && !document.getElementById(nextId)) panel.id = nextId;
  });
  const primaryNav = document.querySelector(".desktop-nav");
  if (primaryNav) {
    const isCurrentSection = (path) => window.location.pathname.startsWith(path);
    primaryNav.innerHTML = `
      <span class="nav-split"><a href="/en-za/products/"${isCurrentSection("/en-za/products/") ? ' aria-current="page"' : ""}>Products</a><button type="button" data-mega-button aria-expanded="false" aria-controls="mega-products" aria-label="Open Products menu"><span aria-hidden="true">&#8964;</span></button></span>
      <span class="nav-split"><a href="/en-za/industries/"${isCurrentSection("/en-za/industries/") ? ' aria-current="page"' : ""}>Industries</a><button type="button" data-mega-button aria-expanded="false" aria-controls="mega-industries" aria-label="Open Industries menu"><span aria-hidden="true">&#8964;</span></button></span>
      <span class="nav-split"><a href="/en-za/solutions/"${isCurrentSection("/en-za/solutions/") ? ' aria-current="page"' : ""}>Solutions</a><button type="button" data-mega-button aria-expanded="false" aria-controls="mega-solutions" aria-label="Open Solutions menu"><span aria-hidden="true">&#8964;</span></button></span>
      <span class="nav-split"><a href="/en-za/news/"${isCurrentSection("/en-za/news/") ? ' aria-current="page"' : ""}>Resources</a><button type="button" data-mega-button aria-expanded="false" aria-controls="mega-resources" aria-label="Open Resources menu"><span aria-hidden="true">&#8964;</span></button></span>
      <a href="/en-za/about/"${isCurrentSection("/en-za/about/") ? ' aria-current="page"' : ""}>About COWIN</a>
      <a href="/en-za/contact/"${isCurrentSection("/en-za/contact/") ? ' aria-current="page"' : ""}>Contact</a>`;
  }
  const headerActions = document.querySelector(".header-actions");
  if (headerActions && !headerActions.querySelector("[data-whatsapp-link]")) {
    const quote = headerActions.querySelector(".quote-link");
    const whatsapp = document.createElement("a");
    whatsapp.className = "header-whatsapp";
    whatsapp.href = "https://wa.me/8615665135205?text=Hello%20COWIN%20MAGNET%2C%20I%20would%20like%20selection%20support.";
    whatsapp.target = "_blank";
    whatsapp.rel = "noopener noreferrer nofollow";
    whatsapp.dataset.whatsappLink = "";
    whatsapp.setAttribute("aria-label", "Contact COWIN MAGNET on WhatsApp");
    whatsapp.textContent = "WhatsApp";
    quote?.before(whatsapp);
  }
  const mobileNavigation = document.querySelector("[data-mobile-panel]");
  if (mobileNavigation) {
    const mobileGroups = [
      ["Products", "/en-za/products/", "mobile-products", [["Conveyor Iron Removal", "/en-za/products/suspended-and-self-unloading-iron-removers/"], ["Mineral Processing", "/en-za/products/magnetic-separation-equipment/"], ["Recycling & Detection", "/en-za/products/metal-detection-and-recycling-sorting/"], ["Filters & Components", "/en-za/products/magnetic-components-and-filters/"]]],
      ["Industries", "/en-za/industries/", "mobile-industries", [["Mining & Mineral Processing", "/en-za/industries/mining/"], ["Coal Handling & Washing", "/en-za/industries/coal-handling/"], ["Aggregates & Cement", "/en-za/industries/quarry-aggregates/"], ["Recycling & Recovery", "/en-za/industries/recycling/"]]],
      ["Solutions", "/en-za/solutions/", "mobile-solutions", [["Crusher Protection", "/en-za/solutions/crusher-protection/"], ["Tramp Iron Removal", "/en-za/solutions/tramp-iron-removal/"], ["Conveyor Belt Protection", "/en-za/solutions/conveyor-belt-protection/"], ["Non-Ferrous Recovery", "/en-za/solutions/non-ferrous-metal-recovery/"]]],
      ["Resources", "/en-za/news/", "mobile-resources", [["News & Insights", "/en-za/news/"], ["Selection Guides", "/en-za/technical-support/product-selection-guide/"], ["Installation Guides", "/en-za/technical-support/installation-guide/"], ["Technical Documents", "/en-za/downloads/"]]]
    ];
    mobileNavigation.innerHTML = `${mobileGroups.map(([label, href, id, links]) => `<div class="mobile-group"><div class="mobile-group-row"><a href="${href}"${window.location.pathname.startsWith(href) ? ' aria-current="page"' : ""}>${label}</a><button type="button" data-mobile-group aria-expanded="false" aria-controls="${id}" aria-label="Open ${label} menu"><span aria-hidden="true">&#8964;</span></button></div><div id="${id}" class="mobile-links" hidden>${links.map(([text, link]) => `<a href="${link}">${text}</a>`).join("")}</div></div>`).join("")}<div class="mobile-links mobile-direct-links"><a href="/en-za/about/">About COWIN</a><a href="/en-za/contact/">Contact</a><a href="https://wa.me/8615665135205" target="_blank" rel="noopener noreferrer nofollow">WhatsApp</a><a class="quote-link" href="/en-za/request-a-quote/">Request a Quote</a></div>`;
  }
  const conciseMenus = {
    "mega-products": [
      ["Conveyor iron removal", [["Permanent Overband Separator", "/en-za/products/suspended-and-self-unloading-iron-removers/"], ["Suspended Permanent Separator", "/en-za/products/magnetic-separation-equipment/suspended-permanent-magnetic-separator/"], ["Suspended Electromagnetic Separator", "/en-za/products/suspended-and-self-unloading-iron-removers/"], ["Magnetic Head Pulley", "/en-za/products/metal-detection-and-recycling-sorting/magnetic-head-pulley/"]]],
      ["Mineral processing", [["Wet Drum Separator", "/en-za/products/magnetic-separation-equipment/"], ["Dry Drum Separator", "/en-za/products/magnetic-separation-equipment/"], ["High-Gradient Separator", "/en-za/products/magnetic-separation-equipment/belt-high-gradient-magnetic-separator/"], ["Coal Washing Equipment", "/en-za/products/magnetic-separation-equipment/"]]],
      ["Recycling & detection", [["Eddy Current Separator", "/en-za/products/metal-detection-and-recycling-sorting/eccentric-eddy-current-separator/"], ["Conveyor Metal Detector", "/en-za/products/conveyor-metal-detector/"], ["Stainless Separation Conveyor", "/en-za/products/metal-detection-and-recycling-sorting/"], ["Magnetic Drum Separator", "/en-za/products/metal-detection-and-recycling-sorting/drum-magnet/"]]],
      ["Filters & components", [["Drawer Magnet", "/en-za/products/magnetic-components-and-filters/"], ["Magnetic Grid / Rod", "/en-za/products/magnetic-components-and-filters/magnetic-grid/"], ["Pipeline Magnetic Filter", "/en-za/products/magnetic-components-and-filters/"], ["View All Products", "/en-za/products/"]]]
    ],
    "mega-industries": [
      ["Process industries", [["Mining & Mineral Processing", "/en-za/industries/mining/"], ["Coal Handling & Washing", "/en-za/industries/coal-handling/"], ["Aggregates, Quarrying & Cement", "/en-za/industries/quarry-aggregates/"], ["Recycling & Material Recovery", "/en-za/industries/recycling/"]]],
      ["Bulk-material projects", [["Ports, Power & Bulk Handling", "/en-za/industries/ports-bulk-terminals/"], ["Cement", "/en-za/industries/cement/"], ["South African project support", "/en-za/markets/south-africa/"], ["View all industries", "/en-za/industries/"]]]
    ],
    "mega-solutions": [
      ["Protection", [["Crusher Protection", "/en-za/solutions/crusher-protection/"], ["Tramp Iron Removal", "/en-za/solutions/tramp-iron-removal/"], ["Conveyor Belt Protection", "/en-za/solutions/conveyor-belt-protection/"]]],
      ["Recovery and purity", [["Magnetic Mineral Recovery", "/en-za/solutions/"], ["Non-Ferrous Metal Recovery", "/en-za/solutions/non-ferrous-metal-recovery/"], ["Fine Iron Contamination Control", "/en-za/solutions/"], ["View all solutions", "/en-za/solutions/"]]]
    ],
    "mega-resources": [
      ["Selection resources", [["Product selection guide", "/en-za/technical-support/product-selection-guide/"], ["Installation guide", "/en-za/technical-support/installation-guide/"], ["Technical documents", "/en-za/downloads/"]]],
      ["Latest and support", [["News & Insights", "/en-za/news/"], ["Selection FAQ", "/en-za/technical-support/product-selection-guide/"], ["Contact COWIN", "/en-za/contact/"], ["Request a quote", "/en-za/request-a-quote/"]]]
    ]
  };
  Object.entries(conciseMenus).forEach(([id, columns]) => {
    const panel = document.getElementById(id);
    if (!panel) return;
    panel.innerHTML = `<div class="mega-grid concise">${columns.map(([title, links]) => `<nav class="mega-col"><h3>${title}</h3>${links.map(([label, href]) => `<a href="${href}">${label}</a>`).join("")}</nav>`).join("")}</div><div class="mega-menu-cta"><span>Need help selecting equipment?</span><a href="/en-za/request-a-quote/">Talk to an engineer</a></div>`;
    panel.setAttribute("hidden", "");
  });

  const header = document.querySelector(".site-header");
  if (header && !document.querySelector(".utility-strip")) {
    const utility = document.createElement("aside");
    utility.className = "utility-strip";
    utility.innerHTML = `<span>Magnetic separation support for African industrial projects</span><span><a href="mailto:davidsha@cowinmagnet.com">davidsha@cowinmagnet.com</a><a href="https://wa.me/8615665135205" target="_blank" rel="noopener noreferrer nofollow">WhatsApp +86 156 6513 5205</a></span>`;
    header.before(utility);
  }
  const mobileButton = document.querySelector("[data-mobile-toggle]");
  const mobilePanel = document.querySelector("[data-mobile-panel]");
  const megaButtons = document.querySelectorAll("[data-mega-button]");
  const megaPanels = document.querySelectorAll("[data-mega-panel]");
  const backdrop = document.querySelector("[data-nav-backdrop]");
  let hoverCloseTimer;
  let focusReturnTarget;

  function cancelHoverClose() {
    window.clearTimeout(hoverCloseTimer);
  }

  function scheduleHoverClose() {
    cancelHoverClose();
    hoverCloseTimer = window.setTimeout(closeMenus, 140);
  }

  function closeMenus({ restoreFocus = false } = {}) {
    header?.classList.remove("menu-open", "mega-open");
    document.body.classList.remove("scroll-locked");
    mobileButton?.setAttribute("aria-expanded", "false");
    mobilePanel?.setAttribute("hidden", "");
    megaButtons.forEach((button) => button.setAttribute("aria-expanded", "false"));
    megaPanels.forEach((panel) => panel.setAttribute("hidden", ""));
    if (restoreFocus && focusReturnTarget) focusReturnTarget.focus();
  }

  mobileButton?.addEventListener("click", () => {
    const opening = mobilePanel?.hasAttribute("hidden");
    if (!opening) return closeMenus({ restoreFocus: true });
    focusReturnTarget = mobileButton;
    closeMenus();
    if (opening) {
      header?.classList.add("menu-open");
      document.body.classList.add("scroll-locked");
      mobileButton.setAttribute("aria-expanded", "true");
      mobilePanel?.removeAttribute("hidden");
      window.setTimeout(() => mobilePanel?.querySelector("a, button")?.focus(), 0);
    }
  });

  function openMega(button, moveFocus = false) {
    const id = button.getAttribute("aria-controls");
    const panel = id ? document.getElementById(id) : null;
    if (!panel) return;
    focusReturnTarget = button;
    closeMenus();
    header?.classList.add("mega-open");
    button.setAttribute("aria-expanded", "true");
    panel.removeAttribute("hidden");
    if (moveFocus) window.setTimeout(() => panel.querySelector("a")?.focus(), 0);
  }

  megaButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const panel = document.getElementById(button.getAttribute("aria-controls"));
      if (!panel?.hasAttribute("hidden")) return closeMenus({ restoreFocus: true });
      openMega(button, true);
    });
    button.addEventListener("pointerenter", () => {
      cancelHoverClose();
      const id = button.getAttribute("aria-controls");
      const panel = id ? document.getElementById(id) : null;
      if (panel?.hasAttribute("hidden")) openMega(button);
    });
    button.addEventListener("pointerleave", scheduleHoverClose);
  });

  megaPanels.forEach((panel) => {
    panel.addEventListener("pointerenter", cancelHoverClose);
    panel.addEventListener("pointerleave", scheduleHoverClose);
  });

  backdrop?.addEventListener("click", closeMenus);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeMenus({ restoreFocus: true });
    if (event.key === "Tab" && mobilePanel && !mobilePanel.hasAttribute("hidden")) {
      const focusable = [...mobilePanel.querySelectorAll("a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])")]
        .filter((element) => !element.closest("[hidden]"));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  });
  document.querySelectorAll(".site-header a").forEach((link) => {
    link.addEventListener("click", closeMenus);
  });

  document.querySelectorAll("[data-mobile-group]").forEach((button) => {
    button.addEventListener("click", () => {
      const panel = document.getElementById(button.getAttribute("aria-controls"));
      const open = button.getAttribute("aria-expanded") === "true";
      button.setAttribute("aria-expanded", String(!open));
      panel?.toggleAttribute("hidden", open);
    });
  });

  const searchInput = document.querySelector("[data-site-search]");
  searchInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && searchInput.value.trim()) {
      const locale = document.documentElement.dataset.locale || "en-za";
      window.location.href = `/${locale}/search/?q=${encodeURIComponent(searchInput.value.trim())}`;
    }
  });

  const languageSelect = document.querySelector("[data-language-select]");
  if (languageSelect) {
    const currentLocale = document.documentElement.dataset.locale || "en-za";
    languageSelect.value = currentLocale;
    languageSelect.addEventListener("change", () => {
      const targetLocale = languageSelect.value;
      const nextPath = window.location.pathname.replace(/^\/[a-z]{2}(?:-[a-z]+)?\//i, `/${targetLocale}/`);
      window.location.href = nextPath + window.location.search;
    });
  }

  const searchResults = document.querySelector("[data-search-results]");
  if (searchResults) {
    const params = new URLSearchParams(window.location.search);
    const query = (params.get("q") || "").trim().toLowerCase();
    const empty = document.querySelector("[data-search-empty]");
    if (query && searchInput) searchInput.value = query;
    fetch("/data/search-index.json")
      .then((response) => response.json())
      .then((items) => {
        const locale = document.documentElement.dataset.locale || "en-za";
        const results = query
          ? items.filter((item) => `${item.title} ${item.type} ${item.summary}`.toLowerCase().includes(query))
          : items.slice(0, 12);
        searchResults.innerHTML = results.map((item) => {
          const localizedUrl = item.url.replace("/en-za/", `/${locale}/`);
          return `<a class="card" href="${localizedUrl}"><p class="eyebrow">${item.type}</p><h3>${item.title}</h3><p>${item.summary}</p></a>`;
        }).join("");
        empty?.toggleAttribute("hidden", results.length > 0);
      })
      .catch(() => {
        empty?.removeAttribute("hidden");
      });
  }

  document.querySelectorAll("[data-faq-button]").forEach((button) => {
    button.addEventListener("click", () => {
      const panel = document.getElementById(button.getAttribute("aria-controls"));
      const open = button.getAttribute("aria-expanded") === "true";
      button.setAttribute("aria-expanded", String(!open));
      panel?.toggleAttribute("hidden", open);
    });
  });

  document.querySelectorAll("[data-gallery]").forEach((gallery) => {
    const main = gallery.querySelector("[data-gallery-main]");
    const thumbs = gallery.querySelectorAll("[data-gallery-thumb]");
    thumbs.forEach((thumb) => {
      thumb.addEventListener("click", () => {
        const src = thumb.getAttribute("data-src");
        if (main && src) {
          main.setAttribute("src", src);
          const image = thumb.querySelector("img");
          if (image?.alt) main.setAttribute("alt", image.alt.replace(/thumbnail/i, "product image"));
        }
        thumbs.forEach((item) => item.setAttribute("aria-current", "false"));
        thumb.setAttribute("aria-current", "true");
      });
    });
  });

  const productFilter = document.querySelector("[data-product-filter]");
  if (productFilter) {
    const cards = document.querySelectorAll("[data-product-card]");
    const applyProductFilters = () => {
      const form = new FormData(productFilter);
      const text = String(form.get("q") || "").toLowerCase();
      const type = String(form.get("type") || "");
      const cleaning = String(form.get("cleaning") || "");
      const category = String(form.get("category") || "");
      const application = String(form.get("application") || "");
      let visible = 0;
      cards.forEach((card) => {
        const haystack = card.textContent.toLowerCase();
        const okText = !text || haystack.includes(text);
        const okType = !type || card.dataset.type === type;
        const okCleaning = !cleaning || card.dataset.cleaning === cleaning;
        const okCategory = !category || card.dataset.category === category;
        const okApplication = !application || card.dataset.application?.includes(application);
        const ok = okText && okType && okCleaning && okCategory && okApplication;
        card.toggleAttribute("hidden", !ok);
        if (ok) visible += 1;
      });
      document.querySelector("[data-product-empty]")?.toggleAttribute("hidden", visible > 0);
      const count = document.querySelector("[data-product-match-count]");
      if (count) count.textContent = String(visible);
      const catalogue = document.querySelector(".full-product-catalogue");
      if (catalogue && (text || type || cleaning || category || application)) catalogue.open = true;
    };
    productFilter.addEventListener("input", applyProductFilters);
    productFilter.addEventListener("change", applyProductFilters);
    productFilter.addEventListener("reset", () => window.setTimeout(applyProductFilters, 0));
  }

  const quoteForm = document.querySelector("[data-quote-form]");
  function enhanceQuoteWorkflow(form) {
    if (!form || !window.location.pathname.includes("/request-a-quote/") || form.dataset.quoteStepsReady === "true") return;
    const labels = [...form.querySelectorAll(":scope > label")];
    if (labels.length < 6) return;
    const groups = [
      { title: "Project contact", description: "Tell us who to contact and where the project is based.", names: ["name", "company", "country", "region", "email", "whatsapp", "preferredLanguage", "industry"] },
      { title: "Material and equipment", description: "Describe the duty, material stream and requested equipment.", names: ["productRequired", "materialType", "materialSize", "capacity", "beltWidth", "beltSpeed", "layerThickness", "suspensionHeight", "installationPosition", "layout", "cleaning", "trampIronSize", "trampIronWeight"] },
      { title: "Operating conditions", description: "Add the site conditions that affect final configuration.", names: ["operatingHours", "siteType", "temperature", "altitude", "dustLevel", "humidity", "coastal", "voltage", "frequency", "phases"] }
    ];
    const steps = groups.map((group, index) => {
      const fieldset = document.createElement("fieldset");
      fieldset.className = "quote-step";
      fieldset.dataset.quoteStep = String(index);
      fieldset.hidden = index !== 0;
      fieldset.innerHTML = `<legend>${group.title}</legend><p>${group.description}</p>`;
      return fieldset;
    });
    const used = new Set();
    groups.forEach((group, index) => {
      group.names.forEach((name) => {
        const label = labels.find((item) => item.querySelector(`[name='${name}']`));
        if (label) {
          steps[index].append(label);
          used.add(label);
        }
      });
    });
    labels.filter((label) => !used.has(label)).forEach((label) => steps[2].append(label));
    const progress = document.createElement("ol");
    progress.className = "quote-progress";
    progress.setAttribute("aria-label", "Inquiry progress");
    progress.innerHTML = groups.map((group, index) => `<li${index === 0 ? " aria-current='step'" : ""}><span>${index + 1}</span>${group.title}</li>`).join("");
    const controls = document.createElement("div");
    controls.className = "quote-step-controls";
    controls.innerHTML = `<button type="button" class="button secondary" data-quote-previous>Back</button><button type="button" class="button primary" data-quote-next>Continue</button>`;
    form.prepend(progress);
    steps.forEach((step) => form.insertBefore(step, form.querySelector("button[type='submit']")));
    form.insertBefore(controls, form.querySelector("button[type='submit']"));
    const submit = form.querySelector("button[type='submit']");
    const status = form.querySelector("[data-form-status]");
    const storageKey = "cowinmagnet_africa_quote_draft";
    const draft = JSON.parse(localStorage.getItem(storageKey) || "null");
    if (draft && typeof draft === "object") {
      Object.entries(draft).forEach(([name, value]) => {
        const field = form.querySelector(`[name='${CSS.escape(name)}']`);
        if (field && typeof value === "string") field.value = value;
      });
      if (status) status.textContent = "Your saved inquiry draft has been restored.";
    }
    let active = 0;
    const update = () => {
      steps.forEach((step, index) => step.toggleAttribute("hidden", index !== active));
      progress.querySelectorAll("li").forEach((item, index) => item.toggleAttribute("aria-current", index === active));
      controls.querySelector("[data-quote-previous]").toggleAttribute("hidden", active === 0);
      controls.querySelector("[data-quote-next]").toggleAttribute("hidden", active === steps.length - 1);
      submit?.toggleAttribute("hidden", active !== steps.length - 1);
      steps[active].querySelector("input, textarea, select")?.focus({ preventScroll: true });
    };
    controls.querySelector("[data-quote-next]").addEventListener("click", () => {
      const fields = [...steps[active].querySelectorAll("input, textarea, select")];
      const invalid = fields.find((field) => !field.checkValidity());
      if (invalid) return invalid.reportValidity();
      active += 1;
      update();
    });
    controls.querySelector("[data-quote-previous]").addEventListener("click", () => {
      active = Math.max(0, active - 1);
      update();
    });
    form.addEventListener("input", () => {
      const values = Object.fromEntries(new FormData(form).entries());
      delete values.fileUpload;
      localStorage.setItem(storageKey, JSON.stringify(values));
    });
    form.dataset.quoteDraftKey = storageKey;
    form.dataset.quoteStepsReady = "true";
    update();
  }
  enhanceQuoteWorkflow(quoteForm);
  const quoteSubmit = quoteForm?.querySelector("button[type='submit'], button:not([type])");
  const quoteFile = quoteForm?.querySelector("[type='file']");
  quoteFile?.closest("label")?.setAttribute("hidden", "");
  document.querySelectorAll("[data-product-enquiry-form]").forEach((form) => {
    const params = new URLSearchParams(window.location.search);
    const source = form.querySelector("[name='sourceUrl']");
    const language = form.querySelector("[name='pageLanguage']");
    if (source) source.value = window.location.href;
    if (language) language.value = document.documentElement.dataset.locale || "en-za";
    ["utm_source", "utm_medium", "utm_campaign"].forEach((key) => {
      const field = form.querySelector(`[name='${key}']`);
      if (field) field.value = params.get(key) || "";
    });
  });
  if (quoteSubmit && /local|demo/i.test(quoteSubmit.textContent || "")) {
    quoteSubmit.textContent = window.location.pathname.includes("request-a-quote") ? "Submit Inquiry" : "Send Inquiry";
  }
  quoteForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    const status = quoteForm.querySelector("[data-form-status]");
    const email = quoteForm.querySelector("[name='email']");
    const phone = quoteForm.querySelector("[name='whatsapp']");
    const file = quoteFile;
    const required = quoteForm.querySelectorAll("[required]");
    let valid = true;
    required.forEach((field) => {
      const empty = !String(field.value || "").trim();
      field.toggleAttribute("aria-invalid", empty);
      if (empty) valid = false;
    });
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value)) {
      email.setAttribute("aria-invalid", "true");
      valid = false;
    }
    if (phone && phone.value && !/^[+0-9 ()-]{7,}$/.test(phone.value)) {
      phone.setAttribute("aria-invalid", "true");
      valid = false;
    }
    if (file && file.files.length) {
      const allowed = ["application/pdf", "image/jpeg", "image/png", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
      const maxBytes = 8 * 1024 * 1024;
      const selected = file.files[0];
      const okType = allowed.includes(selected.type) || /\.(pdf|jpe?g|png|docx?)$/i.test(selected.name);
      const okSize = selected.size <= maxBytes;
      file.toggleAttribute("aria-invalid", !(okType && okSize));
      if (!okType || !okSize) {
        status.textContent = "Upload must be PDF, JPG, PNG, DOC or DOCX and no larger than 8 MB.";
        status.dataset.state = "error";
        return;
      }
    }
    if (!valid) {
      status.textContent = "Please complete required fields and check email or WhatsApp format.";
      status.dataset.state = "error";
      return;
    }
    const payload = Object.fromEntries(new FormData(quoteForm).entries());
    if (file?.files?.length) {
      payload.fileName = file.files[0].name;
      payload.fileSize = file.files[0].size;
      payload.fileType = file.files[0].type;
    }
    delete payload.fileUpload;
    payload.sourcePage = window.location.href;
    payload.language = document.documentElement.dataset.locale || "en-za";
    const duplicateKey = `${payload.email}|${payload.company}|${payload.productRequired}`;
    if (quoteForm.dataset.submitting === "true") return;
    quoteForm.dataset.submitting = "true";
    status.textContent = "Submitting inquiry...";
    status.dataset.state = "success";
    fetch("/api/enquiries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, duplicateKey }),
    })
      .then((response) => response.json().then((data) => ({ response, data })))
      .then(({ response, data }) => {
        if (!response.ok || data.success === false) throw new Error(data.error || "Submission failed.");
        status.textContent = `Inquiry saved. Reference: ${data.data.id}`;
        status.dataset.state = "success";
        if (quoteForm.dataset.quoteDraftKey) localStorage.removeItem(quoteForm.dataset.quoteDraftKey);
        quoteForm.reset();
      })
      .catch((error) => {
        const key = "cowinmagnet_africa_quote_submissions";
        const records = JSON.parse(localStorage.getItem(key) || "[]");
        records.push({ duplicateKey, payload, submittedAt: new Date().toISOString(), syncStatus: "api-failed" });
        localStorage.setItem(key, JSON.stringify(records.slice(-100)));
        status.textContent = `${error.message} Inquiry kept locally for retry.`;
        status.dataset.state = "error";
      })
      .finally(() => {
        quoteForm.dataset.submitting = "false";
      });
    /*
    The fallback below is intentionally disabled by the returned promise path above.
    It is kept as a readable reminder of the previous local-only behavior.
    const records = JSON.parse(localStorage.getItem(key) || "[]");
    if (records.some((item) => item.duplicateKey === duplicateKey)) {
      status.textContent = "A similar inquiry has already been saved locally.";
      status.dataset.state = "error";
      return;
    }
    records.push({ duplicateKey, payload, submittedAt: new Date().toISOString() });
    localStorage.setItem(key, JSON.stringify(records.slice(-100)));
    status.textContent = "Inquiry saved locally. Production email/API integration can be connected after deployment setup.";
    status.dataset.state = "success";
    quoteForm.reset();
    */
  });
})();
