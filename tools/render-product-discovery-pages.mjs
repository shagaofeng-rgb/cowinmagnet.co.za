import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { buildTruthCard, escapeHtml, plainText, productKind } from "./product-detail-lib.mjs";

const root = process.cwd();
const siteUrl = "https://cowinmagnet.co.za";
const products = JSON.parse((await readFile(join(root, "data/products/products.json"), "utf8")).replace(/^\uFEFF/, ""));
const categories = [
  { slug: "suspended-and-self-unloading-iron-removers", title: "Suspended & Self-Unloading Iron Removers", image: "/assets/images/application/mining-conveyor-tramp-iron-protection.webp", alt: "Illustrative mining conveyor tramp-iron protection context", intro: "Suspended, manual-cleaning and self-cleaning equipment for defined conveyor protection and ferrous-contamination removal duties." },
  { slug: "magnetic-separation-equipment", title: "Magnetic Separation Equipment", image: "/assets/images/application/coal-wash-plant-wet-magnetic-separation.webp", alt: "Illustrative wet magnetic separation process in a wash-plant environment", intro: "Magnetic separation equipment for mineral processing, ore preparation, recovery and defined material-stream duties." },
  { slug: "metal-detection-and-recycling-sorting", title: "Metal Detection & Recycling Sorting", image: "/assets/images/application/recycling-eddy-current-metal-recovery.webp", alt: "Illustrative recycling and non-ferrous metal recovery process", intro: "Detection, magnetic pre-separation and non-ferrous sorting equipment for controlled feed and recovery workflows." },
  { slug: "magnetic-components-and-filters", title: "Magnetic Components & Filters", image: "/assets/images/application/process-pipeline-magnetic-filtration.webp", alt: "Illustrative magnetic filtration context for a process flow", intro: "Magnetic rods, grids, traps, drawer units and other components for defined chutes, pipelines and process flows." },
  { slug: "industry-application-equipment", title: "Industry Application Equipment", image: "/assets/images/application/mineral-screening-control-environment.webp", alt: "Illustrative mineral screening and equipment-support environment", intro: "Supporting equipment and industrial interfaces selected around the actual operating conditions and integration requirements." }
];

const productFamilies = [
  {
    title: "Conveyor Iron Removal",
    description: "Suspended magnets, self-cleaning iron removers and conveyor magnetic equipment for defined protection points.",
    categorySlugs: ["suspended-and-self-unloading-iron-removers"],
    href: "/en-za/products/suspended-and-self-unloading-iron-removers/"
  },
  {
    title: "Mineral Processing",
    description: "Wet, dry and high-gradient magnetic separation equipment for ore preparation, recovery and mineral streams.",
    categorySlugs: ["magnetic-separation-equipment"],
    href: "/en-za/products/magnetic-separation-equipment/"
  },
  {
    title: "Recycling & Detection",
    description: "Metal detection, magnetic pre-separation and non-ferrous recovery equipment for controlled material flows.",
    categorySlugs: ["metal-detection-and-recycling-sorting", "industry-application-equipment"],
    href: "/en-za/products/metal-detection-and-recycling-sorting/"
  },
  {
    title: "Magnetic Filters & Components",
    description: "Magnetic grids, drawer units, rods, traps and process-flow components for contamination control.",
    categorySlugs: ["magnetic-components-and-filters"],
    href: "/en-za/products/magnetic-components-and-filters/"
  }
];

function replaceMain(html, main) {
  return html.replace(/<main>[\s\S]*?<\/main>/i, main);
}

function setMeta(html, title, description, canonical, image) {
  return html
    .replace(/<title>[^<]*<\/title>/i, `<title>${escapeHtml(title)} | COWIN MAGNET South Africa</title>`)
    .replace(/<meta name="description" content="[^"]*">/i, `<meta name="description" content="${escapeHtml(description)}">`)
    .replace(/<link rel="canonical" href="[^"]*">/i, `<link rel="canonical" href="${siteUrl}${canonical}">`)
    .replace(/<meta property="og:title" content="[^"]*">/i, `<meta property="og:title" content="${escapeHtml(title)} | COWIN MAGNET South Africa">`)
    .replace(/<meta property="og:description" content="[^"]*">/i, `<meta property="og:description" content="${escapeHtml(description)}">`)
    .replace(/<meta property="og:url" content="[^"]*">/i, `<meta property="og:url" content="${siteUrl}${canonical}">`)
    .replace(/<meta property="og:image" content="[^"]*">/i, `<meta property="og:image" content="${siteUrl}${image}">`);
}

