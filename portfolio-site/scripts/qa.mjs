#!/usr/bin/env node
/**
 * Release QA against a running build (`npm run build && npm run preview`).
 *
 *   node scripts/qa.mjs [--base http://localhost:4321] [--shots <dir>]
 *
 * - axe-core (WCAG 2.0/2.1/2.2 A + AA) on every route in light and dark at
 *   1280 and 375 wide, plus with the command palette, mobile menu, chart
 *   dialog and data table open;
 * - console errors, third-party requests, and load-time CLS per route;
 * - keyboard flows: skip link, palette, tabs, mobile menu, market filter,
 *   feed pause;
 * - reduced motion: no running CSS/Web animations after load;
 * - print: /resume fits in two pages;
 * - optional screenshots at 375/768/1280/1440 in both themes.
 *
 * Uses playwright-core with the system Chromium (PLAYWRIGHT_BROWSERS_PATH or
 * /opt/pw-browsers/chromium). Exits 1 on any failure.
 */
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";

const require = createRequire(import.meta.url);
const AXE = require.resolve("axe-core/axe.min.js");
const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : fallback;
};
const BASE = arg("--base", "http://localhost:4321");
const SHOTS = arg("--shots", null);
const EXEC = process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium";

const ROUTES = [
  "/",
  "/about",
  "/resume",
  "/evidence",
  "/projects",
  "/projects/ai-sql-optimizer",
  "/projects/fraud-signals",
  "/projects/telecom-lakehouse",
  "/visualizations#telecom",
  "/visualizations#fraud",
  "/visualizations#sqlopt",
  "/contact",
  "/contact/sent",
  "/this-page-does-not-exist",
];
const THEMES = ["light", "dark"];
const WIDTHS = [375, 768, 1280, 1440];
const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

const failures = [];
const fail = (msg) => {
  failures.push(msg);
  console.log(`  FAIL ${msg}`);
};
const ok = (msg) => console.log(`  ok   ${msg}`);

const browser = await chromium.launch({ executablePath: EXEC, args: ["--no-sandbox"] });

async function newPage({ theme = "light", width = 1280, reducedMotion = "no-preference" } = {}) {
  const ctx = await browser.newContext({
    viewport: { width, height: 900 },
    colorScheme: theme,
    reducedMotion,
    acceptDownloads: true,
  });
  await ctx.addInitScript((t) => {
    try {
      localStorage.setItem("theme", t);
    } catch {}
    window.__cls = 0;
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) if (!e.hadRecentInput) window.__cls += e.value;
    }).observe({ type: "layout-shift", buffered: true });
  }, theme);
  const page = await ctx.newPage();
  page.__errors = [];
  page.__thirdParty = [];
  page.on("pageerror", (e) => page.__errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") page.__errors.push(m.text());
  });
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (!["localhost", "127.0.0.1"].includes(u.hostname) && !u.protocol.startsWith("data")) page.__thirdParty.push(u.host);
  });
  return page;
}

/** Scroll the whole page so client:visible islands hydrate, then return to top. */
async function settle(page) {
  await page.waitForLoadState("networkidle");
  const h = await page.evaluate(() => document.body.scrollHeight);
  for (let y = 0; y < h; y += 600) {
    await page.evaluate((v) => window.scrollTo(0, v), y);
    await page.waitForTimeout(120);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(600);
}

async function axe(page, label, include) {
  await page.addScriptTag({ path: AXE });
  const res = await page.evaluate(
    async ({ tags, include }) => {
      const ctx = include ? { include: [include] } : document;
      const r = await window.axe.run(ctx, { runOnly: { type: "tag", values: tags }, resultTypes: ["violations"] });
      return r.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        nodes: v.nodes.slice(0, 4).map((n) => `${n.target.join(" ")} :: ${n.failureSummary?.split("\n")[1]?.trim() ?? ""}`),
        count: v.nodes.length,
      }));
    },
    { tags: AXE_TAGS, include },
  );
  if (res.length === 0) ok(`axe ${label}`);
  for (const v of res) {
    fail(`axe ${label}: ${v.id} (${v.impact}, ${v.count} nodes)`);
    v.nodes.forEach((n) => console.log(`         ${n}`));
  }
}

