# Changelog

All notable changes to the portfolio site. Versions follow `package.json`.

## 0.2.1 — 2026-10-05

Follows the SQL optimizer's live benchmark and EXPLAIN step (PR #16).

- **Statuses.** `benchmark --no-dry-run` (Claude in the benchmark) is now
  *implemented*, and `benchmark --explain spark|snowflake` is *needs-infra*.
  Neither has a recorded run, so the site adds no new numbers. Updated the
  capability list, evaluation panels, architecture lane, capability matrix
  and the not-measured reasons.
- **Re-measured** with `npm run measure` on a different container (CPU in
  `environmentDetail`):
  - SQL optimizer tests 18 → 43, all-project tests 44 → 69;
  - dry-run scores unchanged;
  - timings moved with the hardware: transform 0.32 s → 0.24 s, detector
    throughput ~100k/s → ~172k/s, analyzer latency 1.3 ms → 0.7 ms.
- The SQL stack list reads its test count from `measured.json` instead of
  hard-coding it.

## 0.2.0 — 2026-10-05

A credibility-first redesign. Every number on the site is re-measured from
the three projects, every demo runs on artifacts exported from them, and the
presentation moves from a template feel to an editorial one.

### Evidence and data

- **Measurement recorder.** `scripts/measure.py run` re-runs each project's
  own make targets, stores ANSI-stripped transcripts under
  `src/data/measurements/`, and cross-checks exporter output against them.
  `measure.py render` turns the stored evaluations into labels via
  `scripts/measure_spec.py`, so a label edit never involves typing a number.
- **`measured.json` v2** adds metric ids, `kind`, `caveat`, per-project
  evaluations (fraud precision/recall for all three detectors plus a threshold
  sweep; SQL per-category keyword scores plus a findings-only re-score;
  telecom transform timing) and a `notMeasured` list. `measured.ts` gains
  `metric(id)`, `evaluation()` and `allMetrics()`.
- **Artifact exporters** (`scripts/artifacts/*.py`, all with `--check`)
  export the real SQL corpus and analyzer findings, the fraud evaluation set
  and detector source, and the lakehouse DAGs, dbt graph, tests, expectations
  and masked sample rows.
- **Telecom scenario** (`scripts/generate_viz_data.py`) is now a labelled,
  self-checking simulation priced and aggregated with the lakehouse's own dbt
  rules. KPIs and charts share one ARPU definition, and churn uses the
  `churn_signals` thresholds.
- **Honest relabels.** The SQL keyword-overlap score is shown as an upper
  bound next to its findings-only re-score; velocity-detector precision
  (0.26) is published with its sweep; claims about an EXPLAIN runner, a
  1.2 B-row lakehouse and PySpark detectors are removed; the DP-100 label
  matches the certificate.
- **`/evidence` ledger.** Every metric, how it reaches the page, the raw
  transcripts, what is not measured, and the limitations the data exposes.

### Design system

- Token layer extended: fluid type steps, elevation, motion durations and
  easing, tier and status vocabularies, diff colours, and a Shiki
  CSS-variables theme so code follows light and dark mode.
- Shared primitives (`.card`, `.kicker`, `.lede`, `.btn` sizes,
  `.status-chip`, `.segmented`, `.spec`, `.reveal`) and print styles.
- The accent gradient is limited to the nav wordmark plus one hero element
  per page. Roughly 130 hard-coded colours were replaced with tokens.
- `MetricTile` replaces `Stat`, with a "How measured" disclosure that links to
  the ledger.

### Pages

- **Home:** a thesis headline, credential strip, production impact kept
  visibly apart from reproducible demo numbers, an editorial project layout,
  working principles, an experience teaser and a stack explorer.
- **About:** its own narrative and an expandable career timeline.
- **Résumé:** an HTML résumé built from the data files, with print styles and
  an on-demand PDF tab.
- **Projects:** a capability matrix (project × capability, status-coded)
  above redesigned cards.
- **Case studies:** a shared layout with an at-a-glance panel, sticky table
  of contents with scroll-spy, reading progress, heading anchors, code copy
  buttons and token-driven architecture diagrams (Mermaid removed).
  - SQL optimizer: a query workbench over the real corpus with findings,
    reference rewrites (labelled, not Claude output), and the exact Claude
    payload.
  - Fraud signals: a replay of the real evaluation feed with verdicts, the
    real detector source, and a threshold explorer.
  - Telecom lakehouse: medallion, DAG, lineage and data-contract explorers
    over the real project files.
- **Dashboards:** a hash-synced tab workspace; every chart has a computed
  takeaway, a provenance chip, a data table, CSV export, full-screen view and
  copy-link. The telecom dashboard cross-filters by market.
- **Contact** restyled; new **404** page.

### Interaction and accessibility

- ⌘K / Ctrl+K / `/` command palette over pages, sections, dashboards and
  metrics, with quick actions.
- Mobile navigation menu, toast notifications, ARIA tabs with roving focus.
- One motion policy: reduced motion, offscreen and hidden-tab pausing, and a
  user pause control on every animation.
- Every chart has a table view; the live feed announces a throttled summary
  instead of every event.
- Scrollable tables and code blocks are focusable, named regions; small amber
  text and white-on-blue buttons meet 4.5:1 in both themes (`--color-warn-fg`,
  `--color-accent-solid`); the evidence ledger stacks into rows on phones.

### Tooling

- `npm run check`, `validate` (token, phrase, metric-id and data-consistency
  guardrail) and `data:check` (scenario reproducibility).
- Site CI on pull requests: install, type check, validate, data check, build.
- `npm run qa` (`scripts/qa.mjs`): axe-core WCAG 2.2 AA in both themes at desktop and
  phone widths, with the palette, menu, chart dialog and data tables open;
  keyboard flows; reduced motion; résumé prints on two pages. All passing at
  release.
- Removed: Monaco, react-diff-viewer, React Flow, Framer Motion, Mermaid,
  `vite.ssr.noExternal`, and the unused live-demo environment read.

## 0.1.0

Initial site: Astro 5, React islands, three project pages, ECharts
dashboards on synthetic data, measured metrics on the homepage.
