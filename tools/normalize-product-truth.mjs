import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const path = join(process.cwd(), "data/products/products.json");

function classify(product) {
  const text = `${product.slug} ${product.name}`.toLowerCase();
  if (/(eddy|hecp|hecs)/.test(text)) return "eddy-current";
  if (/(metal.detector|gjt|dls|gls)/.test(text)) return "metal-detector";
  if (/head.pulley/.test(text)) return "magnetic-head-pulley";
  if (/(wet.drum|ctn|cts|ctb|ctz|cgt|rct|qcg|dcx)/.test(text)) return "wet-magnetic-separator";
  if (/(dry.drum|ctdg|hcg|dhd|dhj|ctq)/.test(text)) return "dry-magnetic-separator";
  if (/(grid|drawer|trap|pipe|pipeline|filter|rod|bar|hump|clc|cbs|cgb|cqz|cxj|cyg|rcya|rcyf|rcyg|rcyz)/.test(text)) return "magnetic-filter";
  if (/(rcda|rcdb|rcdc|rcdd|rcde|rcdf|electromagnetic)/.test(text)) return /(self.dumping|self.cleaning|rcdc|rcdd|rcdf)/.test(text) ? "electromagnetic-overband" : "suspended-electromagnetic";
  if (/(overband|self.dumping|self.cleaning|rcyd|rcye|rcydii|rcps|rbcyd)/.test(text)) return "permanent-overband";
  if (/(suspended|rcyb|manual.iron.remover)/.test(text)) return "suspended-permanent";
  if (/(lifting.magnet|rbcdb|rbcdd)/.test(text)) return "lifting-or-special";
  return "general-magnetic-equipment";
}

function specifications(name, fields) {
  return fields.map(([parameter, value], index) => ({
    group: "Selection data",
    parameter,
    value,
    unit: "",
    sortOrder: (index + 1) * 10,
    language: "en-za",
    visible: true
  })).concat({
    group: "Selection data",
    parameter: "Model confirmation",
    value: name,
    unit: "",
    sortOrder: (fields.length + 1) * 10,
    language: "en-za",
    visible: true
  });
}

