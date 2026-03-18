import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import toIco from "to-ico";

const rootDir = process.cwd();
const sourcePngPath = path.join(rootDir, "assets", "WhispARR new logo.png");
const buildDir = path.join(rootDir, "build");
const outputPngPath = path.join(buildDir, "icon.png");
const outputIcoPath = path.join(buildDir, "icon.ico");
const iconZoom = 1.7;

async function createZoomedSquarePng(size) {
  const source = sharp(sourcePngPath);
  const metadata = await source.metadata();
  const sourceWidth = metadata.width ?? size;
  const sourceHeight = metadata.height ?? size;
  const cropSize = Math.max(1, Math.round(Math.min(sourceWidth, sourceHeight) / iconZoom));
  const left = Math.max(0, Math.floor((sourceWidth - cropSize) / 2));
  const top = Math.max(0, Math.floor((sourceHeight - cropSize) / 2));

  return sharp(sourcePngPath)
    .extract({
      left,
      top,
      width: Math.min(cropSize, sourceWidth - left),
      height: Math.min(cropSize, sourceHeight - top)
    })
    .resize(size, size, { fit: "cover" })
    .png()
    .toBuffer();
}

await fs.mkdir(buildDir, { recursive: true });
await fs.writeFile(outputPngPath, await createZoomedSquarePng(512));

const iconSizes = [16, 32, 48, 64, 128, 256];
const pngBuffers = await Promise.all(
  iconSizes.map((size) => createZoomedSquarePng(size))
);

const icoBuffer = await toIco(pngBuffers);
await fs.writeFile(outputIcoPath, icoBuffer);

console.log(`Generated ${path.relative(rootDir, outputPngPath)} and ${path.relative(rootDir, outputIcoPath)}`);
