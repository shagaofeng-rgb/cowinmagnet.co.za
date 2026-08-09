const MODEL_PATTERN = /\b(RCYDII|RCYD|RCYE|RCYP|RCYB|RCDB|RCDA|RCDC|RCDD|RCDE|RCDFJ|RCDF|RCPS|CTB|CTN|CTS|CTDG|CGT|CTZ|RCT|HJLH|HJPC|GTC|CLT|NCT|WBC|LJK|HMDN|CBZ|CGB|CQZ|CXJ|DCZ|DCX|RCYA|RCYF|RCYG|RCYZ|CLC|CYG|DLS|GJT|GLS|HECP|HECS|KGLA|KXB|QJZ|RBCDB|RBCDD|RBCYD)\b/i;

const FIELD_SETS = {
  permanent_manual: ["Model / series", "Suitable belt width", "Recommended suspension height", "Material burden depth", "Magnetic circuit", "Cleaning arrangement", "Installation direction", "Overall dimensions", "Weight", "Test method"],
  permanent_self_cleaning: ["Model / series", "Suitable belt width", "Recommended suspension height", "Material burden depth", "Magnetic circuit", "Discharge belt arrangement", "Drive configuration", "Belt speed", "Iron discharge direction", "Overall dimensions", "Weight"],
  electromagnetic_manual: ["Model / series", "Input power", "Cooling configuration", "Duty cycle", "Insulation and protection", "Recommended suspension height", "Control arrangement", "Overall dimensions", "Weight"],
  electromagnetic_self_cleaning: ["Model / series", "Input power", "Cooling configuration", "Duty cycle", "Insulation and protection", "Discharge belt drive", "Belt speed", "Control and protection", "Recommended suspension height", "Overall dimensions", "Weight"],
  wet_magnetic: ["Model / series", "Drum diameter × length", "Tank type", "Feed particle size", "Slurry density", "Process capacity", "Drum speed", "Power", "Weight"],
  dry_magnetic: ["Model / series", "Magnetic circuit", "Feed particle size", "Feed moisture", "Process capacity", "Feed arrangement", "Power", "Weight"],
  high_gradient: ["Model / series", "Applicable mineral", "Feed particle size", "Magnetic field configuration", "Slurry density or feed condition", "Water requirement", "Process capacity", "Power", "Testwork requirement"],
  filter: ["Model / series", "Opening or pipe connection", "Magnetic element arrangement", "Material of construction", "Flow or pressure condition", "Temperature condition", "Cleaning method", "Weight"],
  metal_detection: ["Model / series", "Detection aperture", "Test piece and sensitivity requirement", "Conveyor speed", "Alarm or interlock output", "Integration arrangement", "Environmental condition", "Power supply"],
  eddy_current: ["Model / series", "Rotor configuration", "Belt width", "Feed particle size", "Process capacity", "Splitter adjustment", "Rotor speed", "Power", "Weight"],
  auxiliary: ["Model / series", "Application duty", "Installation interface", "Operating condition", "Power supply where applicable", "Overall dimensions", "Weight"]
};

