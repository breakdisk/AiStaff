import sharp from "sharp";

const input  = "public/logo-original.png";
const output = "public/logo.png";

// Work from the original (white-bg) file
const { data, info } = await sharp(input)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

for (let i = 0; i < data.length; i += 4) {
  const r = data[i];
  const g = data[i + 1];
  const b = data[i + 2];

  // White / near-white background → fully transparent
  if (r > 230 && g > 230 && b > 230) {
    data[i]     = 0;
    data[i + 1] = 0;
    data[i + 2] = 0;
    data[i + 3] = 0;
    continue;
  }

  // Dark / charcoal pixels (logo text "AiStaff" + "Future Workforce") → white
  const isGreen = g > r + 30 && g > b + 20 && g > 80;
  if (!isGreen && r < 100 && g < 100 && b < 100) {
    data[i]     = 250; // zinc-50
    data[i + 1] = 250;
    data[i + 2] = 250;
    data[i + 3] = 255;
  }
  // Green elements stay untouched
}

await sharp(data, {
  raw: { width: info.width, height: info.height, channels: 4 },
})
  .png()
  .toFile(output);

console.log("Done — white bg removed, dark text → white, green preserved.");
