import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const path = join(process.cwd(), "en-za", "index.html");
let html = await readFile(path, "utf8");
const replacement = new Map([
  ["/en-za/products/suspended-and-self-unloading-iron-removers/", ["/assets/images/application/mining-conveyor-tramp-iron-protection.webp", "Illustrative conveyor tramp-iron protection context"]],
  ["/en-za/products/magnetic-separation-equipment/", ["/assets/images/application/coal-wash-plant-wet-magnetic-separation.webp", "Illustrative wet magnetic separation process context"]],
  ["/en-za/products/metal-detection-and-recycling-sorting/", ["/assets/images/application/recycling-eddy-current-metal-recovery.webp", "Illustrative recycling sorting and metal-detection context"]],
  ["/en-za/products/magnetic-components-and-filters/", ["/assets/images/application/process-pipeline-magnetic-filtration.webp", "Illustrative process magnetic-filtration context"]],
  ["/en-za/products/industry-application-equipment/", ["/assets/images/application/mineral-screening-control-environment.webp", "Illustrative mineral screening and equipment-support context"]],
  ["/en-za/industries/mining-and-mineral-processing/", ["/assets/images/application/mineral-screening-control-environment.webp", "Illustrative mining and mineral-processing context"]],
  ["/en-za/industries/coal-handling-and-washing/", ["/assets/images/application/coal-wash-plant-wet-magnetic-separation.webp", "Illustrative coal handling and wet magnetic separation context"]],
  ["/en-za/industries/mining/", ["/assets/images/product-permanent-overband-magnet.webp", "COWIN magnetic separator equipment for conveyor protection"]],
  ["/en-za/solutions/conveyor-protection/", ["/assets/images/application/mining-conveyor-tramp-iron-protection.webp", "Illustrative conveyor protection context"]],
  ["/en-za/solutions/non-ferrous-metal-recovery/", ["/assets/images/application/recycling-eddy-current-metal-recovery.webp", "Illustrative non-ferrous recovery context"]],
  ["/en-za/solutions/tramp-iron-removal/", ["/assets/images/product-permanent-overband-magnet.webp", "COWIN overband magnetic separator equipment"]],
  ["/en-za/solutions/crusher-protection/", ["/assets/images/application-quarry-aggregate.webp", "Illustrative quarry crusher-protection context"]],
  ["/en-za/solutions/conveyor-belt-protection/", ["/assets/images/application-port-bulk-handling.webp", "Illustrative bulk-conveyor protection context"]],
  ["/en-za/solutions/ferrous-metal-recovery/", ["/assets/images/application-recycling-separation.webp", "Illustrative ferrous recovery context"]]
]);

for (const [href, [src, alt]] of replacement) {
  const expression = new RegExp(`(<a class='card' href='${href.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}'>\\s*<img src=')[^']+(' alt=')[^']+(')`, "g");
  html = html.replace(expression, `$1${src}$2${alt}$3`);
}
html = html.replace('src="/assets/images/hero-mining-conveyor-magnet.webp" alt="Cowinmagnet project support"', 'src="/assets/images/application/mineral-screening-control-environment.webp" alt="Illustrative industrial project-support context"');
await writeFile(path, html);
console.log(`Updated contextual card imagery on ${path}.`);
