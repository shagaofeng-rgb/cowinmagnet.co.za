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

  const header = document.querySelector(".site-header");
  const mobileButton = document.querySelector("[data-mobile-toggle]");
  const mobilePanel = document.querySelector("[data-mobile-panel]");
  const megaButtons = document.querySelectorAll("[data-mega-button]");
  const megaPanels = document.querySelectorAll("[data-mega-panel]");
  const backdrop = document.querySelector("[data-nav-backdrop]");

  function closeMenus() {
    header?.classList.remove("menu-open", "mega-open");
    document.body.classList.remove("scroll-locked");
    mobileButton?.setAttribute("aria-expanded", "false");
    mobilePanel?.setAttribute("hidden", "");
    megaButtons.forEach((button) => button.setAttribute("aria-expanded", "false"));
    megaPanels.forEach((panel) => panel.setAttribute("hidden", ""));
  }

  mobileButton?.addEventListener("click", () => {
    const opening = mobilePanel?.hasAttribute("hidden");
    closeMenus();
    if (opening) {
      header?.classList.add("menu-open");
      document.body.classList.add("scroll-locked");
      mobileButton.setAttribute("aria-expanded", "true");
      mobilePanel?.removeAttribute("hidden");
    }
  });

  megaButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.getAttribute("aria-controls");
      const panel = id ? document.getElementById(id) : null;
      const opening = panel?.hasAttribute("hidden");
      closeMenus();
      if (opening && panel) {
        header?.classList.add("mega-open");
        button.setAttribute("aria-expanded", "true");
        panel.removeAttribute("hidden");
      }
    });
  });

  backdrop?.addEventListener("click", closeMenus);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeMenus();
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
        if (main && src) main.setAttribute("src", src);
        thumbs.forEach((item) => item.setAttribute("aria-current", "false"));
        thumb.setAttribute("aria-current", "true");
      });
    });
  });

  const productFilter = document.querySelector("[data-product-filter]");
  if (productFilter) {
    const cards = document.querySelectorAll("[data-product-card]");
    productFilter.addEventListener("input", () => {
      const form = new FormData(productFilter);
      const text = String(form.get("q") || "").toLowerCase();
      const type = String(form.get("type") || "");
      const cleaning = String(form.get("cleaning") || "");
      let visible = 0;
      cards.forEach((card) => {
        const haystack = card.textContent.toLowerCase();
        const okText = !text || haystack.includes(text);
        const okType = !type || card.dataset.type === type;
        const okCleaning = !cleaning || card.dataset.cleaning === cleaning;
        const ok = okText && okType && okCleaning;
        card.toggleAttribute("hidden", !ok);
        if (ok) visible += 1;
      });
      document.querySelector("[data-product-empty]")?.toggleAttribute("hidden", visible > 0);
    });
  }

  const quoteForm = document.querySelector("[data-quote-form]");
  const quoteSubmit = quoteForm?.querySelector("button[type='submit'], button:not([type])");
  const quoteFile = quoteForm?.querySelector("[type='file']");
  quoteFile?.closest("label")?.setAttribute("hidden", "");
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
