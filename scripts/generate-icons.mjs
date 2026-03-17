import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import toIco from "to-ico";

const rootDir = process.cwd();
const sourcePngPath = path.join(rootDir, "assets", "WhispARR Image.png");
const buildDir = path.join(rootDir, "build");
const outputPngPath = path.join(buildDir, "icon.png");
const outputIcoPath = path.join(buildDir, "icon.ico");

await fs.mkdir(buildDir, { recursive: true });
await fs.copyFile(sourcePngPath, outputPngPath);

const iconSizes = [16, 32, 48, 64, 128, 256];
const pngBuffers = await Promise.all(
  iconSizes.map((size) =>
    sharp(sourcePngPath)
      .resize(size, size, { fit: "cover" })
      .png()
      .toBuffer()
  )
);

const icoBuffer = await toIco(pngBuffers);
await fs.writeFile(outputIcoPath, icoBuffer);

console.log(`Generated ${path.relative(rootDir, outputPngPath)} and ${path.relative(rootDir, outputIcoPath)}`);