// --------------------------------------------------------------------------
console.log("\n# Routes: axe, console errors, third-party requests, CLS");
for (const theme of THEMES) {
  for (const route of ROUTES) {
    const page = await newPage({ theme });
    await page.goto(BASE + route, { waitUntil: "load" });
    await page.waitForTimeout(800);
    const cls = await page.evaluate(() => window.__cls);
    await settle(page);
    await axe(page, `${theme} ${route}`);
    if (cls >= 0.05) fail(`CLS ${theme} ${route}: ${cls.toFixed(3)}`);
    // The not-found route is served with HTTP 404 by design; Chromium logs that as a resource error.
    const errors = page.__errors.filter((e) => !(route.includes("does-not-exist") && /status of 404/.test(e)));
    if (errors.length) fail(`console ${theme} ${route}: ${errors.join(" | ")}`);
    if (page.__thirdParty.length) fail(`third-party ${theme} ${route}: ${[...new Set(page.__thirdParty)].join(", ")}`);
    await page.context().close();
  }
}

console.log("\n# Routes at phone width (375): axe");
for (const theme of THEMES) {
  for (const route of ROUTES) {
    const page = await newPage({ theme, width: 375 });
    await page.goto(BASE + route, { waitUntil: "load" });
    await settle(page);
    await axe(page, `${theme} 375 ${route}`);
    await page.context().close();
  }
}

// --------------------------------------------------------------------------
console.log("\n# Open states: axe");
for (const theme of THEMES) {
  // Command palette
  {
    const page = await newPage({ theme });
    await page.goto(BASE + "/", { waitUntil: "networkidle" });
    await page.keyboard.press("Control+k");
    await page.waitForSelector("dialog[open]");
    await page.keyboard.type("fraud");
    await page.waitForTimeout(200);
    await axe(page, `${theme} palette open`);
    await page.context().close();
  }
  // Mobile menu
  {
    const page = await newPage({ theme, width: 375 });
    await page.goto(BASE + "/", { waitUntil: "networkidle" });
    await page.click("[aria-controls][aria-expanded]:visible");
    await page.waitForTimeout(250);
    await axe(page, `${theme} mobile menu open`);
    await page.context().close();
  }
  // Chart dialog + visible data table
  {
    const page = await newPage({ theme });
    await page.goto(BASE + "/visualizations#telecom", { waitUntil: "networkidle" });
    await settle(page);
    const card = page.locator("#dash-panel-telecom [id^='tel-']").first();
    await card.locator("button", { hasText: "Show data" }).first().click();
    await page.waitForTimeout(300);
    await axe(page, `${theme} data table shown`);
    await card.locator("button", { hasText: "Expand" }).first().click();
    await page.waitForSelector("dialog[open]");
    await page.waitForTimeout(500);
    await axe(page, `${theme} chart dialog open`);
    await page.context().close();
  }
}

