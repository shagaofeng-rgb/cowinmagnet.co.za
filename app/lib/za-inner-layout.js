// Presentation only: the original document remains the source for copy, metadata,
// gallery, enquiry fields, links and article content.
const asset = "/assets/za-inner-v1";
const sprite = "/assets/za-inner-icons-v1.svg";
const icons = (name, size = 18) => `<svg class="za-icon" width="${size}" height="${size}" aria-hidden="true" focusable="false"><use href="${sprite}#${name}"></use></svg>`;
const escape = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function findElement(html, tag, opening) {
  const match = opening.exec(html);
  if (!match) return null;
  const tags = new RegExp(`<(\\/?)${tag}\\b[^>]*>`, "gi");
  tags.lastIndex = match.index + match[0].length;
  let depth = 1, next;
  while ((next = tags.exec(html))) {
    depth += next[1] ? -1 : 1;
    if (depth === 0) return {
      start: match.index, end: tags.lastIndex, open: match[0], close: next[0],
      inner: html.slice(match.index + match[0].length, next.index),
      full: html.slice(match.index, tags.lastIndex)
    };
  }
  return null;
}

const productTabs = [
  ["overview", "Overview", "overview", ["overview", "helps-solve"]],
  ["process", "How it works", "process", ["how-it-works", "key-features", "options"]],
  ["specifications", "Specifications", "specs", ["specifications"]],
  ["applications", "Applications", "applications", ["applications"]],
  ["installation", "Installation & care", "install", ["selection", "maintenance"]],
  ["documents", "Documents", "docs", []],
  ["faq", "FAQ", "faq", ["faq"]]
];
const productSection = (body, id) => findElement(body, "section", new RegExp(`<section\\b[^>]*\\bid=['"]product-${id}['"][^>]*>`, "i"));
const keepSection = (section) => section?.full.replace(/\sdata-product-panel\b|\srole=['"]tabpanel['"]|\saria-labelledby=['"]product-tab-[^'"]+['"]/gi, "") ?? "";

function specificationTable(html) {
  const table = findElement(html, "div", /<div\b[^>]*class=['"]product-source-specifications['"][^>]*>/i);
  if (!table) return html;
  const rows = [...table.inner.matchAll(/<div role=['"]row['"]><span>([\s\S]*?)<\/span><strong>([\s\S]*?)<\/strong><span>([\s\S]*?)<\/span><\/div>/gi)];
  if (!rows.length) return html;
  const cells = rows.flatMap(([, field, value, context]) => field === "Project configuration items"
    ? context.replace(/\. To be confirmed for the project\.$/, "").split("; ").map((label) => `<tr><th scope="row">${label}</th><td class="za-pending-spec">Confirm with engineering</td></tr>`)
    : `<tr><th scope="row">${field}</th><td>${value}</td></tr>`);
  return html.slice(0, table.start) + `<table class="za-spec-table"><thead><tr><th scope="col">Parameter</th><th scope="col">Published value</th></tr></thead><tbody>${cells.join("")}</tbody></table>` + html.slice(table.end);
}

function productLayout(main, path) {
  const hero = findElement(main, "section", /<section\b[^>]*class=['"][^'"]*\bproduct-page-hero\b[^'"]*['"][^>]*>/i);
  const detail = findElement(main, "section", /<section\b[^>]*class=['"][^'"]*\bproduct-detail-layout\b[^'"]*['"][^>]*>/i);
  if (!hero || !detail) return null;
  const content = findElement(detail.inner, "article", /<article\b[^>]*class=['"][^'"]*\bproduct-detail-content\b[^'"]*['"][^>]*>/i);
  const rail = findElement(detail.inner, "aside", /<aside\b[^>]*class=['"][^'"]*\bproduct-quote-panel\b[^'"]*['"][^>]*>/i);
  const gallery = findElement(hero.inner, "div", /<div\b[^>]*class=['"][^'"]*\bproduct-hero-media\b[^'"]*['"][^>]*>/i);
  const copy = findElement(hero.inner, "div", /<div\b[^>]*class=['"][^'"]*\bproduct-hero-copy\b[^'"]*['"][^>]*>/i);
  const crumb = findElement(hero.inner, "nav", /<nav\b[^>]*class=['"][^'"]*\bbreadcrumbs\b[^'"]*['"][^>]*>/i);
  if (!content || !gallery || !copy || !rail || !crumb) return null;

  const sectionIds = [...productTabs.flatMap((tab) => tab[3]), "related-products", "product-inquiry"];
  const sections = new Map(sectionIds.map((id) => [id, productSection(content.inner, id)]));
  // If the generator changes, keep the old content/working tabs intact until
  // this presentation adapter has been updated for the new document shape.
  const originalIds = [...content.inner.matchAll(/<section\b[^>]*\bid=['"]product-([^'"]+)['"][^>]*\bdata-product-panel\b/g)].map((m) => m[1]);
  if (originalIds.some((id) => !sections.get(id)) || !sections.get("overview") || !sections.get("product-inquiry")) return null;
  const links = [...crumb.inner.matchAll(/<a\b[^>]*href=['"]([^'"]+)['"][^>]*>([\s\S]*?)<\/a>/gi)];
  const family = links.at(-1);
  const facts = findElement(copy.inner, "dl", /<dl\b[^>]*class=['"][^'"]*\bproduct-quick-facts\b[^'"]*['"][^>]*>/i);
  const factsHtml = path.endsWith("/wet-drum-magnetic-separator/")
    ? '<dl class="za-facts"><div><dt>Process duty</dt><dd>Wet magnetic separation</dd></div><div><dt>Feed state</dt><dd>Slurry</dd></div><div><dt>Selection inputs</dt><dd>Particle size, solids concentration and target fraction</dd></div></dl>'
    : facts ? `<dl class="za-facts">${[...facts.inner.matchAll(/<div>[\s\S]*?<\/div>/gi)].slice(0, 3).map((m) => m[0]).join("")}</dl>` : "";
  const quoteLink = rail.inner.match(/href=['"](\/en-za\/request-a-quote\/\?product=[^'"]+)['"]/i)?.[1] || "/en-za/request-a-quote/";
  const h1 = copy.inner.match(/<h1\b[^>]*>[\s\S]*?<\/h1>/i)?.[0] || "";
  const summary = copy.inner.match(/<\/h1>\s*<p>([\s\S]*?)<\/p>/i)?.[1] || "";
  const sentence = summary.match(/^.*?[.!?](?=\s|$)/)?.[0] || summary;
  const label = family ? `<a class="za-family" href="${family[1]}">${family[2]} ${icons("next", 15)}</a>` : "";
  const documents = `<section class="za-documents"><h2>Documents and drawings</h2><p>Request documentation for the selected equipment and site conditions.</p><div class="za-link-rows"><a href="/en-za/downloads/">${icons("docs", 22)}<span>Download Centre</span>${icons("next")}</a><a href="/en-za/technical-support/">${icons("install", 22)}<span>Technical support</span>${icons("next")}</a><a href="${quoteLink}">${icons("specs", 22)}<span>Request model-specific documentation</span>${icons("next")}</a></div></section>`;
  const tabs = `<nav class="za-tabs" role="tablist" aria-label="Product information" hidden>${productTabs.map(([id, name, icon], i) =>
    `<button id="za-tab-${id}" type="button" role="tab" aria-selected="${i === 0}" aria-controls="za-panel-${id}" tabindex="${i === 0 ? 0 : -1}">${icons(icon, 17)}${escape(name)}</button>`).join("")}</nav>`;
  const panels = productTabs.map(([id, , , ids]) =>
    `<div class="za-tab-panel" id="za-panel-${id}" role="tabpanel" aria-labelledby="za-tab-${id}">${ids.map((key) => key === "specifications" ? specificationTable(keepSection(sections.get(key))) : keepSection(sections.get(key))).join("")}${id === "documents" ? documents : ""}</div>`).join("");
  const selection = sections.get("selection")?.inner.match(/<ul\b[^>]*class=['"]product-source-list['"][^>]*>([\s\S]*?)<\/ul>/i)?.[1] || "";
  const checklist = [...selection.matchAll(/<li\b[^>]*>[\s\S]*?<\/li>/gi)].slice(0, 3).map((m) => m[0]).join("");
  const quoteRail = `<aside class="za-project-rail">${icons("specs", 26)}<h2>Get a project-specific quote</h2><p>Share these details for a first review:</p>${checklist ? `<ul class="product-source-list">${checklist}</ul>` : ""}<a class="button primary" href="${quoteLink}">Send project details ${icons("next")}</a><a class="za-inline-link" href="#product-product-inquiry">Quick product enquiry</a><a class="za-inline-link" href="/en-za/contact/">Contact the team ${icons("next", 15)}</a></aside>`;
  const camera = gallery.inner.includes("data-gallery-main") ? `<figcaption>${icons("image", 16)} Product photography</figcaption>` : "";
  return `${main.slice(0, hero.start)}<div class="za-breadcrumb za-wrap">${crumb.full}</div>
    <section class="za-machine-hero"><div class="za-wrap za-machine-grid"><div class="za-machine-copy">${label}${h1}<p>${sentence}</p>
    <div class="za-actions"><a class="button primary" href="${quoteLink}">Request a quote ${icons("next", 17)}</a><a class="button za-spec-button" href="#product-specifications">${icons("specs", 19)} View specifications</a></div></div>
    <figure class="za-machine-photo">${gallery.inner}${camera}</figure></div></section>
    <div class="za-wrap za-product-content">${factsHtml}${tabs}<div class="za-detail-split"><div>${panels}</div>${quoteRail}</div>
    <details class="za-quick-enquiry" data-za-enquiry><summary>${icons("specs")} Quick product enquiry</summary>${keepSection(sections.get("product-inquiry"))}</details>
    <div class="za-related">${keepSection(sections.get("related-products"))}</div></div>${main.slice(detail.end)}`;
}

const illustrations = {
  mining: "/assets/images/application/mining-conveyor-tramp-iron-protection.webp",
  coal: "/assets/images/application/coal-wash-plant-wet-magnetic-separation.webp",
  recycling: "/assets/images/application/recycling-eddy-current-metal-recovery.webp",
  filter: "/assets/images/application/process-pipeline-magnetic-filtration.webp",
  cement: "/assets/images/south-africa-guidance/cement-aggregates.webp",
  minerals: "/assets/images/south-africa-guidance/mining-beneficiation.webp",
  catalogue: "/assets/images/hero-mining-conveyor-magnet.webp"
};

function heroImage(path, main) {
  if (path === "/en-za/products/") return illustrations.catalogue;
  if (path.startsWith("/en-za/products/")) return main.match(/<img\b[^>]*src=['"](\/assets\/images\/source-products\/[^'"]+)['"]/i)?.[1] || illustrations.catalogue;
  if (!/^\/en-za\/(industries|solutions|markets)\//.test(path)) return "";
  if (/coal/.test(path)) return illustrations.coal;
  if (/recycling|non-ferrous/.test(path)) return illustrations.recycling;
  if (/food|powder|filter/.test(path)) return illustrations.filter;
  if (/cement|aggregate|quarr/.test(path)) return illustrations.cement;
  return /chrome|manganese|ore|mineral|markets/.test(path) ? illustrations.minerals : illustrations.mining;
}

function regularLayout(main, path, type) {
  const hero = findElement(main, "section", /<section\b[^>]*class=['"][^'"]*\b(?:page-hero|product-discovery-hero|product-category-hero|industrial-hub-hero)\b[^'"]*['"][^>]*>/i);
  if (!hero) return main;
  const crumb = findElement(hero.inner, "nav", /<nav\b[^>]*class=['"][^'"]*\bbreadcrumbs\b[^'"]*['"][^>]*>/i);
  let intro = crumb ? hero.inner.slice(0, crumb.start) + hero.inner.slice(crumb.end) : hero.inner;
  const originalFigure = findElement(intro, "figure", /<figure\b[^>]*>/i);
  const originalGrid = findElement(intro, "div", /<div\b[^>]*class=['"]product-category-hero-grid['"][^>]*>/i);
  if (originalFigure && originalGrid) {
    const categoryCopy = findElement(originalGrid.inner, "div", /<div\b[^>]*>/i);
    if (categoryCopy) intro = categoryCopy.inner;
  }
  const image = originalFigure ? "" : heroImage(path, main);
  const light = ["editorial", "article", "enquiry", "utility", "legal"].includes(type);
  const img = originalFigure?.full || (image ? `<img class="za-hero-image" src="${escape(image)}" alt="" decoding="async">` : "");
  let rest = main.slice(hero.end);
  if (type === "catalogue") {
    const catalogue = findElement(rest, "section", /<section\b[^>]*\bdata-product-catalogue\b[^>]*>/i);
    const families = findElement(rest, "section", /<section\b[^>]*class=['"][^'"]*\bproduct-family-index\b[^'"]*['"][^>]*>/i);
    if (catalogue && families && families.end <= catalogue.start) {
      rest = catalogue.full + rest.slice(0, families.start) +
        `<details class="za-family-index" id="product-families"><summary>${icons("overview")} Browse by equipment family</summary>${families.full.replace(/\sid=['"]product-families['"]/i, "")}</details>` +
        rest.slice(families.end, catalogue.start) + rest.slice(catalogue.end);
    }
  }
  if (type === "editorial") {
    const next = path.includes("/news/") ? ["/en-za/blog/", "Browse Blog"] : ["/en-za/news/", "Browse News"];
    rest = rest.replace(/data-page-size=['"]12['"]/g, 'data-page-size="9"')
      .replace(/(<div\b[^>]*class=['"][^'"]*\beditorial-index-intro\b[^'"]*['"][^>]*>)/i, `$1<a class="za-editorial-crosslink" href="${next[0]}">${next[1]} ${icons("next", 16)}</a>`);
  }
  if (type === "enquiry" && path === "/en-za/request-a-quote/") {
    const form = findElement(rest, "form", /<form\b[^>]*\bdata-quote-form\b[^>]*>/i);
    if (form) {
      const contact = `<aside class="za-enquiry-guide"><h2>Prepare your enquiry</h2><p>Tell us about your material, equipment needs and installation site.</p><div class="za-link-rows"><a href="mailto:info@cowinmagnet.com">${icons("email", 22)}<span><strong>Email</strong><br>info@cowinmagnet.com</span></a><a href="https://wa.me/8615665135205">${icons("phone", 22)}<span><strong>WhatsApp</strong><br>+86 156 6513 5205</span></a><a href="/en-za/contact/#company-location">${icons("location", 22)}<span>Company location</span>${icons("next")}</a></div></aside>`;
      rest = rest.slice(0, form.start) + `<div class="za-enquiry-grid">${contact}<div class="za-form-shell"><h2>Project information</h2>${form.full}</div></div>` + rest.slice(form.end);
    }
  }
  const unavailable = type === "utility" && path === "/en-za/404/" ? '<span class="za-error-number" aria-hidden="true">404</span>' : "";
  return main.slice(0, hero.start) + (crumb ? `<div class="za-breadcrumb za-wrap">${crumb.full}</div>` : "") +
    `<section class="za-intro${light ? " za-intro-light" : ""}"><div class="za-wrap za-intro-grid${img ? " za-intro-media" : ""}"><div>${unavailable}${intro}</div>${img}</div></section>` + rest;
}

function innerHeader(html) {
  const header = findElement(html, "header", /<header\b[^>]*class=['"][^'"]*\bsite-header\b[^'"]*['"][^>]*>/i);
  if (!header) return html;
  const menuIcon = icons("menu", 22) + '<span class="za-sr">Menu</span>';
  let body = header.inner;
  if (/\bdata-mobile-toggle\b/.test(body)) {
    body = body.replace(/(<button\b[^>]*\bdata-mobile-toggle\b[^>]*>)[\s\S]*?<\/button>/i, `$1${menuIcon}</button>`);
  } else {
    const desktop = findElement(body, "nav", /<nav\b[^>]*class=['"][^'"]*\bdesktop-nav\b[^'"]*['"][^>]*>/i);
    const actions = findElement(body, "div", /<div\b[^>]*class=['"][^'"]*\bheader-actions\b[^'"]*['"][^>]*>/i);
    if (desktop && actions) {
      body = body.slice(0, actions.end - actions.close.length) +
        `<button class="mobile-toggle" type="button" aria-expanded="false" aria-controls="za-mobile-panel" data-mobile-toggle>${menuIcon}</button>` +
        body.slice(actions.end - actions.close.length) +
        `<div class="nav-backdrop" data-nav-backdrop></div><nav class="mobile-panel za-simple-mobile-links" id="za-mobile-panel" aria-label="Mobile navigation" data-mobile-panel hidden>${desktop.inner}</nav>`;
    }
  }
  return html.slice(0, header.start) + header.open + body + header.close + html.slice(header.end);
}

export function withZaInnerLayout(html, path) {
  if (!/^\/en-za\/[^.]+\/$/.test(path)) return html;
  const main = findElement(html, "main", /<main\b[^>]*>/i);
  if (!main) return html;
  const [, , section, slug] = path.split("/");
  let type = section;
  const product = section === "products" && slug ? productLayout(main.inner, path) : null;
  if (product) type = "product";
  else if (section === "products") type = "catalogue";
  else if (section === "news" || section === "blog") type = slug ? "article" : "editorial";
  else if (["contact", "request-a-quote"].includes(section)) type = "enquiry";
  else if (["search", "404"].includes(section)) type = "utility";
  else if (["privacy-policy", "cookie-policy", "terms-and-conditions"].includes(section)) type = "legal";
  else if (["technical-support", "downloads"].includes(section)) type = "resources";
  const transformed = product ?? regularLayout(main.inner, path, type);
  return innerHeader(html.slice(0, main.start) + main.open + transformed + main.close + html.slice(main.end))
    .replace(/<body\b/i, `<body data-za-inner="${escape(type)}"`)
    .replace(/<\/head>/i, `<link rel="stylesheet" href="${asset}.css"></head>`)
    .replace(/<\/body>/i, `<script defer src="${asset}.js"></script></body>`);
}