const TYPE_COPY = {
  permanent_manual: {
    label: "Permanent magnetic separator",
    applications: ["Mining and mineral-processing conveyor lines", "Coal handling and washing plants", "Quarry and cement raw-material conveyors", "Ports and bulk-material handling"],
    solves: ["Helps remove ferromagnetic tramp material before downstream equipment", "Supports practical crusher and conveyor protection planning", "Keeps a defined manual-cleaning point in the material flow"],
    selection: ["Conveyor belt width, speed and material burden depth", "Suspension height and available structural support", "Expected size and frequency of ferromagnetic tramp material", "Safe access and isolation procedure for manual cleaning", "Dust, corrosion, temperature and outdoor exposure"],
    maintenance: ["Isolate the conveyor before inspection or cleaning.", "Inspect the suspension structure, guards and safe access route.", "Remove captured ferrous material only under the agreed site procedure."]
  },
  permanent_self_cleaning: {
    label: "Permanent self-cleaning iron remover",
    applications: ["Mining and mineral-processing conveyor lines", "Coal handling and washing plants", "Aggregate and cement conveyor protection", "Ports and bulk-material handling"],
    solves: ["Helps remove ferromagnetic tramp material continuously from a conveyor stream", "Supports protection planning for crushers, screens and transfer equipment", "Provides a defined discharge route for captured ferrous material"],
    selection: ["Conveyor belt width, speed and material burden depth", "Suspension height, installation direction and discharge side", "Expected tramp iron size, frequency and duty cycle", "Space for the discharge belt, guards and maintenance", "Dust, corrosion, temperature and outdoor exposure"],
    maintenance: ["Follow lockout and guarding procedures before service.", "Inspect discharge-belt tracking, scraper condition and captured-metal discharge.", "Check the suspension structure and access route at the interval agreed for the duty."]
  },
  electromagnetic_manual: {
    label: "Electromagnetic suspended separator",
    applications: ["Mining and mineral-processing conveyor lines", "Coal handling and washing plants", "Quarry and cement conveyor protection", "Bulk-material transfer points"],
    solves: ["Helps identify a project-specific electromagnetic separation stage", "Supports upstream ferrous-material removal before sensitive equipment", "Allows electrical and environmental conditions to be reviewed with the configuration"],
    selection: ["Conveyor belt width, speed, burden depth and suspension height", "Expected tramp iron profile and process duty", "Site voltage, frequency, phases and protection requirements", "Cooling clearance, dust control and maintenance access", "Installation structure and safe manual-cleaning arrangement"],
    maintenance: ["Isolate and verify the electrical supply before inspection.", "Inspect the suspension arrangement, electrical connections and guards.", "Maintain the selected cooling and cleaning arrangement to the supplier-approved schedule."]
  },
  electromagnetic_self_cleaning: {
    label: "Self-cleaning electromagnetic iron remover",
    applications: ["Mining and mineral-processing conveyor lines", "Coal handling and washing plants", "Heavy-duty aggregate and cement conveyors", "Ports and bulk-material handling"],
    solves: ["Helps remove ferromagnetic tramp material where continuous discharge is required", "Supports a project-specific review of magnetic, electrical and discharge conditions", "Provides a defined route for captured material away from the working zone"],
    selection: ["Conveyor belt width, speed, burden depth and suspension height", "Expected tramp iron profile, discharge direction and duty cycle", "Site voltage, frequency, phases and control requirements", "Cooling clearance, discharge-belt space and access", "Dust, humidity, corrosion and outdoor exposure"],
    maintenance: ["Isolate electrical and mechanical drives before service.", "Inspect the discharge belt, drive, scrapers, guards and cooling arrangement.", "Check control and protection devices according to the selected model documentation."]
  },
  wet_magnetic: {
    label: "Wet magnetic separator",
    applications: ["Mineral beneficiation circuits following feed and mineral assessment", "Iron-bearing mineral recovery and concentration duties", "Coal-washing magnetic separation stages where applicable", "Tailings or process-stream recovery reviews"],
    solves: ["Helps define a magnetic separation stage within a slurry process", "Supports separation planning around feed condition and downstream streams", "Keeps selection linked to mineral response and process evidence"],
    selection: ["Mineral type and magnetic response", "Feed particle-size distribution and target separation objective", "Slurry density, water conditions and available process space", "Required feed rate and downstream concentrate or tailings route", "Representative sample or plant test information where available"],
    maintenance: ["Isolate the equipment and slurry feed before inspection.", "Inspect the selected drum, tank, drive and discharge areas for wear or build-up.", "Follow the agreed water, slurry and guarding procedures for the selected configuration."]
  },
  dry_magnetic: {
    label: "Dry magnetic separator",
    applications: ["Dry mineral pre-concentration and beneficiation reviews", "Prepared ore and bulk-material separation stages", "Coal or mineral feed preparation where applicable", "Recovery or cleaning stages subject to material assessment"],
    solves: ["Helps assess a dry magnetic separation stage against the feed condition", "Supports separation planning before downstream processing", "Keeps selection tied to mineral response, particle size and moisture"],
    selection: ["Mineral type and magnetic response", "Feed particle-size distribution and moisture", "Feed rate and separation objective", "Feed preparation, dust control and discharge arrangement", "Representative sample or plant test information where available"],
    maintenance: ["Isolate the feed and drive before inspection.", "Inspect feed presentation, guards and discharge areas for build-up or wear.", "Maintain dust control and safe access in line with the selected equipment arrangement."]
  },
  high_gradient: {
    label: "High-gradient or specialist mineral magnetic separator",
    applications: ["Mineral beneficiation projects with a defined magnetic-separation stage", "Chrome, manganese, iron-bearing or other mineral streams subject to testwork", "Tailings, recovery or upgrading reviews", "Process lines where feed condition and target mineral response are confirmed"],
    solves: ["Helps define a specialist magnetic separation stage in a mineral process", "Supports review of target mineral response before equipment selection", "Keeps recovery or grade expectations dependent on representative process evidence"],
    selection: ["Mineral composition, objective and representative sample data", "Particle-size distribution and dry or slurry feed condition", "Target magnetic fraction and downstream process route", "Water, slurry, power and installation constraints where applicable", "Laboratory, pilot or plant test information where available"],
    maintenance: ["Isolate power, feed and moving equipment before inspection.", "Inspect the selected separation zone, feed arrangement and discharge areas.", "Use the supplier-approved maintenance plan once the final configuration is confirmed."]
  },
  filter: {
    label: "Magnetic filter or separator component",
    applications: ["Gravity-fed bulk-material streams", "Pipeline or chute installations subject to connection confirmation", "Powder, granule or processed-material contamination control", "Industrial process lines where cleaning access can be provided"],
    solves: ["Helps capture ferrous contamination at a defined process point", "Supports a cleaner material stream before downstream equipment or processing", "Keeps the connection and cleaning method matched to the actual duty"],
    selection: ["Material type, particle size and flow condition", "Opening, pipe connection or installation envelope", "Flow rate, pressure, temperature and material properties where applicable", "Expected contamination and required cleaning interval", "Access for safe cleaning and maintenance"],
    maintenance: ["Isolate the process before opening or cleaning the magnetic assembly.", "Use the agreed cleaning procedure for the selected housing and magnetic elements.", "Inspect seals, connections and access hardware before returning to service."]
  },
  metal_detection: {
    label: "Industrial metal detector",
    applications: ["Crusher-feed and quarry conveyor protection", "Coal and bulk-material handling lines", "Mining and mineral-processing conveyors", "Cement and aggregate material inspection"],
    solves: ["Helps detect unwanted metal at a defined conveyor location", "Supports an alarm, stop or reject response selected for the process", "Keeps detection performance linked to the aperture, material effect and test requirement"],
    selection: ["Detection aperture and conveyor geometry", "Target metal, test-piece requirement and sensitivity objective", "Material burden, particle size and conveyor speed", "Alarm, stop or reject interlock requirement", "Electrical supply and environmental conditions"],
    maintenance: ["Isolate the electrical supply before inspection.", "Verify detector and interlock operation using the agreed site test procedure.", "Keep the sensing zone, supports and cable routing clear of unauthorised changes."]
  },
  eddy_current: {
    label: "Eddy-current separator",
    applications: ["Recycling and material-recovery facilities", "Prepared MRF and RDF streams", "Non-ferrous recovery stages after suitable feed preparation", "Industrial scrap sorting subject to feed assessment"],
    solves: ["Helps separate suitable non-ferrous material from a prepared stream", "Supports a defined split between recovered and non-recovered material", "Keeps performance discussion tied to feed preparation and the selected splitter setting"],
    selection: ["Target non-ferrous metals and feed contamination", "Feed particle-size range and material presentation", "Required throughput and upstream ferrous removal stage", "Belt width, splitter arrangement and discharge space", "Power, dust control and maintenance access"],
    maintenance: ["Isolate power and moving parts before service.", "Inspect feed presentation, rotor housing, belt tracking and splitter condition.", "Maintain guards and access controls in line with the selected equipment documentation."]
  },
  auxiliary: {
    label: "Industrial magnetic-process auxiliary equipment",
    applications: ["Mining and mineral-processing support duties", "Bulk-material handling and conveyor projects", "Process control or material-handling interfaces", "Project-specific equipment packages"],
    solves: ["Helps complete a defined material-handling or magnetic-process duty", "Supports integration with the selected process arrangement", "Keeps final configuration dependent on the operating and installation conditions"],
    selection: ["Required application duty and process position", "Installation interface and available space", "Material, electrical or control information where applicable", "Environmental conditions and maintenance access", "Project drawings or photographs where available"],
    maintenance: ["Isolate the equipment before service.", "Inspect the selected interfaces, guards and connections.", "Follow the supplier-approved maintenance plan once the final configuration is confirmed."]
  }
};

