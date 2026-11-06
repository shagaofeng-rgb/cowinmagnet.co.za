const PAGE_SIZE = 12;
const PATH = "/en-za/products/";
const filterNames = ["q", "category", "type", "cleaning", "application"];
const escape = (value) => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));

export function catalogueFilters(params = new URLSearchParams()) {
  return Object.fromEntries(filterNames.map((name) => [name, (params.get(name) || "").trim().slice(0, 100)]).filter(([, value]) => value));
}

export function renderCataloguePage(html, params) {
  // The generator emits the cards as a contiguous run of flat articles. Leave
  // future templates alone if that structure changes.
  const grid = /(<div\b[^>]*\bdata-page-collection\b[^>]*\bdata-page-param=['"]productsPage['"][^>]*>)([\s\S]*?)(<\/div>\s*<\/section>)/i.exec(html);
  if (!grid) return { html };
  const cards = [...grid[2].matchAll(/<article\b[^>]*\bdata-product-card\b[^>]*>[\s\S]*?<\/article>/gi)];
  if (!cards.length || cards.map(([card]) => card).join("") !== grid[2].trim()) return { html };
  const filters = catalogueFilters(params);
  const matches = cards.filter(([card]) => {
    const tag = card.slice(0, card.indexOf(">") + 1);
    const valueOf = (name) => tag.match(new RegExp(`data-${name}=['"]([^'"]*)`))?.[1] || "";
    return Object.entries(filters).every(([name, value]) => {
      if (name === "q") {
        return card.replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").toLowerCase().includes(value.toLowerCase());
      }
      return name === "application" ? valueOf(name).includes(value) : valueOf(name) === value;
    });
  });
  const pages = Math.max(1, Math.ceil(matches.length / PAGE_SIZE));
  const rawPage = params?.get("productsPage");
  const page = /^\d+$/.test(rawPage || "") ? Math.max(1, Math.min(pages, Number(rawPage))) : 1;
  const start = (page - 1) * PAGE_SIZE;
  const href = (number) => {
    const query = new URLSearchParams(filters);
    if (number > 1) query.set("productsPage", String(number));
    return escape(PATH + (query.size ? `?${query}` : "") + "#catalogue");
  };
  const canonical = page > 1 ? `https://cowinmagnet.co.za${PATH}?productsPage=${page}` : "";
  const pager = matches.length ? `<nav class="content-page-controls" aria-label="Product catalogue pages">
    ${page > 1 ? `<a class="button secondary" href="${href(1)}">First page</a><a class="button secondary" rel="prev" href="${href(page - 1)}">Previous</a>` : ""}
    <span>${start + 1}–${Math.min(start + PAGE_SIZE, matches.length)} of ${matches.length} · Page ${page} of ${pages}</span>
    ${page < pages ? `<a class="button secondary" rel="next" href="${href(page + 1)}">Next</a>` : ""}
  </nav>` : "";
  const cardsHtml = matches.slice(start, start + PAGE_SIZE).map(([card]) => card).join("");
  const output = html.replace(grid[0], () => `<div class="product-discovery-grid">${cardsHtml}</div>${pager}</section>`)
    .replace(/(<section\b[^>]*\bdata-product-catalogue\b)([^>]*>)/i, (tag, start, end) => /\bid=/.test(tag) ? tag : `${start} id="catalogue"${end}`)
    .replace(/(<span\b[^>]*data-product-match-count[^>]*>)\d+/i, (_, tag) => tag + matches.length)
    .replace(/(<[^>]*\bdata-product-empty\b[^>]*?)\s+hidden\b/i, (tag, start) => matches.length ? tag : start)
    .replace(/<form\b[^>]*\bdata-product-filter\b[^>]*>[\s\S]*?<\/form>/i, (form) => form
      .replace(/\bdata-product-filter\b/, `method="get" action="${PATH}#catalogue"`)
      .replace(/<input\b[^>]*\bname=['"]q['"][^>]*>/i, (tag) => `${tag.slice(0, -1)} value="${escape(filters.q || "")}">`)
      .replace(/<select\b[^>]*\bname=['"]([^'"]+)['"][^>]*>[\s\S]*?<\/select>/gi, (select, name) => select
        .replace(/(<option\b[^>]*\bvalue=['"]([^'"]*)['"][^>]*)(>)/gi, (tag, start, value, end) => filters[name] === value ? `${start} selected${end}` : tag))
      .replace(/<button type=['"]reset['"][^>]*>[\s\S]*?<\/button>/i, `<div class="catalogue-filter-actions"><button class="button primary" type="submit">Apply filters</button><a href="${PATH}#catalogue">Clear filters</a></div>`));
  return { html: output, canonical: Object.keys(filters).length ? "" : canonical };
}
