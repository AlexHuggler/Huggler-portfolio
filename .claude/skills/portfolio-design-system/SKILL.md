---
name: portfolio-design-system
description: The design system, honesty conventions, and measurement provenance rules for this portfolio monorepo. Read before changing any visual styling in portfolio-site/, adding metrics or claims anywhere in the repo, or restyling charts/diagrams.
---

# Portfolio Design System

This repo is a job-application portfolio aimed at hiring managers for data
engineering / BI / analytics roles. Every design and content decision serves
one goal: **credibility**. Premium visuals earn attention; honest, measured
numbers earn trust. Never trade the second for the first.

## Design tokens — single source of truth

All colors live as CSS custom properties in
`portfolio-site/src/styles/global.css`: light values on `:root`, dark
overrides on `:root.dark`, stored as space-separated RGB triplets so Tailwind
can compose alpha (`rgb(var(--color-accent) / 0.4)`).

- Tailwind maps semantic utilities onto them in `tailwind.config.mjs`
  (`bg`, `surface`, `surface-2`, `border`, `border-strong`, `fg`, `muted`,
  `accent`, `accent-fg`, `accent-2`, `success`, `warn`, `danger`).
- **Never hardcode a hex in a component.** Chart/diagram code reads the same
  tokens at runtime: `viz/theme.ts` (`getTokens`, `cssToken`) and
  `MermaidBlock.astro` both re-render live on theme toggle.
- The signature identity is the **blue → cyan gradient**
  (`--gradient-accent`): hero pipeline, card edges, nav wordmark, favicon,
  OG image. Use it sparingly — one signature element per page.
- `accent` is for fills/buttons; `accent-fg` is for text and links (it holds
  contrast on the page background). Don't swap them.

## Typography

- **Space Grotesk Variable** — display (h1–h3, wordmark, section headers).
- **Inter Variable** — body.
- **JetBrains Mono Variable** — code, kickers, chips, stat values, labels.
All via `@fontsource-variable/*`, imported at the top of `global.css`.

## Charts

Categorical series colors are the `--viz-series-1..6` tokens, validated per
mode with the dataviz six-checks validator (CVD separation, lightness band,
chroma floor, contrast) against the actual card surfaces (#111114 dark,
#ffffff light). If you change any series color, re-validate BOTH modes and
keep the slot order — the ordering is the CVD-safety mechanism.

All charts go through `viz/EChart.tsx` (tree-shaken ECharts): it provides
theme tracking, resize handling, and the visually-hidden table fallback.
Do not reintroduce a second chart library.

## Honesty conventions (non-negotiable)

- **Synthetic data is always labeled.** Demo charts carry a `.data-chip`
  ("Synthetic demo data · seed 42") with the full disclaimer in `title`.
  Never present synthetic numbers as production results.
- **Measured numbers have one source:** `portfolio-site/src/data/measured.json`
  (typed accessor `src/data/measured.ts`). Every value there was produced by
  running a project's make target; the method is recorded per metric. To
  change a number, re-measure — never hand-edit. Site copy cites measured
  figures only from this file, always with "measured on local synthetic
  load"-style provenance.
- Project READMEs keep unmeasured ambitions under explicit "not measured" /
  "Planned evaluation" headings rather than placeholder values.
- Real career numbers ($900K+/yr fraud-loss reduction, $2.2B portfolio) come
  from AT&T work and appear only in About/homepage narrative — do not
  attribute them to the demo projects.

## Accessibility bar (extend, never remove)

Skip link, `:focus-visible` outlines, `aria-current` nav state,
"opens in new tab" labels, `prefers-reduced-motion` honored in both CSS and
React (`useReducedMotion`), hidden table fallback for every chart, and the
static HeroPipeline diagram as the reduced-motion experience.

## Regenerating brand assets

- OG image: `node portfolio-site/scripts/generate-og.mjs`
- Favicon PNG set: `node portfolio-site/scripts/generate-icons.mjs`
Both render from the token palette; regenerate after any token change.

## Companion skill

`.claude/skills/frontend-design/` (vendored from anthropics/skills,
Apache-2.0) carries the general premium-design guidance; this file carries
the decisions already made for this repo. When they conflict, this file wins.
