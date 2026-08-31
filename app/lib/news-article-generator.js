import crypto from "node:crypto";
import { sanitizePublishedArticleHtml } from "./news-system.js";

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function cleanTitle(value) {
  return String(value || "")
    .replace(/^media statement\s*[-–:]\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function shortSubject(value, max = 76) {
  const title = cleanTitle(value);
  if (title.length <= max) return title;
  const slice = title.slice(0, max + 1);
  const boundary = slice.lastIndexOf(" ");
  return `${slice.slice(0, boundary > 45 ? boundary : max).trim()}…`;
}

function seededNumber(value) {
  return Number.parseInt(crypto.createHash("sha256").update(String(value)).digest("hex").slice(0, 8), 16);
}

export function classifyNewsAngle(sources = []) {
  const text = sources.map((source) => `${source.title || ""} ${source.publisher || ""}`).join(" ").toLowerCase();
  if (/illegal mining|zama zama|criminal enterprise|mineral theft|syndicate|nkaneng|custody|vandalism/.test(text)) return "material-security";
  if (/loan|funding|investment|infrastructure|industrial development|capital project|project finance/.test(text)) return "infrastructure-investment";
  if (/fuel price|energy|electricity|power supply|renewable|nersa/.test(text)) return "energy-cost";
  if (/modernisation|automation|digital|technology|sensor|data/.test(text)) return "modernisation";
  if (/recycling|waste|circular|recovery|scrap/.test(text)) return "recycling";
  if (/coal|chrome|manganese|iron ore|mineral processing|beneficiation/.test(text)) return "mineral-processing";
  return "material-handling";
}

const profiles = {
  "infrastructure-investment": {
    suffix: "Bulk-Material Project Checks for South African Plants",
    summary: "A source-based review of infrastructure signals and the practical information required before magnetic separation equipment is specified.",
    modules: [
      ["Separate the funding signal from the equipment decision", "An infrastructure announcement can indicate that project activity, rehabilitation or industrial capacity may increase, but it does not identify a COWIN order or prove that a particular separator is required. The useful engineering response is to identify which material routes, transfer points and downstream machines could be affected if the project proceeds. Scope must then be confirmed from drawings, process data and operating objectives. This separation keeps public investment context in its proper place while ensuring that procurement decisions remain traceable to verified plant conditions."],
      ["Translate programme objectives into package boundaries", "Large projects are delivered through packages with different owners, schedules and acceptance criteria. A magnetic separation package should state the process objective, battery limits, supporting steelwork, controls interface, discharge arrangement and responsibility for installation. Without those boundaries, a technically suitable magnet can still arrive without the access, guarding, power or structural provisions needed to operate it. Early interface definition also lets civil, mechanical and electrical teams resolve conflicts before fabrication and site mobilisation."],
      ["Use project gates to improve selection quality", "Concept, feasibility, detailed design and procurement stages require different levels of certainty. Early budgets may use a provisional equipment family, while a purchase specification needs measured conveyor data, material characteristics, contamination expectations and environmental conditions. Recording which facts are confirmed at each gate prevents estimates from becoming accidental guarantees. It also gives the buyer a clear list of outstanding inputs and allows COWIN engineering to revise the configuration when the project moves from planning assumptions to issued-for-construction information."]
    ]
  },
  "material-security": {
    suffix: "Material-Control and Conveyor-Protection Questions",
    summary: "A source-based review of material-control signals and the distinct role of correctly selected magnetic separation equipment.",
    modules: [
      ["Keep material security and metal removal as separate controls", "Public reports about theft, unauthorised activity or damaged infrastructure raise questions about custody and operating discipline. Magnetic equipment cannot establish legal origin, ownership or mineral grade. Its role is narrower: removing suitable ferrous contamination at a defined point when the installation and process conditions support that duty. Security procedures, access control, weighing, sampling and incident management remain separate controls and should never be replaced by an equipment claim."],
      ["Map where abnormal material can enter the process", "A practical review follows material from receipt or reclaim through stockpiles, feeders, conveyors and transfer points. Teams should record where loads change custody, where maintenance work introduces loose steel, and where unusual material can be isolated safely. This map helps distinguish a security event from ordinary equipment wear or housekeeping problems. It also identifies the downstream crusher, screen or product stream that needs protection and the most useful location for detection or separation."],
      ["Create an evidence trail for captured objects", "Recovered metal should be handled under the site's approved safety and security procedure. Useful operating records include the time, process location, approximate dimensions, photographs and the feed route associated with the event. Those observations support maintenance learning and any separate investigation without implying that the separator can determine origin. Over time, the record also improves equipment reviews by replacing broad descriptions such as heavy contamination with observable frequency and size information."]
    ]
  },
  "energy-cost": {
    suffix: "Energy, Reliability and Separator Selection Decisions",
    summary: "A source-based review of energy signals and the lifecycle questions that affect magnetic separation equipment choices.",
    modules: [
      ["Treat energy news as planning context", "Electricity, fuel or renewable-energy announcements can affect operating assumptions, but they do not by themselves determine whether a permanent or electromagnetic system is preferable. Selection begins with the separation duty, burden, suspension height, cleaning arrangement and downstream risk. Energy context becomes relevant after those facts are known, when the team compares electrical infrastructure, controls, cooling, availability and lifecycle cost for technically suitable alternatives."],
      ["Compare power demand with production consequence", "A low connected load is not the only objective. The evaluation should include the production consequence of missed tramp metal, unplanned cleaning, overheating, control faults and maintenance access. A permanent magnet and an electromagnetic system have different power and operating characteristics, while manual-cleaning and self-cleaning arrangements create different labour and downtime demands. The useful comparison is therefore a duty-specific lifecycle review rather than a generic energy-efficiency claim."],
      ["Design for the real electrical environment", "Where an electromagnetic solution is under review, the buyer should confirm supply voltage, frequency, protection philosophy, control-panel location, cable route and restart expectations after an outage. Ambient temperature, altitude, dust and ventilation can also affect the final arrangement. These inputs belong in the technical schedule so that electrical and mechanical responsibilities are coordinated before delivery, particularly at remote sites where replacement parts and specialist access may take longer."]
    ]
  },
  modernisation: {
    suffix: "Modernisation Priorities for Conveyor Protection",
    summary: "A source-based review of mining modernisation and the data, controls and maintenance interfaces needed around magnetic separation equipment.",
    modules: [
      ["Modernisation starts with a measurable operating objective", "Automation and digitalisation are valuable only when they support a defined process result. For conveyor protection, the team should state what downstream asset is at risk, what contamination must be addressed and how performance will be observed. That objective determines which equipment signals, alarms or interlocks are useful. Adding sensors without an operating response can create data without improving protection, while a clear response plan turns equipment status into an actionable maintenance or production decision."],
      ["Define control and data ownership", "A modern installation may exchange run status, fault signals, belt-speed inputs or permissives with the plant control system. The project should define signal ownership, fail-safe behaviour, local and remote modes, reset permissions and event logging. These details are not interchangeable between permanent, electromagnetic, manual-cleaning and self-cleaning configurations. A documented cause-and-effect review helps the equipment supplier, control integrator and plant operator agree how the system behaves during startup, trips and maintenance."],
      ["Use condition information to improve maintenance", "Inspection records, captured-metal observations, belt condition and equipment alarms can be combined into a practical maintenance history. The purpose is not to predict more than the data supports; it is to identify recurring events, verify that inspection intervals remain appropriate and give engineering teams evidence for later changes. Standard naming, timestamps and responsibility for closing actions are more important than a complex dashboard that is not connected to the site's work-management process."]
    ]
  },
  recycling: {
    suffix: "Metal-Recovery Planning for South African Operations",
    summary: "A source-based review of recycling signals and the feed preparation, recovery and product-quality questions that guide equipment selection.",
    modules: [
      ["Start with the material stream, not the machine name", "Recycling announcements may point to changing volumes, recovery targets or investment, but equipment selection still depends on the actual stream. Teams should document composition, particle-size range, moisture, loading consistency and the position of ferrous and non-ferrous fractions. A magnet, metal detector and eddy-current separator perform different duties. Defining the required recovered product and the contaminants that must be controlled prevents several technologies from being described as one generic sorting solution."],
      ["Feed presentation controls recovery opportunity", "Separation performance depends on how material reaches the equipment. Burden depth, belt speed, particle liberation, distribution across the belt and nearby steelwork can matter as much as the nominal throughput. The review should identify upstream shredding, screening or spreading steps and confirm whether surges can overwhelm the intended presentation. A stable, documented feed condition gives the project a defensible basis for trials, guarantees and later troubleshooting."],
      ["Plan both product and reject handling", "Recovered metal needs a safe discharge route, suitable collection volume and a defined destination. The remaining stream also needs protection from cross-contamination and uncontrolled recirculation. Layout work should therefore include chutes, guarding, access, dust control and the method used to clear blockages. These provisions affect whether a self-cleaning arrangement is necessary and whether the selected equipment can be maintained without exposing personnel to moving machinery or suspended loads."]
    ]
  },
  "mineral-processing": {
    suffix: "Mineral-Processing and Magnetic Separation Review",
    summary: "A source-based review of mineral-processing signals and the test work and operating data required for magnetic separation decisions.",
    modules: [
      ["Define whether the duty is protection or process separation", "A suspended separator protecting a crusher, a drum recovering ferromagnetic material and a high-gradient system treating a fine process stream solve different problems. The project should state whether the objective is tramp-metal removal, product cleaning, recovery or pre-concentration. That distinction guides test work, sampling and performance measures and prevents a protection device from being evaluated against a mineral-recovery target it was not designed to meet."],
      ["Connect test work to the proposed operating window", "Representative samples should reflect expected mineralogy, size distribution, moisture and variability rather than a single convenient batch. Test results need to be linked to the proposed field strength, feed presentation, residence time and cleaning method. If upstream conditions change, the basis of selection should be revisited. This approach makes clear which values are measured, which are estimated and which remain subject to project-specific confirmation."],
      ["Protect the interfaces around the separator", "Feed chutes, launders, pumps, conveyors and product handling can determine whether a selected separator receives the duty used in the review. The layout should address surge control, access, wash-water or drainage requirements where relevant, and safe sampling of products. Responsibilities for supporting structure, electrics, piping and commissioning should be recorded so that the separator is evaluated as part of the process line rather than as an isolated item."]
    ]
  },
  "material-handling": {
    suffix: "Material-Handling Decisions for Conveyor Protection",
    summary: "A source-based review of current industry signals and the operating data needed for a defensible conveyor-protection decision.",
    modules: [
      ["Convert a broad industry update into a defined plant question", "An industry announcement is useful context, not a purchase specification. A plant review should identify the material route, the downstream equipment exposed to ferrous contamination and the consequence of an undetected object. That information establishes whether the immediate need is detection, removal, process separation or a combination of controls. It also prevents general market news from being presented as evidence of a specific customer project, local installation or guaranteed performance."],
      ["Locate the protection point from process evidence", "The proposed position should be checked against burden depth, material trajectory, belt speed, headroom, nearby steelwork and the route available for captured metal. A convenient open space is not automatically the best separation point. Drawings and clear photographs help identify structural and maintenance constraints, while operating records can show where contamination becomes visible and which downstream machine experiences the greatest consequence."],
      ["Match cleaning method to the operating pattern", "Manual-cleaning and self-cleaning systems serve different production conditions. The review should consider contamination frequency, whether the process can stop safely, where removed metal will be discharged and how personnel will access the equipment. Permanent and electromagnetic magnet systems also have different power, controls and maintenance implications. Those attributes should remain tied to the actual product under review rather than combined into a generic description."]
    ]
  }
};

const sharedModules = [
  ["Establish a verified design basis", "Record conveyor width, belt speed, maximum burden depth, material type, particle-size range, moisture and temperature at the proposed position. Add the expected ferrous object size, shape and frequency where observations exist. Values copied from an old drawing should be checked against the operating plant. A short design-basis sheet gives all parties the same reference and makes later changes visible before they affect manufacturing or installation."],
  ["Confirm installation geometry early", "A dimensioned layout should show suspension height, belt profile, transfer trajectory, structural members and the space available for discharge and maintenance. Nearby steel can influence the arrangement, while insufficient headroom can make a nominal equipment selection impractical. Reviewing the geometry before order placement reduces the risk of site modifications and gives structural designers the loads and access requirements needed for their work."],
  ["Define the downstream consequence", "The protected asset may be a crusher, screen, mill, conveyor or product stream, and each has a different consequence when unwanted metal passes. The team should describe credible events and the operating response expected after detection or capture. This focuses the selection discussion on risk reduction and availability rather than treating magnetic strength or belt width as a complete specification."],
  ["Plan a safe discharge route", "Captured material must leave the process without falling into a walkway, returning to the feed or blocking a chute. The project should define collection points, guarding, access and the method used to empty containers. Where continuous production is required, discharge capacity and the expected contamination rate should be reviewed together. The arrangement also needs an agreed procedure for unusual or hazardous recovered objects."],
  ["Coordinate controls and interlocks", "Run permissives, belt-speed inputs, local controls, alarms and emergency-stop interfaces should be documented when they form part of the selected configuration. The cause-and-effect description should state what happens during startup, a separator fault, a stopped conveyor and maintenance isolation. Clear boundaries between the equipment package and the plant control system prevent signals from being assumed by both parties or supplied by neither."],
  ["Review maintenance access", "Inspection, cleaning, lubrication and component replacement require safe access and isolation. The layout should account for platforms, lifting points, guarding removal and the space needed to withdraw service items. Maintenance representatives should review these provisions before the support structure is fixed. A design that performs magnetically but cannot be serviced safely will not deliver reliable plant protection over its working life."],
  ["Account for the site environment", "Outdoor exposure, dust, rainfall, corrosion, ambient temperature and altitude can affect enclosure, coating, cooling and electrical decisions. Coastal and remote locations may also change material choices and the spare-parts strategy. These conditions should be listed explicitly rather than hidden inside a general heavy-duty requirement, allowing the final quotation to state which environmental assumptions are included."],
  ["Use observations instead of vague contamination labels", "Terms such as light, severe or occasional contamination mean different things to different teams. Photographs, approximate dimensions, capture frequency and the process position provide a better basis for review. If reliable records do not yet exist, the project can define a short observation period and a consistent log. The resulting evidence supports equipment selection and gives maintenance teams a baseline for future comparison."],
  ["Keep performance claims traceable", "Project-specific separation or protection values should be tied to agreed operating conditions and, where necessary, representative testing. Unknown values should remain marked for confirmation instead of being replaced by generic guarantees. This protects the buyer and supplier from applying one site's result to a materially different duty and creates a clearer acceptance plan for commissioning."],
  ["Prepare commissioning evidence", "Before startup, teams should confirm installation dimensions, rotation and discharge direction, electrical checks, guarding, isolation and the condition of the material path. Commissioning records should capture the operating settings and any controlled test used to confirm function. Training should cover normal inspection, abnormal events and who owns follow-up actions. These records become the reference for later troubleshooting."],
  ["Track change through the project", "Material properties, throughput, layouts and package interfaces often change between feasibility and construction. A simple change log should identify the revised input, its owner and whether equipment selection must be reviewed. This prevents a late process change from being absorbed silently and gives procurement a documented basis for any technical or commercial adjustment."],
  ["Evaluate lifecycle support", "Selection should consider consumables, wear components, inspection skills, documentation and the time required to obtain replacement parts. Remote operations may prefer arrangements that simplify routine service, while high-throughput plants may place greater weight on continuous cleaning and planned redundancy. Lifecycle discussion should follow technical suitability and should not be used to justify equipment that does not meet the separation duty."]
];

function rotateModules(seed, variant, count = 6) {
  const start = (seed + variant * 5) % sharedModules.length;
  const stride = [5, 7, 11][variant % 3];
  const chosen = [];
  for (let index = 0; chosen.length < count; index += 1) {
    const item = sharedModules[(start + index * stride) % sharedModules.length];
    if (!chosen.includes(item)) chosen.push(item);
  }
  return chosen;
}

function renderModule([heading, body]) {
  return `<h2>${escapeHtml(heading)}</h2><p>${escapeHtml(body)}</p>`;
}

export function buildNewsArticleDraft({ sources = [], product = {}, now = new Date(), variant = 0 } = {}) {
  const selected = sources.slice(0, 2);
  const angle = classifyNewsAngle(selected);
  const profile = profiles[angle] || profiles["material-handling"];
  const seedKey = selected.map((source) => `${source.url}|${source.title}`).sort().join("|");
  const seed = seededNumber(seedKey);
  const subject = shortSubject(selected[0]?.title || "Current South African industry signals");
  const title = `${subject}: ${profile.suffix}`;
  const sourceList = selected.map((source) => {
    const date = new Date(source.publishedAt);
    const dateText = Number.isNaN(date.valueOf()) ? "date recorded in the source register" : date.toLocaleDateString("en-ZA", { dateStyle: "long", timeZone: "UTC" });
    return `<li><a href="${escapeHtml(source.url)}" rel="nofollow noopener noreferrer" target="_blank">${escapeHtml(source.publisher)}: ${escapeHtml(source.title)}</a>, published ${escapeHtml(dateText)}.</li>`;
  }).join("");
  const sourceNames = selected.map((source) => `${source.publisher}: “${cleanTitle(source.title)}”`).join("; ");
  const profileModules = [...profile.modules];
  if (variant % 2) profileModules.reverse();
  const operationalModules = rotateModules(seed, variant);
  const body = sanitizePublishedArticleHtml(`
<h2>What the recorded sources say</h2>
<p>The current source set consists of ${escapeHtml(sourceNames)}. These public updates provide context for South African industry and project planning. They do not identify a COWIN customer, purchase, local stockholding or operating result, and they do not establish that one magnetic separator configuration suits any named project. The engineering value of the sources is to prompt a disciplined review of material flow, equipment interfaces and the information required before a supplier can confirm selection.</p>
<p>This article therefore separates reported context from COWIN's process-selection guidance. Source titles, publishers, links and dates are retained for traceability. The discussion below is an original engineering interpretation and does not reproduce the source articles or infer commercial relationships.</p>
${profileModules.map(renderModule).join("\n")}
${operationalModules.map(renderModule).join("\n")}
<h2>Where ${escapeHtml(product.name || "the selected equipment family")} may fit</h2>
<p>${escapeHtml(product.name || "The selected equipment family")} may be reviewed where its actual magnet system, cleaning method and installation arrangement match the confirmed duty. It is not a universal answer and no performance value should be inferred from this article. COWIN engineering would require the design basis, layout and operating objective before confirming a model, working position or project-specific capability. The product record and quotation must describe only the configuration under review.</p>
<h2>Questions to resolve before a quotation</h2>
<h3>Can equipment be selected from conveyor width alone?</h3><p>No. Width is one input. Burden depth, belt speed, suspension height, material behaviour, contamination, cleaning requirements, surrounding steelwork and downstream risk must also be reviewed.</p>
<h3>Does the source announcement prove that a magnetic separator is required?</h3><p>No. It provides industry context. The need and configuration must come from the process objective and verified site information.</p>
<h3>What should the buyer send first?</h3><p>Send a concise process description, dimensioned layout or photographs, material and throughput information, observed contamination details, environmental conditions and the downstream equipment or product-quality objective that requires protection.</p>
<h2>Practical next steps</h2>
<ul><li>Confirm the process objective and the consequence of unwanted metal.</li><li>Measure the material and installation conditions at the proposed position.</li><li>Define cleaning, discharge, controls, access and environmental requirements.</li><li>Record assumptions and assign owners for missing information.</li><li>Request a project-specific review before treating provisional data as a guarantee.</li></ul>
<h2>Sources and methodology</h2>
<p>This source-based article was assembled from current public metadata and COWIN's verified product record. It distinguishes source facts from engineering guidance, uses only COWIN-owned product media and does not reproduce third-party reporting.</p><ul>${sourceList}</ul>
<p>Sources were accessed ${escapeHtml(now.toLocaleDateString("en-ZA", { dateStyle: "long", timeZone: "UTC" }))}. Final equipment configuration remains subject to project-specific engineering review.</p>`);

  return {
    angle,
    variant,
    title,
    summary: profile.summary,
    excerpt: profile.summary,
    content: body
  };
}
