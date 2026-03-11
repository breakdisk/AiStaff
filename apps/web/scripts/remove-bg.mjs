import sharp from "sharp";
import { readFileSync, writeFileSync } from "fs";

const input  = "public/logo.png";
const output = "public/logo.png";

const { data, info } = await sharp(input)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

// Walk every pixel — set near-white pixels to transparent
for (let i = 0; i < data.length; i += 4) {
  const r = data[i];
  const g = data[i + 1];
  const b = data[i + 2];
  if (r > 235 && g > 235 && b > 235) {
    data[i + 3] = 0; // fully transparent
  }
}

await sharp(data, {
  raw: { width: info.width, height: info.height, channels: 4 },
})
  .png()
  .toFile(output);

console.log(`Done — white background removed from ${output}`);
