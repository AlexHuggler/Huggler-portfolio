#!/usr/bin/env node
/**
 * Generates src/prompt.generated.ts from the versioned optimizer prompt in
 * project-ai-sql-optimizer/src/sql_optimizer/prompts/optimizer_prompt.md so
 * the Worker sends exactly the system prompt the CLI sends.
 *
 *   node scripts/generate-prompt.mjs           # (re)write the module
 *   node scripts/generate-prompt.mjs --check   # exit 1 if the module is stale
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const workerRoot = resolve(here, "..");
const repoRoot = resolve(workerRoot, "../../../..");
const sourcePath = resolve(
  repoRoot,
  "project-ai-sql-optimizer/src/sql_optimizer/prompts/optimizer_prompt.md",
);
const outPath = resolve(workerRoot, "src/prompt.generated.ts");

function render() {
  // Normalize line endings so the string matches what Python's text-mode
  // read() hands to the Anthropic SDK on every platform.
  const prompt = readFileSync(sourcePath, "utf8").replace(/\r\n?/g, "\n");
  const escaped = prompt
    .replace(/\\/g, "\\\\")
    .replace(/`/g, "\\`")
    .replace(/\$\{/g, "\\${");
  const source = relative(repoRoot, sourcePath).split("\\").join("/");
  return [
    "// GENERATED FILE - do not edit by hand.",
    `// Source: ${source}`,
    "// Regenerate with `npm run generate:prompt`; CI fails if this file is stale.",
    "",
    `export const OPTIMIZER_PROMPT = \`${escaped}\`;`,
    "",
  ].join("\n");
}

const expected = render();
const outRel = relative(workerRoot, outPath);

if (process.argv.includes("--check")) {
  const actual = existsSync(outPath) ? readFileSync(outPath, "utf8") : null;
  if (actual !== expected) {
    console.error(
      `${outRel} is stale relative to ${relative(workerRoot, sourcePath)}.\n` +
        "Run `npm run generate:prompt` in portfolio-site/src/workers/sql-optimizer-proxy and commit the result.",
    );
    process.exit(1);
  }
  console.log(`${outRel} is up to date.`);
} else {
  writeFileSync(outPath, expected);
  console.log(`Wrote ${outRel}.`);
}
