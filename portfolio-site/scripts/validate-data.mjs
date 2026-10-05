#!/usr/bin/env node
/**
 * Content and data guardrails, run in CI (npm run validate):
 *  1. no hard-coded colors in components/pages/layouts — tokens only
 *     (viz/theme.ts keeps documented fallbacks and is exempt);
 *  2. no phrases this site has retracted (overclaims fixed in v0.2.0);
 *  3. every metric("id") referenced in source exists in measured.json, and
 *     the site/project metric lists agree with the metrics map;
 *  4. the corpus / dbt fixtures still match the counts the copy relies on.
 * Exits non-zero with a list of problems.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const src = join(root, "src");
const problems = [];

function walk(dir, exts, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, exts, out);
    else if (exts.some((e) => p.endsWith(e))) out.push(p);
  }
  return out;
}
const rel = (p) => relative(root, p);

// 1. colors -----------------------------------------------------------------
const colorRe = /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b(?![0-9a-zA-Z-])|\brgba?\(\s*\d/;
for (const dir of ["components", "pages", "layouts"]) {
  for (const file of walk(join(src, dir), [".astro", ".tsx", ".ts"])) {
    if (file.endsWith(join("viz", "theme.ts"))) continue;
    readFileSync(file, "utf8").split("\n").forEach((line, i) => {
      // <meta name="theme-color"> needs literal colors; nothing else may.
      if (line.includes("theme-color") || line.includes('"#0a0a0c" : "#fafafa"')) return;
      const code = line.replace(/https?:\/\/\S+/g, "").replace(/href=\{?["'`][^"'`]*#[^"'`]*["'`]/g, "");
      if (colorRe.test(code) && !/data-(hash|tabs)|#q\d|#[a-z]+-/.test(code.match(colorRe)?.[0] ?? "")) {
        problems.push(`${rel(file)}:${i + 1} hard-coded color: ${line.trim().slice(0, 100)}`);
      }
    });
  }
}

// 2. retracted claims ----------------------------------------------------------
const banned = [
  "Azure AI Engineering",
  "1.2 B rows",
  "~1.2 B",
  "EXPLAIN runner executes",
  "estimated_cost_reduction",
  "win rate",
  "1,000-event fixture",
  "implemented in PySpark with a watermarked window",
];
for (const file of walk(src, [".astro", ".tsx", ".ts", ".mdx", ".json"])) {
  // The Cloudflare Worker is a separately deployed, not-yet-configured stub
  // (tracked as a follow-up); it isn't part of the site build.
  if (file.includes(join("src", "workers"))) continue;
  const text = readFileSync(file, "utf8");
  for (const phrase of banned) {
    if (text.includes(phrase)) problems.push(`${rel(file)} contains retracted phrase "${phrase}"`);
  }
}

// 3. metric ids -------------------------------------------------------------------
const measured = JSON.parse(readFileSync(join(src, "data", "measured.json"), "utf8"));
const ids = new Set(Object.keys(measured.metrics ?? {}));
for (const file of walk(src, [".astro", ".tsx", ".ts", ".mdx"])) {
  for (const m of readFileSync(file, "utf8").matchAll(/metric\(\s*["']([\w.]+)["']\s*\)/g)) {
    if (!ids.has(m[1])) problems.push(`${rel(file)} references unknown metric "${m[1]}"`);
  }
}
const lists = [...measured.site, ...Object.values(measured.projects).flatMap((p) => p.metrics)];
for (const m of lists) {
  const canon = measured.metrics[m.id];
  if (!canon) problems.push(`measured.json: listed metric "${m.id}" missing from metrics map`);
  else if (canon.value !== m.value) problems.push(`measured.json: "${m.id}" value differs between lists`);
}

// 4. fixture invariants the copy relies on -----------------------------------------
const corpus = JSON.parse(readFileSync(join(src, "data", "sqlopt", "corpus.json"), "utf8"));
if (corpus.queries.length !== measured.evaluations["ai-sql-optimizer"].summary.queries)
  problems.push("sqlopt corpus size disagrees with measured.json");
const dbt = JSON.parse(readFileSync(join(src, "data", "lakehouse", "dbt.json"), "utf8"));
const tl = measured.evaluations["telecom-lakehouse"];
if (dbt.testCount !== tl.dbt.tests) problems.push(`dbt.json declares ${dbt.testCount} tests, dbt build ran ${tl.dbt.tests}`);
if (dbt.models.length !== tl.dbt.models) problems.push("dbt model count disagrees with measured run");

if (problems.length) {
  console.error(`validate-data: ${problems.length} problem(s)\n  ` + problems.join("\n  "));
  process.exit(1);
}
console.log(`validate-data: ok (${ids.size} metrics, ${corpus.queries.length} corpus queries, ${dbt.testCount} dbt tests)`);
