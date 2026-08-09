import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const products = JSON.parse((await readFile(join(root, "data/products/products.json"), "utf8")).replace(/^\uFEFF/, ""));

const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
const clean = (value = "") => String(value).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const product = (slug) => products.find((item) => item.slug === slug);

function replaceMain(html, main) {
  return html.replace(/<main>[\s\S]*?<\/main>/i, main);
}

async function render(path, main) {
  const file = join(root, path, "index.html");
  const existing = await readFile(file, "utf8");
  await writeFile(file, replaceMain(existing, main));
}

function productCard(item) {
  if (!item) return "";
  const description = clean(item.shortDescription).slice(0, 145);
  return `<a class="industrial-product-card" href="${escapeHtml(item.canonicalUrl)}"><img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}" width="800" height="600" loading="lazy" decoding="async"><span>${escapeHtml(item.category)}</span><h3>${escapeHtml(item.name)}</h3><p>${escapeHtml(description)}</p><strong>View product <i aria-hidden="true">→</i></strong></a>`;
}

function linkCard(href, image, label, title, description, alt) {
  return `<a class="industrial-link-card" href="${href}"><img src="${image}" alt="${alt}" width="960" height="600" loading="lazy" decoding="async"><span>${label}</span><h3>${title}</h3><p>${description}</p><strong>Explore <i aria-hidden="true">→</i></strong></a>`;
}

const homeProducts = [
  product("rcyd-type-permanent-magnet-self-dumping-iron-remover"),
  product("wet-drum-magnetic-separator"),
  product("eccentric-eddy-current-separator"),
  product("magnetic-grid"),
  product("suspended-permanent-magnetic-separator"),
  product("dls-type-window-metal-detector")
].filter(Boolean);

const home = `<main class="industrial-home">
  <section class="industrial-home-hero">
    <picture><source type="image/webp" srcset="/assets/images/hero-mining-conveyor-magnet-lcp.webp"><img src="/assets/images/hero-mining-conveyor-magnet.webp" alt="Industrial conveyor magnetic separation support context" width="1600" height="900" fetchpriority="high" decoding="async"></picture>
    <div class="industrial-home-hero-copy"><p>Engineering selection support</p><h1>Magnetic separation equipment for African mining and bulk materials</h1><p>COWIN MAGNET helps procurement and engineering teams select industrial magnetic separation, iron-removal, metal-detection and recovery equipment for South African and African projects.</p><div><a class="button primary" href="/en-za/products/">Explore Products</a><a class="button secondary" href="/en-za/request-a-quote/">Request a Quote</a></div></div>
    <ul class="industrial-hero-tags"><li>Mining</li><li>Recycling</li><li>Bulk Handling</li></ul>
  </section>
  <section class="industrial-section industrial-family-entry"><div class="industrial-section-heading"><span>Product families</span><h2>Start with the process position</h2><p>Choose the equipment group that matches the material flow, then confirm the project conditions.</p></div><div class="industrial-family-grid">
    ${linkCard("/en-za/products/suspended-and-self-unloading-iron-removers/", "/assets/images/application/mining-conveyor-tramp-iron-protection.webp", "Conveyor iron removal", "Protect conveyors and downstream equipment", "Suspended magnets and self-cleaning iron removal for controlled protection points.", "Conveyor iron-removal process context")}
    ${linkCard("/en-za/products/magnetic-separation-equipment/", "/assets/images/application/coal-wash-plant-wet-magnetic-separation.webp", "Mineral processing", "Separate mineral streams with the right magnetic duty", "Wet, dry and high-gradient equipment for selected ore and recovery applications.", "Wet magnetic separation process context")}
    ${linkCard("/en-za/products/metal-detection-and-recycling-sorting/", "/assets/images/application/recycling-eddy-current-metal-recovery.webp", "Recycling & detection", "Recover and protect material-recovery lines", "Metal detection and non-ferrous sorting equipment for prepared material flows.", "Recycling metal recovery process context")}
    ${linkCard("/en-za/products/magnetic-components-and-filters/", "/assets/images/application/process-pipeline-magnetic-filtration.webp", "Filters & components", "Control fine iron contamination in process flows", "Magnetic grids, drawer units, rods and filters for defined chutes and pipelines.", "Magnetic filtration process context")}
  </div></section>
  <section class="industrial-section industrial-application-section"><div class="industrial-section-heading"><span>Choose by application</span><h2>Process context guides the configuration</h2></div><div class="industrial-application-tabs"><a href="/en-za/industries/mining/">Mining & mineral processing</a><a href="/en-za/industries/coal-handling/">Coal handling & washing</a><a href="/en-za/industries/quarry-aggregates/">Aggregates & cement</a><a href="/en-za/industries/recycling/">Recycling & MRF</a><a href="/en-za/industries/ports-bulk-terminals/">Ports & bulk handling</a></div></section>
  <section class="industrial-section industrial-how"><div class="industrial-section-heading"><span>How COWIN supports projects</span><h2>Selection support without unsupported claims</h2></div><ol><li><b>01</b><h3>Share site data</h3><p>Material, process position, dimensions and environmental conditions.</p></li><li><b>02</b><h3>Review configuration</h3><p>Match the equipment family and selections to the real operating duty.</p></li><li><b>03</b><h3>Quote and export coordination</h3><p>Confirm the final configuration, commercial scope and shipment requirements.</p></li></ol></section>
  <section class="industrial-section"><div class="industrial-section-heading"><span>Featured equipment</span><h2>Common starting points for project review</h2></div><div class="industrial-product-grid">${homeProducts.map(productCard).join("")}</div></section>
  <section class="industrial-selection-panel"><div><span>Engineering selection panel</span><h2>Prepare the process information that matters</h2><p>Material and target metal/mineral, feed presentation, conveyor or pipe dimensions, available installation space, environmental exposure and power conditions.</p></div><a class="button primary" href="/en-za/request-a-quote/">Start a project inquiry</a></section>
  <section class="industrial-section industrial-solutions"><div class="industrial-section-heading"><span>Problem-led support</span><h2>Explore by the risk in your process</h2></div><div class="industrial-link-grid">${linkCard("/en-za/solutions/crusher-protection/", "/assets/images/application-quarry-aggregate.webp", "Solution", "Crusher protection", "Keep tramp iron away from vulnerable crushing stages.", "Quarry crusher protection context")}${linkCard("/en-za/solutions/tramp-iron-removal/", "/assets/images/application/mining-conveyor-tramp-iron-protection.webp", "Solution", "Tramp iron removal", "Position the right magnetic equipment in the material flow.", "Tramp iron removal conveyor context")}${linkCard("/en-za/solutions/non-ferrous-metal-recovery/", "/assets/images/application/recycling-eddy-current-metal-recovery.webp", "Solution", "Non-ferrous metal recovery", "Match prepared feed and separation stages to recovery requirements.", "Non-ferrous recovery sorting context")}</div></section>
  <section class="industrial-final-cta"><div><span>Project review</span><h2>Need a configuration for a specific line?</h2><p>Send the available process details and COWIN will review the equipment family with you.</p></div><div><a href="https://wa.me/8615665135205" target="_blank" rel="noopener noreferrer nofollow">WhatsApp</a><a class="button primary" href="/en-za/request-a-quote/">Request a Quote</a></div></section>
</main>`;

