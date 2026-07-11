/**
 * Renders scripts/og-template.html to public/og-image.png (1200x630).
 *
 * Usage: node scripts/generate-og.mjs
 * Requires a Chromium binary; set CHROMIUM_PATH to override discovery.
 */
import { chromium } from "playwright-core";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { existsSync } from "node:fs";

const here = path.dirname(fileURLToPath(import.meta.url));
const template = path.join(here, "og-template.html");
const out = path.join(here, "..", "public", "og-image.png");

const executablePath =
  process.env.CHROMIUM_PATH ??
  ["/opt/pw-browsers/chromium", "/usr/bin/chromium", "/usr/bin/chromium-browser"].find(
    existsSync,
  );

const browser = await chromium.launch({ executablePath, args: ["--no-sandbox"] });
const page = await browser.newPage({
  viewport: { width: 1200, height: 630 },
  deviceScaleFactor: 2,
});
await page.goto(`file://${template}`, { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: out });
await browser.close();
console.log(`wrote ${out}`);
