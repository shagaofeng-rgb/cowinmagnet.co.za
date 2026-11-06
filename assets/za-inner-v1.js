(() => {
  const quote = document.querySelector('.za-form-shell [name="productRequired"]');
  const selectedProduct = new URLSearchParams(location.search).get("product")?.trim();
  if (quote instanceof HTMLInputElement && selectedProduct) quote.value = selectedProduct.slice(0, 180);
  const tablist = document.querySelector(".za-tabs");
  if (!tablist) return;
  const tabs = [...tablist.querySelectorAll('[role="tab"]')];
  const panels = tabs.map((tab) => document.getElementById(tab.getAttribute("aria-controls")));
  if (!tabs.length || panels.some((panel) => !panel)) return;
  const enquiry = document.querySelector("[data-za-enquiry]");
  const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  function select(index) {
    tabs.forEach((tab, i) => {
      tab.setAttribute("aria-selected", String(i === index));
      tab.tabIndex = i === index ? 0 : -1;
      panels[i].hidden = i !== index;
    });
  }
  function byHash() {
    let id;
    try { id = decodeURIComponent(location.hash.slice(1)); } catch { return; }
    const target = document.getElementById(id);
    if (target && enquiry?.contains(target)) enquiry.open = true;
    const index = target ? panels.findIndex((panel) => panel === target || panel.contains(target)) : -1;
    select(Math.max(0, index));
  }
  function choose(index, { scroll = false, focus = false } = {}) {
    select(index);
    const id = panels[index].id;
    if (location.hash !== "#" + id) history.pushState(null, "", "#" + id);
    if (focus || scroll) tabs[index].focus({ preventScroll: true });
    if (scroll) tablist.scrollIntoView({ block: "start", behavior: reducedMotion() ? "instant" : "smooth" });
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => choose(index));
    tab.addEventListener("keydown", (event) => {
      const { key } = event;
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(key)) return;
      event.preventDefault();
      const next = key === "Home" ? 0 : key === "End" ? tabs.length - 1 : (index + (key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
      choose(next, { focus: true });
      tabs[next].scrollIntoView({ block: "nearest", inline: "nearest" });
    });
  });
  document.querySelector(".za-spec-button")?.addEventListener("click", (event) => {
    const index = panels.findIndex((panel) => panel.querySelector("#product-specifications"));
    if (index < 0) return;
    event.preventDefault();
    choose(index, { scroll: true });
    tabs[index].scrollIntoView({ block: "nearest", inline: "nearest" });
  });
  document.querySelectorAll('a[href="#product-product-inquiry"]').forEach((link) => link.addEventListener("click", () => {
    if (enquiry) enquiry.open = true;
  }));
  window.addEventListener("hashchange", byHash);
  window.addEventListener("popstate", byHash);
  byHash();
  tablist.hidden = false;
  if (tablist.previousElementSibling?.matches(".za-tab-heading")) tablist.previousElementSibling.hidden = false;
})();
