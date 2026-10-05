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
- **Never hardcode a hex or `rgba(` in a component.** Chart code reads the
  same tokens at runtime through `viz/theme.ts` (`getTokens`, `cssToken`) and
  re-renders on theme toggle via the shared observer in `viz/store.ts`.
  Diagrams (`diagrams/ArchitectureDiagram.astro`) are SVG styled with token
  classes. `npm run validate` fails the build on a hex or `rgba(` in
  components, pages or layouts (`viz/theme.ts` fallbacks excepted).
- The signature identity is the **blue → cyan gradient**
  (`--gradient-accent`). It appears on the nav wordmark plus **one** hero
  element per page, and in the favicon and OG image. Nowhere else.
- `accent` is for fills/buttons; `accent-fg` is for text and links (it holds
  contrast on the page background). Don't swap them.

### Token groups added in 0.2.0

| Group | Tokens | Use |
| --- | --- | --- |
| Type scale | `--step--1` … `--step-5` (fluid `clamp`) | `display-1/2`, `heading-1/2`, `lede`; Tailwind `text-step-*` |
| Elevation | `--shadow-1..3` (tinted by `--color-shadow`) | cards at rest, hover, dialogs |
| Motion | `--ease-out`, `--dur-1..3` | every transition; motion transitions are dropped under reduced motion |
| Tiers | `--tier-bronze/silver/gold` | medallion layers only |
| Secondary accent text | `--color-accent-2-fg` | cyan text that holds contrast |
| Code | `--shiki-*` | Shiki CSS-variables theme (set in `astro.config.mjs`) |

### Status vocabulary

`.status-chip[data-status]` is the one way to state what something is:
`measured` (re-measured, in `measured.json`), `implemented` (code exists, no
number), `stub` (code exists but is a placeholder), `needs-infra` (needs
Kafka/Spark/a warehouse to run), `planned` (not built), `defined` (a rule or
contract that exists but isn't enforced), `count` (a plain count), `career`
(a résumé figure). Status colours are reserved for these states and never
reused as chart series.

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

Wrap dashboard charts in `viz/ChartCard.tsx`: title, one-line **takeaway
computed from the data** (never a sentence written beside it), provenance
chip (`real` or `synthetic`), and the Show data / CSV / Expand / Copy link
actions. Mark specs follow the dataviz skill: one y-axis, bars at most 24px
with a 4px data-end radius, 2px lines, ringed markers, a legend for two or
more series, text in text tokens rather than series colours.

## Honesty conventions (non-negotiable)

- **Synthetic data is always labeled.** Demo charts carry a `.data-chip`
  ("Synthetic demo data · seed 42") with the full disclaimer in `title`.
  Never present synthetic numbers as production results.
- **Measured numbers have one source:** `portfolio-site/src/data/measured.json`
  (schema v2; typed accessor `src/data/measured.ts`: `metric(id)`,
  `projectMetrics()`, `evaluation()`, `allMetrics()`). Every value there was
  produced by running a project's make target; the method is recorded per
  metric. To change a number, re-measure — never hand-edit:
  - `npm run measure` (`scripts/measure.py run`) re-runs every project's make
    targets, stores transcripts in `src/data/measurements/`, runs the
    exporters in `scripts/artifacts/`, and exits non-zero if an exporter
    disagrees with its transcript.
  - `npm run measure:render` re-renders labels from stored evaluations via
    `scripts/measure_spec.py`. Edit wording there, not numbers.
  - MDX and components cite figures as `metric("fraud.geo.pr").value`;
    `npm run validate` fails on an unknown id.
- **Caveats travel with the number.** A metric with a known weakness (an
  upper-bound score, a detector with low precision) carries a `caveat`, and
  the stricter figure is shown beside it. Things that were never measured
  live in `notMeasured` and on `/evidence`, not as placeholders.
- **Scenario data** (`scripts/generate_viz_data.py`, seed 42) must use the
  projects' own rules and pass its self-checks; `npm run data:check` fails if
  the committed JSON drifts.
- Project READMEs keep unmeasured ambitions under explicit "not measured" /
  "Planned evaluation" headings rather than placeholder values.
- Real career numbers ($900K+/yr fraud-loss reduction, $2.2B portfolio) come
  from AT&T work (`src/data/experience.ts`, tagged `realized` or `projected`)
  and appear only on Home, About and Résumé — visibly separate from the
  reproducible numbers. Do not attribute them to the demo projects.
- Never publish the phone number from the résumé PDF.

## Accessibility bar (extend, never remove)

Skip link, `:focus-visible` outlines, `aria-current` nav state,
"opens in new tab" labels, `prefers-reduced-motion` honored in both CSS and
React (`useReducedMotion`), hidden table fallback for every chart, and the
static HeroPipeline diagram as the reduced-motion experience.

Since 0.2.0 also: one motion policy (`scripts/motion.ts` + `[data-motion]`,
`hooks/usePausable.ts`) that pauses off-screen, in hidden tabs and on user
request; ARIA tabs with roving focus (`scripts/tabs.ts`); a combobox command
palette on native `<dialog>` that returns focus to its opener; a single
polite toast region; and no `aria-live` on anything that updates faster than
every few seconds.

## Regenerating brand assets

- OG image: `node portfolio-site/scripts/generate-og.mjs`
- Favicon PNG set: `node portfolio-site/scripts/generate-icons.mjs`
Both render from the token palette; regenerate after any token change.

## Companion skill

`.claude/skills/frontend-design/` (vendored from anthropics/skills,
Apache-2.0) carries the general premium-design guidance; this file carries
the decisions already made for this repo. When they conflict, this file wins.
