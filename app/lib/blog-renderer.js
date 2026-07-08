import { escapeHtml, isPublishedBlogArticle, readDataJson } from "./news-system.js";

const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || process.env.APP_URL || "https://cowinmagnet.co.za").replace(/\/$/, "");

function blogArticles(items) {
  return items
    .filter(isPublishedBlogArticle)
    .sort((a, b) => String(b.published_at || b.date || "").localeCompare(String(a.published_at || a.date || "")));
}

function absoluteImage(value) {
  if (/^https?:\/\//i.test(String(value || ""))) return String(value);
  return `${siteUrl}${value || ""}`;
}

function pageShell({ title, description, canonical, body, schema = [], image = "" }) {
  const ogImage = absoluteImage(image);
  return `<!doctype html>
<html lang="en-ZA">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="index,follow">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <link rel="canonical" href="${siteUrl}${canonical}">
  <link rel="alternate" hreflang="en-ZA" href="${siteUrl}${canonical}">
  <link rel="alternate" hreflang="x-default" href="${siteUrl}${canonical}">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:type" content="article">
  <meta property="og:url" content="${siteUrl}${canonical}">
  <meta property="og:image" content="${escapeHtml(ogImage)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:image" content="${escapeHtml(ogImage)}">
  <link rel="stylesheet" href="/assets/site.css">
  <script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@graph": schema })}</script>
</head>
<body>
  <header class="site-header">
    <a class="brand" href="/en-za/"><img class="brand-logo" src="/assets/images/cowinmagnet-logo.jpg" alt="Cowinmagnet logo"><span><strong>Cowinmagnet</strong><small>South Africa</small></span></a>
    <nav class="desktop-nav" aria-label="Primary navigation">
      <a href="/en-za/products/">Products</a>
      <a href="/en-za/industries/">Industries</a>
      <a class="active" href="/en-za/blog/">Blog</a>
      <a href="/en-za/news/">News</a>
      <a href="/en-za/contact/">Contact</a>
    </nav>
    <div class="header-actions"><a class="button quote-link" href="/en-za/request-a-quote/">Request a Quote</a></div>
  </header>
  <main>${body}</main>
  <footer class="footer">
    <section class="footer-main simple">
      <div class="footer-brand"><a class="brand" href="/en-za/"><img class="brand-logo" src="/assets/images/cowinmagnet-logo.jpg" alt="Cowinmagnet logo"><span><strong>Cowinmagnet</strong><small>South Africa</small></span></a><p>Magnetic separation equipment support for African mining and industrial projects.</p></div>
      <div class="footer-contact"><a href="mailto:davidsha@cowinmagnet.com">davidsha@cowinmagnet.com</a><a href="https://wa.me/8615665135205">WhatsApp: +86 156 6513 5205</a><a class="button primary" href="/en-za/request-a-quote/">Request a Quote</a></div>
    </section>
  </footer>
  <script src="/assets/site.js"></script>
</body>
</html>`;
}

function articleUrl(item) {
  return `/en-za/blog/${item.slug}/`;
}

function productCard(product) {
  return `<a class="card product-card" href="${product.url}">
    <img src="${escapeHtml(product.image || "/assets/images/hero-mining-conveyor-magnet.webp")}" alt="${escapeHtml(product.name)}">
    <p class="eyebrow">${escapeHtml(product.category || "Related Product")}</p>
    <h3>${escapeHtml(product.name)}</h3>
    <p>${escapeHtml(product.relationship_reason || "Relevant Cowin Magnet product for this application.")}</p>
    <span class="button secondary">View Product</span>
  </a>`;
}

export async function renderBlogList() {
  const articles = blogArticles(await readDataJson("data/articles/articles.json", []));
  const body = `<section class="page-hero">
    <nav class="breadcrumbs"><a href="/en-za/">Home</a> / Blog</nav>
    <p class="eyebrow">Blog</p>
    <h1>Cowinmagnet South Africa Blog</h1>
    <p>SEO guides for African mining, quarrying, cement, coal, recycling and conveyor tramp metal removal buyers.</p>
  </section>
  <section class="section">
    <form class="filter-panel"><label>Search blog<input data-site-search type="search" placeholder="overband, crusher, conveyor, coal"></label></form>
    <div class="grid">${articles
      .map((item) => `<a class="card news-card" href="${articleUrl(item)}">
        <img src="${escapeHtml(item.cover_image_url)}" alt="${escapeHtml(item.cover_image_alt || item.title)}">
        <p class="eyebrow">${escapeHtml((item.published_at || item.date || "").slice(0, 10))} - ${escapeHtml(item.category || "Selection Guide")}</p>
        <h3>${escapeHtml(item.title)}</h3>
        <p>${escapeHtml(item.excerpt || item.summary || "")}</p>
        <span class="tag">${escapeHtml(item.primary_keyword || "magnetic separator")}</span>
      </a>`)
      .join("")}</div>
  </section>`;
  return pageShell({
    title: "Blog | Cowinmagnet South Africa",
    description: "Practical magnetic separator selection guides for African mining, quarrying, cement, coal and recycling buyers.",
    canonical: "/en-za/blog/",
    image: articles[0]?.cover_image_url,
    body,
    schema: [
      { "@type": "Organization", name: "Cowinmagnet", url: "https://www.cowinmagnet.com" },
      { "@type": "CollectionPage", name: "Cowinmagnet South Africa Blog", url: `${siteUrl}/en-za/blog/` }
    ]
  });
}

export async function renderBlogArticle(slug) {
  const articles = blogArticles(await readDataJson("data/articles/articles.json", []));
  const item = articles.find((article) => article.slug === slug);
  if (!item) return null;
  const canonical = articleUrl(item);
  const products = item.related_products || [];
  const body = `<section class="page-hero">
    <nav class="breadcrumbs"><a href="/en-za/">Home</a> / <a href="/en-za/blog/">Blog</a> / ${escapeHtml(item.title)}</nav>
    <p class="eyebrow">${escapeHtml(item.category || "Selection Guide")}</p>
    <h1>${escapeHtml(item.title)}</h1>
    <p>${escapeHtml(item.excerpt || item.summary || "")}</p>
  </section>
  <section class="section layout">
    <article class="panel">
      <p><strong>Published:</strong> ${escapeHtml((item.published_at || item.date || "").slice(0, 10))} - <strong>Updated:</strong> ${escapeHtml((item.updated_at || "").slice(0, 10))} - <strong>Author:</strong> ${escapeHtml(item.author_name || "Cowin Magnet South Africa")}</p>
      <img src="${escapeHtml(item.cover_image_url)}" alt="${escapeHtml(item.cover_image_alt || item.title)}">
      ${item.content || ""}
    </article>
    <aside class="panel">
      <h2>Related Products</h2>
      <div class="grid compact">${products.map(productCard).join("")}</div>
      <a class="button primary" href="/en-za/request-a-quote/">Request Selection Advice</a>
    </aside>
  </section>`;
  return pageShell({
    title: item.seo_title || item.seoTitle || item.title,
    description: item.seo_description || item.seoDescription || item.excerpt || item.summary || "",
    canonical,
    image: item.cover_image_url,
    body,
    schema: [
      { "@type": "Organization", name: "Cowinmagnet", url: "https://www.cowinmagnet.com" },
      {
        "@type": "Article",
        headline: item.title,
        description: item.excerpt || item.summary,
        image: absoluteImage(item.cover_image_url),
        datePublished: item.published_at || item.date,
        dateModified: item.updated_at || item.published_at || item.date,
        author: { "@type": "Organization", name: item.author_name || "Cowin Magnet South Africa" },
        publisher: { "@type": "Organization", name: "Cowin Magnet South Africa" },
        mainEntityOfPage: `${siteUrl}${canonical}`,
        articleSection: item.category || "Selection Guide",
        keywords: item.secondary_keywords || item.tags || [],
        about: products.map((product) => product.name),
        mentions: products.map((product) => ({ "@type": "Product", name: product.name, url: `${siteUrl}${product.url}` }))
      },
      item.faq_schema,
      item.breadcrumb_schema
    ].filter(Boolean)
  });
}

export async function renderBlogFeed() {
  const articles = blogArticles(await readDataJson("data/articles/articles.json", [])).slice(0, 30);
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Cowinmagnet South Africa Blog</title>
    <link>${siteUrl}/en-za/blog/</link>
    <description>Magnetic separator selection guides for African industrial buyers.</description>
    ${articles
      .map((item) => `<item>
        <title>${escapeHtml(item.title)}</title>
        <link>${siteUrl}${articleUrl(item)}</link>
        <guid>${siteUrl}${articleUrl(item)}</guid>
        <pubDate>${new Date(item.published_at || item.date || Date.now()).toUTCString()}</pubDate>
        <description>${escapeHtml(item.excerpt || item.summary || "")}</description>
      </item>`)
      .join("")}
  </channel>
</rss>`;
}