function profile(product) {
  const family = classify(product);
  const base = {
    productFamily: family,
    type: "component",
    cleaning: "project-specific",
    layout: "process-specific",
    applications: ["Industrial material handling"],
    workingPrinciple: "The verified product configuration is selected according to the actual process, material stream and installation conditions.",
    installationOptions: ["Confirm process position", "Confirm installation space and maintenance access"],
    optionalConfigurations: ["Available on request after engineering review"],
    operatingConditions: "Confirm material, process, installation and environmental conditions before quotation.",
    technicalSpecifications: specifications(product.name, [["Application data required", "Process and installation conditions"], ["Configuration status", "Available on request"]])
  };
  const profiles = {
    "suspended-permanent": {
      type: "permanent", cleaning: "manual", layout: "cross-belt or inline (confirm)", applications: ["Mining conveyors", "Coal handling", "Aggregates and bulk handling"],
      workingPrinciple: "A suspended permanent magnetic circuit attracts ferrous tramp material from the conveyor stream. Cleaning is planned according to the selected manual arrangement.",
      installationOptions: ["Cross-belt or inline position", "Suspended above conveyor", "Manual-cleaning access"],
      optionalConfigurations: ["Mounting arrangement", "Housing and surface protection", "Outdoor or corrosion review"],
      technicalSpecifications: specifications(product.name, [["Magnetic system", "Permanent magnetic circuit"], ["Cleaning arrangement", "Manual; confirm by model"], ["Installation orientation", "Cross-belt or inline; confirm by project"], ["Suspension height", "Available on request"], ["Belt width and burden depth", "Required for selection"], ["Housing and surface protection", "Available on request"]])
    },
    "permanent-overband": {
      type: "permanent", cleaning: "self-cleaning", layout: "overband or inline (confirm)", applications: ["Mining conveyors", "Coal handling", "Quarrying and bulk handling"],
      workingPrinciple: "A permanent magnetic circuit attracts ferrous tramp material and the selected discharge belt removes collected iron from the working zone.",
      installationOptions: ["Overband or inline position", "Discharge path review", "Access for belt and drive maintenance"],
      optionalConfigurations: ["Discharge belt and drive configuration", "Outdoor and corrosion protection"],
      technicalSpecifications: specifications(product.name, [["Magnetic system", "Permanent magnetic circuit"], ["Cleaning method", "Self-cleaning discharge belt"], ["Conveyor width and burden depth", "Required for selection"], ["Suspension height", "Available on request"], ["Belt speed and duty", "Required for selection"], ["Drive configuration", "Available on request"]])
    },
    "suspended-electromagnetic": {
      type: "electromagnetic", cleaning: "manual", layout: "cross-belt or inline (confirm)", applications: ["Mining conveyors", "Coal handling", "Bulk material handling"],
      workingPrinciple: "An energized electromagnetic system attracts ferrous contaminants from the material stream. Coil, control and cooling requirements are confirmed only for the selected model.",
      installationOptions: ["Cross-belt or inline position", "Electrical supply confirmation", "Cooling and maintenance clearance"],
      optionalConfigurations: ["Electrical control arrangement", "Cooling configuration by model", "Outdoor and dust protection"],
      technicalSpecifications: specifications(product.name, [["Magnetic system", "Electromagnetic; confirm by model"], ["Cleaning arrangement", "Manual; confirm by model"], ["Input power and coil", "Available on request"], ["Cooling configuration", "Available on request"], ["Control arrangement", "Available on request"], ["Electrical supply", "Confirm site voltage and frequency"]])
    },
    "electromagnetic-overband": {
      type: "electromagnetic", cleaning: "self-cleaning", layout: "overband or inline (confirm)", applications: ["Mining conveyors", "Coal handling", "Heavy-duty bulk material handling"],
      workingPrinciple: "An energized electromagnetic system attracts ferrous contaminants and the selected self-cleaning belt removes collected iron from the magnetic zone.",
      installationOptions: ["Overband or inline position", "Electrical supply confirmation", "Cooling and drive maintenance access"],
      optionalConfigurations: ["Discharge belt and drive configuration", "Cooling configuration by model", "Electrical protection arrangement"],
      technicalSpecifications: specifications(product.name, [["Magnetic system", "Electromagnetic; confirm by model"], ["Cleaning method", "Self-cleaning discharge belt"], ["Input power, coil and cooling", "Available on request"], ["Control arrangement", "Available on request"], ["Electrical supply", "Confirm site voltage and frequency"], ["Drive configuration", "Available on request"]])
    },
    "wet-magnetic-separator": {
      type: "wet magnetic separation", cleaning: "process-specific", layout: "wet process flow", applications: ["Mineral processing", "Ore concentration", "Tailings recovery"],
      workingPrinciple: "A magnetic drum or wet magnetic circuit separates magnetic material from slurry through the selected tank and material-flow arrangement.",
      installationOptions: ["Process flow integration", "Feed and discharge review", "Water and maintenance access"],
      optionalConfigurations: ["Drum size and tank type", "Magnetic circuit configuration", "Feed and discharge arrangement"],
      technicalSpecifications: specifications(product.name, [["Separator type", "Wet magnetic separation; confirm by model"], ["Drum diameter and length", "Available on request"], ["Tank type", "Available on request"], ["Magnetic circuit arrangement", "Available on request"], ["Feed particle-size range", "Required for selection"], ["Slurry conditions", "Required for selection"], ["Process capacity", "Available on request"]])
    },
    "dry-magnetic-separator": {
      type: "dry magnetic separation", cleaning: "process-specific", layout: "dry process flow", applications: ["Mineral processing", "Dry pre-concentration", "Material recovery"],
      workingPrinciple: "The selected dry magnetic circuit separates material according to magnetic response, particle size and the verified feed arrangement.",
      installationOptions: ["Feed preparation review", "Dust control review", "Discharge and maintenance access"],
      optionalConfigurations: ["Feed arrangement", "Magnetic circuit configuration", "Dust and outdoor protection"],
      technicalSpecifications: specifications(product.name, [["Separator type", "Dry magnetic separation; confirm by model"], ["Magnetic circuit arrangement", "Available on request"], ["Feed particle-size range", "Required for selection"], ["Feed moisture", "Required for selection"], ["Process capacity", "Available on request"], ["Installation and dust review", "Required for selection"]])
    },
    "eddy-current": {
      type: "eddy current separation", cleaning: "automatic", layout: "conveyor process", applications: ["Recycling and material recovery", "Non-ferrous metal sorting"],
      workingPrinciple: "A high-speed rotor induces a separating effect in suitable non-ferrous material, while the splitter setting and feed presentation are selected for the actual stream.",
      installationOptions: ["Prepared feed presentation", "Splitter adjustment review", "Dust control and maintenance access"],
      optionalConfigurations: ["Rotor configuration", "Belt width", "Splitter and feed arrangement"],
      technicalSpecifications: specifications(product.name, [["Separation target", "Non-ferrous material; confirm by feed"], ["Rotor configuration", "Available on request"], ["Belt width", "Available on request"], ["Feed particle-size range", "Required for selection"], ["Splitter adjustment", "Available on request"], ["Throughput", "Available on request"]])
    },
    "metal-detector": {
      type: "metal detection", cleaning: "alarm or reject interface", layout: "conveyor process", applications: ["Crusher protection", "Quarrying and aggregates", "Coal handling"],
      workingPrinciple: "The detector monitors the material stream through the selected aperture and provides the specified alarm or process interface when metal is detected.",
      installationOptions: ["Conveyor integration", "Aperture confirmation", "Alarm or reject interface review"],
      optionalConfigurations: ["Aperture size", "Alarm and integration interface", "Environmental protection configuration"],
      technicalSpecifications: specifications(product.name, [["Detection aperture", "Available on request"], ["Sensitivity application range", "Confirm target metal and material conditions"], ["Conveyor integration", "Required for selection"], ["Alarm or reject interface", "Available on request"], ["Environmental limits", "Available on request"], ["Electrical supply", "Confirm site requirements"]])
    },
    "magnetic-head-pulley": {
      type: "permanent magnetic pulley", cleaning: "continuous", layout: "conveyor head position", applications: ["Recycling and material recovery", "Mining conveyors", "Coal handling"],
      workingPrinciple: "The magnetic pulley separates ferrous material as the conveyed stream passes around the head pulley, creating separate material trajectories.",
      installationOptions: ["Conveyor head position", "Pulley and shaft integration", "Guarding and maintenance access"],
      optionalConfigurations: ["Pulley dimensions", "Magnetic circuit configuration", "Shaft and bearing interface"],
      technicalSpecifications: specifications(product.name, [["Magnetic system", "Permanent magnetic pulley; confirm by model"], ["Pulley diameter and face width", "Available on request"], ["Shaft and bearing interface", "Available on request"], ["Conveyor belt and speed", "Required for selection"], ["Material size and magnetic fraction", "Required for selection"], ["Discharge arrangement", "Required for selection"]])
    },
    "magnetic-filter": {
      type: "magnetic component or filter", cleaning: "manual or automatic by model", layout: "gravity, pneumatic or pipeline process", applications: ["Bulk material handling", "Mineral processing", "Recycling"],
      workingPrinciple: "The material passes through a selected magnetic element arrangement that captures ferrous contamination. The housing and cleaning method depend on the verified model.",
      installationOptions: ["Gravity, pneumatic or pipeline integration", "Connection review", "Access for cleaning"],
      optionalConfigurations: ["Magnetic element arrangement", "Housing and connection configuration", "Manual or automatic cleaning by model"],
      technicalSpecifications: specifications(product.name, [["Installation type", "Confirm gravity, pneumatic or pipeline process"], ["Magnetic element arrangement", "Available on request"], ["Connection or housing dimensions", "Available on request"], ["Material flow conditions", "Required for selection"], ["Cleaning method", "Confirm by model"], ["Temperature and pressure limits", "Available on request"]])
    }
  };
  return { ...base, ...(profiles[family] || {}) };
}

const products = JSON.parse((await readFile(path, "utf8")).replace(/^\uFEFF/, ""));
let updated = 0;
for (const product of products) {
  const normalized = profile(product);
  Object.assign(product, normalized, {
    truthCardStatus: "needs-engineering-review",
    truthCardUpdatedAt: new Date().toISOString(),
    dataProvenance: product.sourceUrl ? "main-site-product-sync; local truth normalization" : "local catalogue; local truth normalization"
  });
  updated += 1;
}
await writeFile(path, `${JSON.stringify(products, null, 2)}\n`);
const familyCounts = Object.fromEntries(Object.entries(Object.groupBy(products, (product) => product.productFamily)).map(([family, items]) => [family, items.length]));
console.log(JSON.stringify({ updated, familyCounts }, null, 2));
