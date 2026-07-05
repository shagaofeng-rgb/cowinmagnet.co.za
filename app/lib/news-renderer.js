import { escapeHtml, isExternalNewsImage, readDataJson } from "./news-system.js";

const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || process.env.APP_URL || "https://cowinmagnet.co.za").replace(/\/$/, "");

function newsImageUrl(value) {
  if (String(value || "").startsWith("/assets/images/news/")) return `${siteUrl}${value}`;
  if (isExternalNewsImage(value)) return value;
  return `${siteUrl}/assets/images/hero-mining-conveyor-magnet.webp`;
}

function isPublishedSourceNews(item) {
  return (
    (item.status || "published") === "published" &&
    (item.article_type === "news" || item.source_url || item.canonical_source_url) &&
    isExternalNewsImage(item.cover_image_url)
  );
}

function pageShell({ title, description, canonical, body, schema = [], feed = true, image = "" }) {
  const schemaJson = JSON.stringify({ "@context": "https://schema.org", "@graph": schema });
  const ogImage = newsImageUrl(image);
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
  ${feed ? `<link rel="alternate" type="application/rss+xml" title="Cowinmagnet South Africa News" href="${siteUrl}/en-za/news/feed.xml">` : ""}
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:type" content="article">
  <meta property="og:url" content="${siteUrl}${canonical}">
  <meta property="og:image" content="${escapeHtml(ogImage)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:image" content="${escapeHtml(ogImage)}">
  <link rel="stylesheet" href="/assets/site.css">
  <script type="application/ld+json">${schemaJson}</script>
</head>
<body>
  <header class="site-header">
    <a class="brand" href="/en-za/"><img class="brand-logo" src="/assets/images/cowinmagnet-logo.jpg" alt="Cowinmagnet logo"><span><strong>Cowinmagnet</strong><small>South Africa</small></span></a>
    <nav class="desktop-nav" aria-label="Primary navigation">
      <a href="/en-za/products/">Products</a>
      <a href="/en-za/industries/">Industries</a>
      <a class="active" href="/en-za/news/">News</a>
      <a href="/en-za/solutions/">Solutions</a>
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

function articleDate(item) {
  return item.published_at || item.date || item.created_at || "";
}

function articleUrl(item) {
  return `/en-za/news/${item.slug}/`;
}

function productCard(item) {
  return `<a class="card product-card" href="${item.url || `/en-za/products/${item.categorySlug}/${item.slug}/`}">
    <img src="${escapeHtml(item.image || "/assets/images/hero-mining-conveyor-magnet.webp")}" alt="${escapeHtml(item.name)}">
    <p class="eyebrow">${escapeHtml(item.category || "Related Product")}</p>
    <h3>${escapeHtml(item.name)}</h3>
    <p>${escapeHtml(item.relationship_reason || "Related Cowin Magnet product for this application.")}</p>
    <span class="button secondary">View Product</span>
  </a>`;
}

export async function renderNewsList() {
  const articles = (await readDataJson("data/articles/articles.json", [])).filter(isPublishedSourceNews);
  const body = `<section class="page-hero">
    <nav class="breadcrumbs"><a href="/en-za/">Home</a> / News</nav>
    <p class="eyebrow">News</p>
    <h1>Cowinmagnet South Africa News</h1>
    <p>Recent industry news, source-based analysis and magnetic separation equipment perspectives for African mining, quarrying, cement, coal and recycling buyers.</p>
  </section>
  <section class="section">
    <form class="filter-panel">
      <label>Search news<input data-site-search type="search" placeholder="mining, conveyor, recycling, cement"></label>
      <label>Category<select><option>All</option><option>Mining</option><option>Coal Handling</option><option>Cement and Aggregates</option><option>Recycling</option></select></label>
      <a class="button secondary" href="/en-za/news/feed.xml">RSS Feed</a>
    </form>
    <div class="grid">${articles
      .map((item) => `<a class="card news-card" href="${articleUrl(item)}">
        <img src="${escapeHtml(item.cover_image_url)}" alt="${escapeHtml(item.cover_image_alt || item.title)}">
        <p class="eyebrow">${escapeHtml((articleDate(item) || "").slice(0, 10))} · ${escapeHtml(item.category || "News")}</p>
        <h3>${escapeHtml(item.title)}</h3>
        <p>${escapeHtml(item.excerpt || item.summary || "")}</p>
        <span class="tag">${escapeHtml(item.source_publisher || "Source-based")}</span>
      </a>`)
      .join("")}</div>
  </section>`;
  return pageShell({
    title: "News | Cowinmagnet South Africa",
    description: "Source-based industry news and Cowin Magnet analysis for African mining, quarrying, cement, coal and recycling buyers.",
    canonical: "/en-za/news/",
    body,
    image: articles[0]?.cover_image_url,
    schema: [
      { "@type": "Organization", name: "Cowinmagnet", url: "https://www.cowinmagnet.com" },
      { "@type": "CollectionPage", name: "Cowinmagnet South Africa News", url: `${siteUrl}/en-za/news/` }
    ]
  });
}

export async function renderNewsArticle(slug) {
  const articles = await readDataJson("data/articles/articles.json", []);
  const item = articles.find((article) => article.slug === slug && isPublishedSourceNews(article));
  if (!item) return null;
  const products = item.related_products || [];
  const canonical = articleUrl(item);
  const sourceDate = item.source_published_at ? new Date(item.source_published_at).toISOString() : "";
  const body = `<section class="page-hero">
    <nav class="breadcrumbs"><a href="/en-za/">Home</a> / <a href="/en-za/news/">News</a> / ${escapeHtml(item.title)}</nav>
    <p class="eyebrow">${escapeHtml(item.category || "News")}</p>
    <h1>${escapeHtml(item.title)}</h1>
    <p>${escapeHtml(item.excerpt || item.summary || "")}</p>
  </section>
  <section class="section layout">
    <article class="panel">
      <p><strong>Published:</strong> ${escapeHtml((articleDate(item) || "").slice(0, 10))} · <strong>Updated:</strong> ${escapeHtml((item.updated_at || "").slice(0, 10))} · <strong>Author:</strong> ${escapeHtml(item.author_name || "Cowin Magnet South Africa")}</p>
      <img src="${escapeHtml(item.cover_image_url)}" alt="${escapeHtml(item.cover_image_alt || item.title)}">
      <section class="ai-summary"><h2>Key Takeaways</h2><ul>${(item.key_takeaways || []).map((takeaway) => `<li>${escapeHtml(takeaway)}</li>`).join("")}</ul></section>
      ${item.content || ""}
      <h2>Original Source</h2>
      <ul class="check-list">
        <li><strong>Original title:</strong> ${escapeHtml(item.source_title || "")}</li>
        <li><strong>Publisher:</strong> ${escapeHtml(item.source_publisher || "")}</li>
        <li><strong>Author:</strong> ${escapeHtml(item.source_author || "Not specified by source")}</li>
        <li><strong>Original publication time:</strong> ${escapeHtml(sourceDate)}</li>
        <li><strong>Collected by this site:</strong> ${escapeHtml(item.source_fetched_at || "")}</li>
        <li><a href="${escapeHtml(item.source_url || item.sourceUrl || "#")}" rel="nofollow noopener noreferrer" target="_blank">Read the original source</a></li>
      </ul>
      <p><em>This article is based on public source information and independent analysis. Original reporting copyright belongs to the original publisher.</em></p>
    </article>
    <aside class="panel">
      <h2>Related Products</h2>
      <div class="grid compact">${products.map(productCard).join("") || "<p>Related products will be confirmed after application review.</p>"}</div>
      <a class="button primary" href="/en-za/request-a-quote/">Send Operating Data</a>
    </aside>
  </section>`;
  return pageShell({
    title: item.seo_title || item.seoTitle || `${item.title} | Cowinmagnet News`,
    description: item.seo_description || item.seoDescription || item.excerpt || item.summary || "",
    canonical,
    body,
    image: item.cover_image_url,
    schema: [
      { "@type": "Organization", name: "Cowinmagnet", url: "https://www.cowinmagnet.com" },
      {
        "@type": "NewsArticle",
        headline: item.title,
        description: item.excerpt || item.summary,
        image: newsImageUrl(item.cover_image_url),
        datePublished: item.published_at || item.date,
        dateModified: item.updated_at || item.published_at || item.date,
        author: { "@type": "Organization", name: item.author_name || "Cowin Magnet South Africa" },
        publisher: { "@type": "Organization", name: "Cowin Magnet South Africa" },
        mainEntityOfPage: `${siteUrl}${canonical}`,
        articleSection: item.category || "News",
        keywords: item.secondary_keywords || item.tags || [],
        about: products.map((product) => product.name),
        mentions: products.map((product) => ({ "@type": "Product", name: product.name, url: `${siteUrl}${product.url}` }))
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: `${siteUrl}/en-za/` },
          { "@type": "ListItem", position: 2, name: "News", item: `${siteUrl}/en-za/news/` },
          { "@type": "ListItem", position: 3, name: item.title, item: `${siteUrl}${canonical}` }
        ]
      }
    ]
  });
}

export async function renderNewsFeed() {
  const articles = (await readDataJson("data/articles/articles.json", [])).filter(isPublishedSourceNews).slice(0, 30);
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Cowinmagnet South Africa News</title>
    <link>${siteUrl}/en-za/news/</link>
    <description>Source-based magnetic separation industry news and Cowin Magnet analysis.</description>
    ${articles
      .map((item) => `<item>
        <title>${escapeHtml(item.title)}</title>
        <link>${siteUrl}${articleUrl(item)}</link>
        <guid>${siteUrl}${articleUrl(item)}</guid>
        <pubDate>${new Date(articleDate(item) || Date.now()).toUTCString()}</pubDate>
        <description>${escapeHtml(item.excerpt || item.summary || "")}</description>
      </item>`)
      .join("")}
  </channel>
</rss>`;
}
