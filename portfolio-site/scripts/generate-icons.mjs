/**
 * Renders public/favicon.svg to the PNG favicon set:
 * favicon-32.png, apple-touch-icon.png (180, solid background),
 * icon-192.png, icon-512.png.
 *
 * Usage: node scripts/generate-icons.mjs
 */
import { chromium } from "playwright-core";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { existsSync, readFileSync } from "node:fs";

const here = path.dirname(fileURLToPath(import.meta.url));
const pub = path.join(here, "..", "public");
const svg = readFileSync(path.join(pub, "favicon.svg"), "utf8");

const executablePath =
  process.env.CHROMIUM_PATH ??
  ["/opt/pw-browsers/chromium", "/usr/bin/chromium", "/usr/bin/chromium-browser"].find(
    existsSync,
  );

const sizes = [
  { size: 32, name: "favicon-32.png" },
  // iOS composites transparency onto black and rounds corners itself, so the
  // apple-touch icon gets a solid, full-bleed background.
  { size: 180, name: "apple-touch-icon.png", solid: true },
  { size: 192, name: "icon-192.png" },
  { size: 512, name: "icon-512.png" },
];

const browser = await chromium.launch({ executablePath, args: ["--no-sandbox"] });
const page = await browser.newPage();
for (const { size, name, solid } of sizes) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<style>body{margin:0;background:${solid ? "#0a0a0c" : "transparent"}}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
  );
  await page.screenshot({
    path: path.join(pub, name),
    omitBackground: !solid,
  });
  console.log(`wrote public/${name}`);
}
await browser.close();