function card(product) {
  const truth = buildTruthCard(product);
  const summary = plainText(product.shortDescription || "").slice(0, 210);
  const applications = truth.applications.slice(0, 2).join(" ").toLowerCase();
  return `<article class='product-discovery-card' data-product-card data-category='${escapeHtml(product.categorySlug)}' data-type='${escapeHtml(productKind(product))}' data-cleaning='${escapeHtml(truth.cleaningMode)}' data-application='${escapeHtml(applications)}'><a class='product-card-image' href='${escapeHtml(product.canonicalUrl)}'><img src='${escapeHtml(product.image)}' alt='${escapeHtml(product.name)} product image' width='800' height='600' loading='lazy' decoding='async'></a><div class='product-card-content'><p class='eyebrow'>${escapeHtml(product.category)}</p><h2><a href='${escapeHtml(product.canonicalUrl)}'>${escapeHtml(product.name)}</a></h2><p>${escapeHtml(summary)}</p><div class='product-card-tags'><span>${escapeHtml(truth.productType)}</span><span>${escapeHtml(truth.cleaningMode.replaceAll("_", " "))}</span></div><div class='product-card-actions'><a class='text-link' href='${escapeHtml(product.canonicalUrl)}'>View Product</a><a class='text-link' href='/en-za/request-a-quote/?product=${encodeURIComponent(product.name)}'>Request a Quote</a></div></div></article>`;
}

function categoryCard(category) {
  const count = products.filter((product) => product.categorySlug === category.slug).length;
  return `<a class='product-category-card' href='/en-za/products/${category.slug}/'><img src='${category.image}' alt='${category.alt}' width='960' height='600' loading='lazy' decoding='async'><div><p class='eyebrow'>${count} products</p><h2>${category.title}</h2><p>${category.intro}</p><span class='text-link'>Explore category</span></div></a>`;
}

function filterPanel(includeCategory = true) {
  const categorySelect = includeCategory ? `<label>Product category<select name='category'><option value=''>All categories</option>${categories.map((category) => `<option value='${category.slug}'>${category.title}</option>`).join("")}</select></label>` : "";
  return `<form class='product-discovery-filter' data-product-filter aria-label='Filter products'><label>Keyword search<input name='q' type='search' placeholder='Search product name or process'></label>${categorySelect}<label>Equipment type<select name='type'><option value=''>All equipment types</option><option value='permanent_manual'>Permanent manual</option><option value='permanent_self_cleaning'>Permanent self-cleaning</option><option value='electromagnetic_manual'>Electromagnetic</option><option value='electromagnetic_self_cleaning'>Self-cleaning electromagnetic</option><option value='wet_magnetic'>Wet magnetic separation</option><option value='dry_magnetic'>Dry magnetic separation</option><option value='high_gradient'>Specialist mineral separation</option><option value='metal_detection'>Metal detection</option><option value='eddy_current'>Eddy-current separation</option><option value='filter'>Magnetic filtration</option></select></label><label>Cleaning method<select name='cleaning'><option value=''>Any cleaning method</option><option value='manual'>Manual</option><option value='self_cleaning'>Self-cleaning</option><option value='not_applicable'>Not applicable</option></select></label><label>Application<select name='application'><option value=''>All applications</option><option value='mining'>Mining and minerals</option><option value='coal'>Coal handling</option><option value='recycling'>Recycling</option><option value='bulk'>Bulk handling</option><option value='process'>Process filtration</option></select></label><button type='reset' class='product-filter-reset'>Clear all filters</button></form>`;
}

function totalPage() {
  const familySections = productFamilies.map((family) => {
    const familyProducts = products.filter((product) => family.categorySlugs.includes(product.categorySlug));
    return `<section class='product-family-section'><div class='product-discovery-heading'><p class='eyebrow'>Product family</p><h2>${escapeHtml(family.title)}</h2><p>${escapeHtml(family.description)}</p></div><div class='product-discovery-grid'>${familyProducts.slice(0, 6).map(card).join("")}</div><a class='family-view-all' href='${family.href}'>View ${escapeHtml(family.title)} <span aria-hidden='true'>&rarr;</span></a></section>`;
  }).join("");
  const cards = products.map(card).join("");
  return `<main><section class='product-discovery-hero'><nav class='breadcrumbs'><a href='/en-za/'>Home</a> / <span>Products</span></nav><div><p class='eyebrow'>Equipment catalogue</p><h1>Magnetic separation and metal-control equipment</h1><p>Explore COWIN MAGNET product families for South African and African mining, bulk handling, recycling and process projects. Start with the process duty, then review the actual material flow and operating conditions.</p><a class='button primary' href='#product-families'>Find the right equipment</a></div></section><section id='product-families' class='product-discovery-section product-family-index'><div class='product-discovery-heading'><p class='eyebrow'>Four product groups</p><h2>Start with the process duty</h2><p>Equipment is organised by its role in the material flow rather than by a long list of model numbers.</p></div><div class='product-family-tabs'>${productFamilies.map((family) => `<a href='${family.href}'>${escapeHtml(family.title)}</a>`).join("")}</div></section>${familySections}<section class='product-discovery-section product-discovery-catalogue'><div class='product-discovery-heading'><p class='eyebrow'>Full catalogue</p><h2>Search the current product range</h2><p><span data-product-match-count>${products.length}</span> products available to browse by process and configuration.</p></div>${filterPanel()}<p class='product-filter-empty' data-product-empty hidden>No products match the current filters. Clear one or more filters and try again.</p><details class='full-product-catalogue'><summary>Open the full product catalogue (${products.length} products)</summary><div class='product-discovery-grid'>${cards}</div></details></section><section class='product-selection-cta'><div><p class='eyebrow'>Selection support</p><h2>Not sure which separator fits your line?</h2><p>Prepare the material, target contamination or mineral, belt or pipe dimensions, feed condition, available installation space and operating environment. COWIN will review the right product family with you.</p></div><a class='button primary' href='/en-za/request-a-quote/'>Request a Quote</a></section></main>`;
}