// --------------------------------------------------------------------------
console.log("\n# Keyboard");
{
  const page = await newPage();
  await page.goto(BASE + "/", { waitUntil: "networkidle" });

  await page.keyboard.press("Tab");
  const skip = await page.evaluate(() => document.activeElement?.textContent?.trim());
  /skip/i.test(skip ?? "") ? ok("first Tab lands on the skip link") : fail(`first Tab landed on "${skip}"`);
  await page.keyboard.press("Enter");
  const main = await page.evaluate(() => document.activeElement?.id || document.activeElement?.tagName);
  /main/i.test(main) ? ok("skip link moves focus to main") : fail(`skip link focus went to ${main}`);

  const opener = page.locator("button[data-cmdk-open]").first();
  await opener.focus();
  await page.keyboard.press("Enter");
  await page.waitForSelector("dialog[open]");
  await page.keyboard.type("evidence");
  await page.keyboard.press("ArrowDown");
  const active = await page.evaluate(() => document.querySelector("dialog[open] [role=combobox]")?.getAttribute("aria-activedescendant"));
  active ? ok("palette arrow keys set aria-activedescendant") : fail("palette has no active descendant after ArrowDown");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);
  const refocused = await page.evaluate(() => document.activeElement?.hasAttribute("data-cmdk-open"));
  refocused ? ok("palette Esc returns focus to opener") : fail("palette Esc did not return focus");

  await page.keyboard.press("Control+k");
  await page.waitForSelector("dialog[open]");
  await page.keyboard.type("evidence ledger");
  await page.waitForTimeout(150);
  await page.keyboard.press("Enter");
  await page.waitForURL(/\/evidence/, { timeout: 5000 }).then(
    () => ok("palette Enter navigates"),
    () => fail("palette Enter did not navigate"),
  );
  await page.context().close();
}
{
  const page = await newPage({ width: 375 });
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  const toggle = page.locator("[aria-controls][aria-expanded]:visible").first();
  await toggle.click();
  const expanded = await toggle.getAttribute("aria-expanded");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);
  const closed = (await toggle.getAttribute("aria-expanded")) === "false";
  const back = await toggle.evaluate((el) => el === document.activeElement);
  expanded === "true" && closed && back ? ok("mobile menu opens, Esc closes and refocuses") : fail(`mobile menu: expanded=${expanded} closed=${closed} refocus=${back}`);
  await page.context().close();
}
{
  const page = await newPage();
  await page.goto(BASE + "/visualizations", { waitUntil: "networkidle" });
  await page.focus("#dash-tab-telecom");
  await page.keyboard.press("ArrowRight");
  const sel = await page.getAttribute("#dash-tab-fraud", "aria-selected");
  const focused = await page.evaluate(() => document.activeElement?.id);
  sel === "true" && focused === "dash-tab-fraud" ? ok("dashboard tabs: ArrowRight selects and focuses next") : fail(`tabs: selected=${sel} focus=${focused}`);
  await page.keyboard.press("End");
  const last = await page.evaluate(() => document.activeElement?.id);
  last === "dash-tab-sqlopt" ? ok("dashboard tabs: End moves to last tab") : fail(`tabs End focus=${last}`);
  (new URL(page.url()).hash === "#sqlopt") ? ok("tab selection syncs the URL hash") : fail(`hash is ${new URL(page.url()).hash}`);

  await page.click("#dash-tab-telecom");
  await settle(page);
  const select = page.locator("#dash-panel-telecom select").first();
  const before = await page.locator("#dash-panel-telecom").innerText();
  await select.focus();
  await select.selectOption({ index: 1 });
  await page.waitForTimeout(500);
  const after = await page.locator("#dash-panel-telecom").innerText();
  before !== after ? ok("market filter select updates the dashboard") : fail("market filter select changed nothing");
  await page.context().close();
}
{
  const page = await newPage();
  await page.goto(BASE + "/projects/fraud-signals", { waitUntil: "networkidle" });
  await settle(page);
  // The replay toggle is a button whose label flips between Pause and Play.
  const toggle = page.locator("button", { hasText: /^(Pause|Play) event replay$/ }).first();
  if ((await toggle.count()) === 0) {
    fail("fraud feed: no play/pause control found");
  } else {
    await toggle.scrollIntoViewIfNeeded();
    const before = (await toggle.innerText()).replace(/\s+/g, " ").trim();
    await toggle.focus();
    await page.keyboard.press("Enter");
    await page.waitForTimeout(250);
    const after = (await toggle.innerText()).replace(/\s+/g, " ").trim();
    before !== after ? ok(`feed replay toggles with the keyboard (${before} → ${after})`) : fail(`feed toggle label stayed "${after}"`);
  }
  await page.context().close();
}

// --------------------------------------------------------------------------
console.log("\n# Reduced motion");
for (const route of ["/", "/projects/fraud-signals", "/projects/telecom-lakehouse"]) {
  const page = await newPage({ reducedMotion: "reduce" });
  await page.goto(BASE + route, { waitUntil: "networkidle" });
  await settle(page);
  const running = await page.evaluate(
    () => document.getAnimations().filter((a) => a.playState === "running" && (a.effect?.getTiming().iterations ?? 1) === Infinity).length,
  );
  running === 0 ? ok(`reduced motion ${route}: no infinite animations running`) : fail(`reduced motion ${route}: ${running} infinite animations running`);
  await page.context().close();
}

// --------------------------------------------------------------------------
console.log("\n# Print");
{
  const page = await newPage();
  await page.goto(BASE + "/resume", { waitUntil: "networkidle" });
  await page.emulateMedia({ media: "print" });
  const pdf = await page.pdf({ format: "Letter", printBackground: false });
  const pages = (pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
  pages <= 2 ? ok(`/resume prints on ${pages} page(s)`) : fail(`/resume prints on ${pages} pages`);
  await page.context().close();
}

// --------------------------------------------------------------------------
if (SHOTS) {
  console.log(`\n# Screenshots → ${SHOTS}`);
  mkdirSync(SHOTS, { recursive: true });
  for (const theme of THEMES) {
    for (const width of WIDTHS) {
      for (const route of ROUTES) {
        const page = await newPage({ theme, width });
        await page.goto(BASE + route, { waitUntil: "networkidle" });
        await settle(page);
        await page.waitForTimeout(1200);
        const name = (route.replace(/[/#]+/g, "-").replace(/^-|-$/g, "") || "home") + `-${theme}-${width}.png`;
        await page.screenshot({ path: `${SHOTS}/${name}`, fullPage: true });
        await page.context().close();
      }
    }
  }
  ok("screenshots written");
}

await browser.close();
console.log(failures.length ? `\nqa: ${failures.length} failure(s)` : "\nqa: all checks passed");
process.exit(failures.length ? 1 : 0);
