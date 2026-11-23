// Renders the SVGs to PNG with the bundled Chromium.
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
import { readFileSync } from "node:fs";
const jobs = JSON.parse(process.argv[2]);
const browser = await chromium.launch();
const page = await browser.newPage();
for (const [src, out, size, bg] of jobs) {
  const svg = readFileSync(src, "utf8");
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:${bg ?? "transparent"}"><div style="width:${size}px;height:${size}px">${svg.replace("<svg ", `<svg width="${size}" height="${size}" `)}</div></body></html>`);
  await page.screenshot({ path: out, omitBackground: !bg, clip: { x: 0, y: 0, width: size, height: size } });
}
await browser.close();
