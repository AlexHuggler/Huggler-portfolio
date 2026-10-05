# Methodology

## Corpus

A seeded benchmark corpus of five categories, one fully specified query per
category, each with explicit ground truth in `corpus/ground_truth.yaml`.
The corpus is designed to grow: adding a query is one `.sql` file plus one
ground-truth entry, and the benchmark discovers both automatically.

| Category | What we test |
| --- | --- |
| join_optimization | Broadcast hint placement, join key selection, join reordering |
| aggregation_rewrite | Correlated subqueries -> single GROUP BY, window functions |
| cte_flattening | Multiple scans of the same source -> single scan with CASE |
| partition_pruning | Predicate cannot be pushed -> rewrite to use the partition column directly |
| broadcast_join | Small-dim joins emitted as shuffled hash, should be broadcast |

## Scoring

Each query has a ground-truth entry in `corpus/ground_truth.yaml` with:

- `expected_keywords`: case-insensitive substrings that should appear in
  the suggested rewrite or the heuristic findings (e.g. "broadcast",
  "ingest_date", "group by").
- `expected_cost_direction`: `lower` / `higher` / `unknown` - what we
  expect EXPLAIN cost to do after the rewrite.

The benchmark computes:

- `keyword_overlap`: fraction of expected keywords that appear in the
  tool's output - the heuristic finding messages in a dry run, Claude's
  rewrite and reasoning in a live run. The input query is never
  searched: a keyword it already contains (a table name, `JOIN`, a word
  in a comment) would otherwise count as a hit the tool never earned.
- `findings_hit_rate`: fraction of queries where the heuristic analyzer
  returned at least one finding.

Correction: before 2026-10-05 the scorer also searched the input query
text, including its explanatory comments, which inflated keyword
overlap. Every keyword-overlap figure in the README is scored on tool
output only.

## Live mode (`--no-dry-run`)

- Claude is called once per query through `AnthropicClient.suggest`, with
  the same prompt and findings payload as `sql-optimizer analyze`. The
  model id is recorded in the summary (`--output` JSON).
- `keyword_overlap` uses the same scorer, but the scored text is Claude's
  rewrite + reasoning only, where a dry run scores the heuristic findings.
  Neither mode searches the original query.
- `findings_hit_rate` stays the heuristic analyzer's result in both modes.
- Without `ANTHROPIC_API_KEY` the run exits with status 2 before scoring
  anything. An API failure (after the client's three retries) aborts the
  run; partial averages are never printed.
- Known gap: the dialect sent to Claude is the benchmark's detected
  dialect, which ignores the `-- engine:` header, so the two
  Snowflake-tagged queries (02, 05) are currently sent as `spark`.

## EXPLAIN cost step (`--explain spark|snowflake`)

- Estimate recorded: estimated bytes scanned, on both engines.
  - Spark: `EXPLAIN COST`, summing `sizeInBytes` over the leaf nodes of the
    optimized logical plan (`CTERelationRef` leaves are skipped so a CTE's
    scan is not counted twice). Sizes are parsed as printed, to one decimal
    per unit.
  - Snowflake: `EXPLAIN USING JSON`, `GlobalStats.bytesAssigned`.
- Only queries whose `-- engine:` header matches the engine are explained;
  the rest are recorded as skipped.
- Per query: `reduction = (before - after) / before`. The reported average
  covers only queries with both estimates and `before > 0`, and is always
  printed with how many queries it covers.
- Direction: the observed `lower` / `higher` / `same` is compared with
  `expected_cost_direction`; `unknown` entries are not counted.
- Never estimated or filled in: a side the engine cannot estimate (planning
  error, missing table, a hallucinated column in the rewrite, or Spark's
  `8.0 EiB` default that means "no statistics") stays `null` with the reason
  in `note`, and that query drops out of the average.
- What the estimate cannot see: partition pruning and removed scans (CTE
  flattening, a correlated subquery folded into one join) change bytes
  scanned; join-strategy changes do not. On a local Spark session, adding a
  broadcast hint or replacing `SELECT *` with explicit columns left the
  estimate unchanged, so `join_optimization` / `broadcast_join` rewrites
  can read as `same` even when they would run faster.

## Scoring honesty

These scores are weak proxies for "is this a good rewrite". A real
deployment should also include:

- Human review (5-point Likert) on a sampled 10-20% of suggestions.
- Round-trip semantic equivalence check (DuckDB or a unit table) on
  small synthetic inputs.
- A drift watch on the corpus: if expected keywords stop appearing as
  the model improves, the ground truth itself needs an update.
