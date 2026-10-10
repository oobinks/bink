// One-off: renders the SVG app icon to the PNG sizes phones need.
// Usage: node scripts/make-icons.mjs  (needs Playwright; icons are already committed)
import { chromium } from 'playwright';
import fs from 'node:fs';

const svg = fs.readFileSync('web/public/icons/favicon.svg', 'utf8');
const browser = await chromium.launch();
const page = await browser.newPage();
const sizes = [
  ['icon-192.png', 192, false], ['icon-512.png', 512, false],
  ['apple-touch-icon.png', 180, true], ['icon-512-maskable.png', 512, true],
];
for (const [name, size, fullBleed] of sizes) {
  // Full-bleed versions have square corners (the phone rounds them itself).
  const art = fullBleed ? svg.replace('rx="112"', 'rx="0"') : svg;
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${art.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
  await page.screenshot({ path: `web/public/icons/${name}`, omitBackground: true });
}
await browser.close();