const industryHub = `<main class="industrial-hub"><section class="industrial-hub-hero"><nav class="breadcrumbs"><a href="/en-za/">Home</a> / <span>Industries</span></nav><span>Industry applications</span><h1>Magnetic equipment by process and industry</h1><p>Explore practical magnetic separation, protection and metal-control duties across African industrial projects. Final configuration is reviewed against the actual material flow.</p></section><section class="industrial-section"><div class="industrial-link-grid">${linkCard("/en-za/industries/mining/", "/assets/images/application/mineral-screening-control-environment.webp", "Industry", "Mining & mineral processing", "Selection support for ore preparation, recovery and tramp-iron protection.", "Mining mineral processing context")}${linkCard("/en-za/industries/coal-handling/", "/assets/images/application/coal-wash-plant-wet-magnetic-separation.webp", "Industry", "Coal handling & washing", "Review conveyor, wash-plant and protection points.", "Coal handling wash plant context")}${linkCard("/en-za/industries/quarry-aggregates/", "/assets/images/application-quarry-aggregate.webp", "Industry", "Aggregates, quarrying & cement", "Protect crushers and improve material-flow control.", "Aggregate quarry conveyor context")}${linkCard("/en-za/industries/recycling/", "/assets/images/application/recycling-eddy-current-metal-recovery.webp", "Industry", "Recycling & material recovery", "Recover defined ferrous and non-ferrous fractions from prepared feed.", "Recycling sorting context")}${linkCard("/en-za/industries/ports-bulk-terminals/", "/assets/images/application-port-bulk-handling.webp", "Industry", "Ports, power & bulk handling", "Review outdoor conveyor protection, dust and corrosion conditions.", "Port bulk handling context")}</div></section><section class="industrial-selection-panel"><div><span>Selection inputs</span><h2>Every industry page starts with the process, not a generic model list</h2><p>Share material, particle or burden condition, material flow, available access, site environment and downstream equipment risk.</p></div><a class="button primary" href="/en-za/request-a-quote/">Request a project review</a></section></main>`;

const solutionsHub = `<main class="industrial-hub"><section class="industrial-hub-hero"><nav class="breadcrumbs"><a href="/en-za/">Home</a> / <span>Solutions</span></nav><span>Problem-led solutions</span><h1>Magnetic equipment around real process risks</h1><p>Start with the protection, recovery or contamination-control objective, then review the process position and configuration inputs.</p></section><section class="industrial-section"><div class="industrial-link-grid">${linkCard("/en-za/solutions/crusher-protection/", "/assets/images/application-quarry-aggregate.webp", "Solution", "Crusher protection", "Reduce the risk from ferrous tramp material before vulnerable crushing stages.", "Crusher protection process context")}${linkCard("/en-za/solutions/tramp-iron-removal/", "/assets/images/application/mining-conveyor-tramp-iron-protection.webp", "Solution", "Tramp iron removal", "Match magnetic equipment to the feed, belt and access conditions.", "Tramp iron removal process context")}${linkCard("/en-za/solutions/conveyor-belt-protection/", "/assets/images/application-port-bulk-handling.webp", "Solution", "Conveyor belt protection", "Review transfer points, belt condition and downstream protection needs.", "Bulk conveyor protection context")}${linkCard("/en-za/solutions/non-ferrous-metal-recovery/", "/assets/images/application/recycling-eddy-current-metal-recovery.webp", "Solution", "Non-ferrous metal recovery", "Review prepared feed, separation stages and collection requirements.", "Non-ferrous recovery process context")}</div></section></main>`;

await render("en-za", home);
await render("en-za/industries", industryHub);
await render("en-za/solutions", solutionsHub);
console.log("Rendered core South Africa UI/UX landing pages.");