export function escapeHtml(value = "") {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function plainText(value = "") {
  return String(value).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

export function productKind(product) {
  const text = `${product.slug} ${product.name}`.toLowerCase();
  if (/high.frequency.screen|control.box|lifting.magnet/.test(text)) return "auxiliary";
  if (/eddy|hecp|hecs/.test(text)) return "eddy_current";
  if (/metal.detector|gjt|dls|gls/.test(text)) return "metal_detection";
  if (/grid|drawer|trap|pipe|pipeline|filter|rod|bar|hump|clc|cbs|cgb|cqz|cxj|cyg|rcya|rcyf|rcyg|rcyz/.test(text)) return "filter";
  if (/wet.drum|ctn|cts|ctb|ctz|cgt|rct|dcx/.test(text)) return "wet_magnetic";
  if (/belt.high.gradient|hjlh|hjpc|gtc|tailing|clt|nct|wbc|ljk/.test(text)) return "high_gradient";
  if (/dry.drum|ctdg|hcg|dhd|dhj|ctq/.test(text)) return "dry_magnetic";
  if (/rcda|rcdb|rcde|electromagnetic/.test(text) && !/self|dumping|rcdc|rcdd|rcdf/.test(text)) return "electromagnetic_manual";
  if (/rcdc|rcdd|rcdf|self.cooling.self.dumping|self.cleaning.electromagnetic/.test(text)) return "electromagnetic_self_cleaning";
  if (/rcyp|rcyb|manual.iron.remover/.test(text)) return "permanent_manual";
  if (/overband|self.dumping|self.cleaning|rcyd|rcye|rcydii|rcps|rbcyd/.test(text)) return "permanent_self_cleaning";
  if (/suspended/.test(text)) return "permanent_manual";
  return "auxiliary";
}

function magnetType(kind) {
  return ({ permanent_manual: "permanent", permanent_self_cleaning: "permanent", electromagnetic_manual: "electromagnetic", electromagnetic_self_cleaning: "electromagnetic", wet_magnetic: "wet_magnetic", dry_magnetic: "dry_magnetic", high_gradient: "dry_magnetic", metal_detection: "metal_detection", eddy_current: "eddy_current", filter: "filter", auxiliary: "auxiliary" })[kind];
}

function cleaningMode(kind) {
  return ({ permanent_manual: "manual", permanent_self_cleaning: "self_cleaning", electromagnetic_manual: "manual", electromagnetic_self_cleaning: "self_cleaning" })[kind] || "not_applicable";
}

function sourceRows(product) {
  return (product.technicalSpecifications || []).filter((row) => row?.parameter && row?.value && !/available on request|to be confirmed|confirm by/i.test(`${row.parameter} ${row.value}`));
}

export function buildTruthCard(product) {
  const kind = productKind(product);
  const copy = TYPE_COPY[kind];
  const modelMatch = `${product.name} ${product.slug}`.match(MODEL_PATTERN);
  const verifiedSpecs = Object.fromEntries(sourceRows(product).map((row) => [row.parameter, row.value]));
  const sourceSections = product.sourceContent?.sections || [];
  const sourceOptions = sourceSections.find((section) => section.key === "options")?.items || [];
  return {
    productName: product.name,
    series: modelMatch ? modelMatch[1].toUpperCase() : product.name,
    model: modelMatch ? modelMatch[1].toUpperCase() : null,
    productType: copy.label,
    magnetType: magnetType(kind),
    cleaningMode: cleaningMode(kind),
    verifiedSpecs,
    pendingSpecs: FIELD_SETS[kind].filter((field) => !Object.keys(verifiedSpecs).some((key) => key.toLowerCase() === field.toLowerCase())),
    referenceOnlySpecs: {},
    applications: copy.applications,
    selectionInputs: copy.selection,
    allowedClaims: [copy.label, "Support for South African and African projects", "Final configuration is confirmed against project conditions"],
    prohibitedClaims: ["South African factory or office", "local stock", "local installation team", "guaranteed recovery or throughput", "unverified gauss, mT, price, certification, rating or inventory claim"],
    mediaIds: product.gallery || [],
    supplierConfirmed: false,
    contentSource: "COWIN MAGNET main-site public product record",
    sourceOptions,
    whatItHelpsSolve: copy.solves,
    maintenance: copy.maintenance,
    status: "Available subject to project and supplier confirmation"
  };
}

export function metaDescription(product, truth) {
  const summary = plainText(product.shortDescription || product.sourceContent?.hero?.summary || "");
  const prefix = `${product.name} for South African and African projects. `;
  return `${prefix}${summary}`.replace(/\s+/g, " ").slice(0, 158).replace(/[,:;\-\s]+$/, "") + ".";
}
