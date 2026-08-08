import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const source = path.resolve(process.argv[2] || "");
const ignoredDirectories = new Set([".git", ".next", ".deploy-tools", "node_modules", "data"]);
const textExtensions = new Set([".html", ".js", ".ps1"]);
const brandAssetPath = "/assets/images/cowinmagnet-logo.png";
const faviconVersion = "20260808";

if (!process.argv[2]) {
  throw new Error("Usage: node tools/refresh-brand-assets.mjs <path-to-logo.png>");
}

async function walk(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) files.push(...await walk(path.join(directory, entry.name)));
      continue;
    }
    if (textExtensions.has(path.extname(entry.name))) files.push(path.join(directory, entry.name));
  }
  return files;
}

function removeCheckerboard(data, info) {
  const rgba = Buffer.alloc(info.width * info.height * 4);
  for (let input = 0, output = 0; input < data.length; input += info.channels, output += 4) {
    const red = data[input];
    const green = data[input + 1];
    const blue = data[input + 2];
    const maximum = Math.max(red, green, blue);
    const minimum = Math.min(red, green, blue);
    const saturation = maximum === 0 ? 0 : (maximum - minimum) / maximum;
    const isNeutralLightBackground = saturation < 0.1 && maximum > 170;
    rgba[output] = red;
    rgba[output + 1] = green;
    rgba[output + 2] = blue;
    rgba[output + 3] = isNeutralLightBackground ? 0 : 255;
  }
  return rgba;
}

function transparentCanvas(size) {
  return { r: 255, g: 255, b: 255, alpha: 0 };
}

async function writeIco(images, destination) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  const entries = [];
  let offset = 6 + images.length * 16;
  for (const image of images) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(image.size === 256 ? 0 : image.size, 0);
    entry.writeUInt8(image.size === 256 ? 0 : image.size, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(image.buffer.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    offset += image.buffer.length;
  }
  await fs.writeFile(destination, Buffer.concat([header, ...entries, ...images.map((image) => image.buffer)]));
}

async function main() {
  await fs.access(source);
  const { data, info } = await sharp(source).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const cleaned = sharp(removeCheckerboard(data, info), {
    raw: { width: info.width, height: info.height, channels: 4 }
  }).trim({ background: transparentCanvas(1) });

  const brandOutput = path.join(root, "assets", "images", "cowinmagnet-logo.png");
  const brandLogo = cleaned.clone().extend({
    top: 36,
    bottom: 36,
    left: 36,
    right: 36,
    background: transparentCanvas(1)
  });
  await brandLogo.clone().png().toFile(brandOutput);

  const iconSource = await cleaned.clone()
    .resize(448, 448, { fit: "contain", background: transparentCanvas(448) })
    .extend({ top: 32, bottom: 32, left: 32, right: 32, background: transparentCanvas(512) })
    .png()
    .toBuffer();
  const icon = sharp(iconSource);
  const publicDirectory = path.join(root, "public");
  await icon.clone().resize(512, 512).png().toFile(path.join(publicDirectory, "icon-512.png"));
  await icon.clone().resize(192, 192).png().toFile(path.join(publicDirectory, "icon-192.png"));
  await icon.clone().resize(180, 180).png().toFile(path.join(publicDirectory, "apple-touch-icon.png"));
  await icon.clone().resize(32, 32).png().toFile(path.join(publicDirectory, "favicon-32x32.png"));
  await writeIco(await Promise.all([16, 32, 48].map(async (size) => ({
    size,
    buffer: await icon.clone().resize(size, size).png().toBuffer()
  }))), path.join(publicDirectory, "favicon.ico"));

  let changedFiles = 0;
  for (const file of await walk(root)) {
    let contents = await fs.readFile(file, "utf8");
    const original = contents;
    contents = contents.replaceAll("/assets/images/cowinmagnet-logo.jpg", brandAssetPath);
    contents = contents.replaceAll("href='/favicon.ico'", `href='/favicon.ico?v=${faviconVersion}'`);
    contents = contents.replaceAll('href="/favicon.ico"', `href="/favicon.ico?v=${faviconVersion}"`);
    contents = contents.replaceAll("href='/favicon-32x32.png'", `href='/favicon-32x32.png?v=${faviconVersion}'`);
    contents = contents.replaceAll('href="/favicon-32x32.png"', `href="/favicon-32x32.png?v=${faviconVersion}"`);
    contents = contents.replaceAll("href='/apple-touch-icon.png'", `href='/apple-touch-icon.png?v=${faviconVersion}'`);
    contents = contents.replaceAll('href="/apple-touch-icon.png"', `href="/apple-touch-icon.png?v=${faviconVersion}"`);
    if (contents !== original) {
      await fs.writeFile(file, contents, "utf8");
      changedFiles += 1;
    }
  }

  console.log(`Brand asset created: ${path.relative(root, brandOutput)}`);
  console.log(`Text files updated: ${changedFiles}`);
}

await main();