function categoryPage(category) {
  const subset = products.filter((product) => product.categorySlug === category.slug);
  const configurations = category.slug === "magnetic-separation-equipment" ? ["Dry magnetic separation", "Wet magnetic separation", "High-gradient separation"] : category.slug === "suspended-and-self-unloading-iron-removers" ? ["Permanent", "Electromagnetic", "Manual cleaning", "Self-cleaning"] : category.slug === "magnetic-components-and-filters" ? ["Dry material flow", "Liquid or slurry flow", "Manual cleaning"] : ["Detection", "Ferrous removal", "Non-ferrous recovery"];
  return `<main><section class='product-category-hero'><nav class='breadcrumbs'><a href='/en-za/'>Home</a> / <a href='/en-za/products/'>Products</a> / <span>${escapeHtml(category.title)}</span></nav><div class='product-category-hero-grid'><div><p class='eyebrow'>Product category</p><h1>${escapeHtml(category.title)}</h1><p>${escapeHtml(category.intro)} COWIN MAGNET supports South African and African projects through product selection and export coordination, with final configuration confirmed for the requested process.</p><div class='product-hero-actions'><a class='button primary' href='/en-za/request-a-quote/'>Request a Quote</a><a class='button secondary' href='https://wa.me/8615665135205' target='_blank' rel='noopener noreferrer nofollow'>Talk to an Engineer</a></div></div><figure><img src='${category.image}' alt='${category.alt}' width='1200' height='750' fetchpriority='high' decoding='async'><figcaption>Illustrative process context, not a claimed local installation.</figcaption></figure></div></section><section class='product-discovery-section'><div class='product-discovery-heading'><p class='eyebrow'>Configuration review</p><h2>Which configuration do you need?</h2><p>Start with the variables that are genuinely relevant to this equipment group.</p></div><div class='category-configuration'>${configurations.map((label) => `<span>${escapeHtml(label)}</span>`).join("")}</div></section><section class='product-discovery-section'><div class='product-discovery-heading'><p class='eyebrow'>Equipment in this category</p><h2>Products for a defined process position</h2><p>Use product pages to check equipment role, required selection inputs and the information available for project review.</p></div>${filterPanel(false)}<p class='product-filter-empty' data-product-empty hidden>No products match the current filters.</p><div class='product-discovery-grid'>${subset.map(card).join("")}</div></section><section class='product-category-support'><article><p class='eyebrow'>Typical project questions</p><h2>What should be confirmed before selection?</h2><ul><li>Material, target contaminant or target mineral</li><li>Conveyor, chute, pipe or feed presentation</li><li>Available space, access and safety conditions</li><li>Power, dust, moisture, temperature and corrosion exposure where applicable</li></ul></article><article><p class='eyebrow'>Related pathways</p><h2>Continue the process review</h2><p>Explore applicable industries and solutions, then send the available process details with your inquiry.</p><a class='text-link' href='/en-za/industries/'>Explore industries</a><a class='text-link' href='/en-za/solutions/'>Explore solutions</a></article></section></main>`;
}

const totalPath = join(root, "en-za", "products", "index.html");
let totalHtml = await readFile(totalPath, "utf8");
totalHtml = setMeta(replaceMain(totalHtml, totalPage()), "Products", "Magnetic separation, iron-removal, metal-detection and recycling equipment for South African and African projects.", "/en-za/products/", categories[0].image);
await writeFile(totalPath, totalHtml);

for (const category of categories) {
  const path = join(root, "en-za", "products", category.slug, "index.html");
  let html = await readFile(path, "utf8");
  html = setMeta(replaceMain(html, categoryPage(category)), category.title, category.intro, `/en-za/products/${category.slug}/`, category.image);
  await writeFile(path, html);
}

console.log(`Rendered product discovery pages: 1 catalogue and ${categories.length} categories.`);
