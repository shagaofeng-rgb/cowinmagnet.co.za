import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { buildTruthCard, escapeHtml, metaDescription, plainText, productKind } from "./product-detail-lib.mjs";

const root = process.cwd();
const siteUrl = "https://cowinmagnet.co.za";
const products = JSON.parse((await readFile(join(root, "data/products/products.json"), "utf8")).replace(/^\uFEFF/, ""));

function list(items, className = "product-source-list") {
  return `<ul class='${className}'>${items.filter(Boolean).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function cards(items) {
  return `<div class='product-source-cards'>${items.filter((item) => item?.title || item?.description).map((item) => `<article><span>${escapeHtml(item.title)}</span><p>${escapeHtml(item.description)}</p></article>`).join("")}</div>`;
}

function section(id, eyebrow, title, introduction, body) {
  return `<section id='product-${id}' class='product-source-section'><div class='product-source-heading'><p class='eyebrow'>${escapeHtml(eyebrow)}</p><h2>${escapeHtml(title)}</h2>${introduction ? `<p class='product-section-intro'>${escapeHtml(introduction)}</p>` : ""}</div><div class='product-source-body'>${body}</div></section>`;
}

function overview(product, truth) {
  const source = plainText(product.shortDescription || product.sourceContent?.hero?.summary || "");
  const sentences = [
    source,
    `COWIN MAGNET supplies this ${truth.productType.toLowerCase()} for South African and African projects where the equipment must be matched to the real process rather than selected from a name alone.`,
    `The review starts with the material stream, installation position, available space and operating environment.`,
    `Final configuration, commercial availability and any numerical performance data are confirmed by COWIN engineering and the supplier for the requested project.`
  ].filter(Boolean);
  let output = sentences.join(" ");
  if (output.split(/\s+/).length < 100) output += ` Typical project discussions include ${truth.applications.slice(0, 3).join(", ").toLowerCase()}.`;
  const words = output.split(/\s+/).filter(Boolean);
  return words.length > 160 ? `${words.slice(0, 159).join(" ")}.` : output;
}

function heroSummary(product, truth) {
  const source = plainText(product.shortDescription || product.sourceContent?.hero?.summary || "");
  const selection = `Selected for ${truth.applications.slice(0, 2).join(" and ").toLowerCase()} where the final configuration must match the real material flow and installation conditions.`;
  const words = `${source} ${selection}`.split(/\s+/).filter(Boolean);
  return words.length > 76 ? `${words.slice(0, 75).join(" ")}.` : words.join(" ");
}

function gallery(product) {
  const images = [...new Set(product.gallery || [])];
  if (!images.length) return "";
  if (images.length === 1) {
    return `<div class='product-gallery product-gallery-single' data-gallery><img class='gallery-main' data-gallery-main src='${escapeHtml(images[0])}' alt='${escapeHtml(product.name)} product view' fetchpriority='high' decoding='async'></div>`;
  }
  const thumbs = images.map((image, index) => `<button type='button' data-gallery-thumb data-src='${escapeHtml(image)}'${index === 0 ? " aria-current='true'" : ""} aria-label='Show image ${index + 1} of ${escapeHtml(product.name)}'><img src='${escapeHtml(image)}' alt='${escapeHtml(product.name)} view ${index + 1}' loading='lazy'></button>`).join("");
  return `<div class='product-gallery' data-gallery><img class='gallery-main' data-gallery-main src='${escapeHtml(images[0])}' alt='${escapeHtml(product.name)}' loading='eager' decoding='async'><div class='gallery-thumbs'>${thumbs}</div></div>`;
}

function technicalTable(truth) {
  const verified = Object.entries(truth.verifiedSpecs).map(([field, value]) => `<div role='row'><span>${escapeHtml(field)}</span><strong>${escapeHtml(value)}</strong><span>Verified public product record</span></div>`);
  const pending = truth.pendingSpecs.length ? [`<div role='row'><span>Project configuration items</span><strong>Available on request</strong><span>${escapeHtml(truth.pendingSpecs.join("; "))}. To be confirmed for the project.</span></div>`] : [];
  return `<div class='product-source-specifications' role='table'>${[...verified, ...pending].join("")}</div>`;
}

function processDiagram(product) {
  const kind = productKind(product);
  const steps = {
    permanent_manual: ["Feed conveyor", "Tramp-iron risk point", "Suspended magnet", "Manual cleaning", "Protected equipment"],
    permanent_self_cleaning: ["Feed conveyor", "Tramp-iron risk point", "Magnetic capture", "Ferrous discharge", "Protected equipment"],
    electromagnetic_manual: ["Feed conveyor", "Tramp-iron risk point", "Electromagnetic separator", "Manual cleaning", "Protected equipment"],
    electromagnetic_self_cleaning: ["Feed conveyor", "Tramp-iron risk point", "Electromagnetic separator", "Continuous discharge", "Protected equipment"],
    wet_magnetic: ["Slurry feed", "Magnetic drum zone", "Magnetic fraction", "Non-magnetic stream", "Downstream process"],
    dry_magnetic: ["Prepared feed", "Magnetic separation zone", "Magnetic fraction", "Non-magnetic fraction", "Process discharge"],
    high_gradient: ["Prepared mineral feed", "Specialist magnetic zone", "Target fraction", "Residual stream", "Process review"],
    metal_detection: ["Conveyor feed", "Detection aperture", "Alarm or interlock", "Response point", "Protected equipment"],
    eddy_current: ["Prepared feed", "Ferrous pre-separation", "Eddy-current rotor", "Non-ferrous fraction", "Residual material"],
    filter: ["Material flow", "Magnetic element", "Captured contamination", "Cleaning access", "Protected process"],
    auxiliary: ["Process input", "Equipment interface", "Project operating condition", "Configured duty", "Downstream process"]
  }[kind];
  return `<ol class='product-process-diagram' aria-label='Typical ${escapeHtml(product.name)} process flow'>${steps.map((step, index) => `<li><span>${String(index + 1).padStart(2, "0")}</span><strong>${escapeHtml(step)}</strong></li>`).join("")}</ol>`;
}

function sourceProcess(product, truth) {
  const process = product.sourceContent?.sections?.find((item) => item.key === "process");
  const items = process?.items?.length ? process.items : truth.selectionInputs.slice(0, 5);
  const intro = process?.introduction || "The final material path and installation position are confirmed from the project layout.";
  return section("how-it-works", "How it works", "How it works", intro, `${processDiagram(product)}${list(items)}`);
}

function sourceFeatures(product) {
  const highlights = product.sourceContent?.hero?.highlights || [];
  const options = product.sourceContent?.sections?.find((item) => item.key === "options")?.items || [];
  const features = [...new Set([...highlights, ...options])].slice(0, 7);
  return section("key-features", "Product features", "Key features", "Features shown here come from the current COWIN product record and are confirmed again for the requested configuration.", list(features.length ? features : ["Configuration reviewed against the actual process", "Product media and final selection coordinated by COWIN MAGNET"]));
}

function sourceFaq(product, truth) {
  const source = product.sourceContent?.sections?.find((item) => item.key === "faq")?.cards || [];
  const fallback = [
    { title: `What information is needed for a ${truth.productType.toLowerCase()} quote?`, description: truth.selectionInputs.slice(0, 3).join("; ") + "." },
    { title: "Can a final model be selected from the product name alone?", description: "No. Final selection needs the actual material, process position, installation constraints and operating conditions." },
    { title: "Can COWIN support African projects?", description: "Yes. COWIN MAGNET supports South African and African projects through product selection and export coordination; final configuration is confirmed for the project." }
  ];
  return section("faq", "Product FAQ", "Questions buyers ask", "Answers apply to this product family and do not replace a project-specific engineering review.", cards((source.length ? source : fallback).slice(0, 6)));
}

function related(product) {
  const kind = productKind(product);
  const relatedProducts = products.filter((item) => item.slug !== product.slug && (productKind(item) === kind || item.categorySlug === product.categorySlug)).slice(0, 3);
  if (!relatedProducts.length) return "";
  const body = `<div class='grid'>${relatedProducts.map((item) => `<a class='card' data-product-card href='${escapeHtml(item.canonicalUrl)}'><img src='${escapeHtml(item.image)}' alt='${escapeHtml(item.name)}' loading='lazy'><p class='eyebrow'>${escapeHtml(item.category)}</p><h3>${escapeHtml(item.name)}</h3><p>${escapeHtml(plainText(item.shortDescription).slice(0, 180))}</p></a>`).join("")}</div>`;
  return section("related-products", "Product range", "Related products", "These related products are selected from the same verified product family or product category.", body);
}

function inquiryForm(product, truth) {
  const model = truth.model || "";
  const prefix = `inquiry-${product.slug}`;
  const input = (name, label, { type = "text", required = false } = {}) => `<div class='product-field'><label for='${prefix}-${name}'>${label}${required ? " <span aria-hidden='true'>*</span>" : ""}</label><input id='${prefix}-${name}' name='${name}' type='${type}'${required ? " required aria-required='true'" : ""}></div>`;
  return `<section id='product-inquiry' class='product-source-section'><div class='product-source-heading'><p class='eyebrow'>Project inquiry</p><h2>Request a project-specific review</h2><p class='product-section-intro'>Share the operating details below. The product, source URL, UTM values and page language travel with this inquiry.</p></div><form class='quote-form product-inquiry-form' data-quote-form data-product-enquiry-form novalidate><input type='hidden' name='productName' value='${escapeHtml(product.name)}'><input type='hidden' name='productRequired' value='${escapeHtml(product.name)}'><input type='hidden' name='model' value='${escapeHtml(model)}'><input type='hidden' name='sourceUrl' value='${escapeHtml(product.canonicalUrl)}'><input type='hidden' name='pageLanguage' value='en-za'><input type='hidden' name='utm_source'><input type='hidden' name='utm_medium'><input type='hidden' name='utm_campaign'>${input("name", "Name", { required: true })}${input("company", "Company", { required: true })}${input("email", "Email", { type: "email", required: true })}${input("whatsapp", "WhatsApp")}${input("country", "Country", { required: true })}${input("industry", "Industry")}${input("material", "Material or target mineral")}${input("contamination", "Contamination or separation target")}${input("beltWidth", "Conveyor width or pipe size")}${input("beltSpeed", "Belt speed or flow rate")}${input("particleSize", "Burden depth or particle size")}${input("suspensionHeight", "Suspension height or installation space")}${input("powerSupply", "Power supply")}${input("environment", "Environment")}<div class='product-field full'><label for='${prefix}-projectDescription'>Project message</label><textarea id='${prefix}-projectDescription' name='projectDescription' rows='5'></textarea></div><button class='button primary full' type='submit'>Request a Quote</button><output class='form-status full' data-form-status aria-live='polite'></output></form></section>`;
}

function productSchema(product, truth, description) {
  const schema = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Product",
        name: product.name,
        description,
        image: product.gallery?.map((image) => `${siteUrl}${image}`) || [],
        brand: { "@type": "Brand", name: "COWIN MAGNET" },
        sku: truth.model || product.slug,
        url: `${siteUrl}${product.canonicalUrl}`
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: `${siteUrl}/en-za/` },
          { "@type": "ListItem", position: 2, name: "Products", item: `${siteUrl}/en-za/products/` },
          { "@type": "ListItem", position: 3, name: product.category, item: `${siteUrl}/en-za/products/${product.categorySlug}/` },
          { "@type": "ListItem", position: 4, name: product.name, item: `${siteUrl}${product.canonicalUrl}` }
        ]
      }
    ]
  };
  return JSON.stringify(schema).replace(/</g, "\\u003c");
}

function main(product) {
  const truth = buildTruthCard(product);
  const description = metaDescription(product, truth);
  const facts = product.sourceContent?.hero?.quickFacts || [];
  const factHtml = facts.length ? `<dl class='product-quick-facts'>${facts.slice(0, 4).map((fact) => `<div><dt>${escapeHtml(fact.label)}</dt><dd>${escapeHtml(fact.value)}</dd></div>`).join("")}</dl>` : "";
  const options = truth.sourceOptions.length ? truth.sourceOptions : ["Available on request after project review", "Installation and protection arrangement confirmed with the selected model"];
  const nav = [
    ["overview", "Product overview"], ["how-it-works", "How it works"], ["key-features", "Key features"], ["applications", "Typical applications"], ["helps-solve", "What it helps solve"], ["selection", "Installation and selection"], ["specifications", "Technical specifications"], ["options", "Options and customisation"], ["maintenance", "Operation and maintenance"], ["faq", "FAQ"], ["product-inquiry", "Request a quote"]
  ].map(([id, label]) => `<a href='#product-${id}'>${label}</a>`).join("");
  const quoteLink = `/en-za/request-a-quote/?product=${encodeURIComponent(product.name)}`;
  const body = [
    section("overview", "Product overview", product.name, overview(product, truth), `<div class='product-overview-status'><span>Series: ${escapeHtml(truth.series)}</span><span>Model: ${escapeHtml(truth.model || "To be confirmed")}</span><span>${escapeHtml(truth.status)}</span></div>`),
    sourceProcess(product, truth),
    sourceFeatures(product),
    section("applications", "Process fit", "Typical applications", "COWIN MAGNET supports South African and African projects. These applications describe relevant process contexts, not local installations or inventory.", list(truth.applications)),
    section("helps-solve", "Process objective", "What it helps solve", "Final outcomes depend on material, installation and the confirmed model.", list(truth.whatItHelpsSolve)),
    section("selection", "Engineering inputs", "Installation and selection guide", "Provide the following information so COWIN can review the product against the actual process.", list(truth.selectionInputs)),
    section("specifications", "Confirmed data", "Technical specifications", "Only verified public fields are shown as values. Other fields remain subject to project confirmation.", technicalTable(truth)),
    section("options", "Configuration", "Options and customisation", "Only options appropriate to the selected product and project are confirmed in a quotation.", list(options)),
    section("maintenance", "Service planning", "Operation and maintenance", "Use site-safe isolation and the supplier-approved procedures for the selected configuration.", list(truth.maintenance)),
    sourceFaq(product, truth),
    related(product),
    inquiryForm(product, truth)
  ].join("");
  return { description, schema: productSchema(product, truth, description), html: `<main><section class='product-page-hero'><nav class='breadcrumbs'><a href='/en-za/'>Home</a> / <a href='/en-za/products/'>Products</a> / <a href='/en-za/products/${escapeHtml(product.categorySlug)}/'>${escapeHtml(product.category)}</a> / <span>${escapeHtml(product.name)}</span></nav><div class='product-hero-grid'><div class='product-hero-media'>${gallery(product)}</div><div class='product-hero-copy'><p class='eyebrow'>${escapeHtml(truth.productType)}</p><h1>${escapeHtml(product.name)}</h1><p>${escapeHtml(heroSummary(product, truth))}</p><div class='product-hero-actions'><a class='button primary' href='#product-inquiry'>Request a Quote</a><a class='button secondary' href='https://wa.me/8615665135205?text=${encodeURIComponent(`Hello COWIN MAGNET, I am reviewing ${product.name}. Please help with configuration.`)}' target='_blank' rel='noopener noreferrer nofollow'>Talk to an Engineer</a></div>${factHtml}</div></div></section><section class='product-detail-layout'><aside class='product-detail-nav'><p>On this page</p>${nav}</aside><article class='product-detail-content'>${body}</article><aside class='product-quote-panel'><p class='eyebrow'>Project inquiry</p><h2>Request product information</h2><p>Share process details for a product-specific review.</p><a class='button primary' href='#product-inquiry'>Request a Quote</a><a class='button secondary' href='${quoteLink}'>Open full quote form</a></aside></section></main>` };
}

for (const product of products) {
  const target = join(root, "en-za", "products", product.categorySlug, product.slug, "index.html");
  const previous = await readFile(target, "utf8");
  const rendered = main(product);
  let updated = previous.replace(/<main>[\s\S]*?<\/main>/i, rendered.html);
  updated = updated.replace(/<title>[^<]*<\/title>/i, `<title>${escapeHtml(product.name)} | COWIN MAGNET South Africa</title>`);
  updated = updated.replace(/<meta name="description" content="[^"]*">/i, `<meta name="description" content="${escapeHtml(rendered.description)}">`);
  updated = updated.replace(/<link rel="canonical" href="[^"]*">/i, `<link rel="canonical" href="${siteUrl}${product.canonicalUrl}">`);
  updated = updated.replace(/<meta property="og:title" content="[^"]*">/i, `<meta property="og:title" content="${escapeHtml(product.name)} | COWIN MAGNET South Africa">`);
  updated = updated.replace(/<meta property="og:description" content="[^"]*">/i, `<meta property="og:description" content="${escapeHtml(rendered.description)}">`);
  updated = updated.replace(/<meta property="og:url" content="[^"]*">/i, `<meta property="og:url" content="${siteUrl}${product.canonicalUrl}">`);
  updated = updated.replace(/<meta property="og:image" content="[^"]*">/i, `<meta property="og:image" content="${siteUrl}${product.image}">`);
  updated = updated.replace(/<script type='application\/ld\+json'>[^<]*BreadcrumbList[^<]*<\/script>/gi, `<script type='application/ld+json'>${rendered.schema}</script>`);
  await writeFile(target, updated.replace(/^\uFEFF/, ""));
}

console.log(`Rendered ${products.length} South Africa product detail pages.`);
