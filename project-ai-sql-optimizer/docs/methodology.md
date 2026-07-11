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
  rewrite or findings.
- `findings_hit_rate`: fraction of queries where the heuristic analyzer
  returned at least one finding.

When run with `--no-dry-run`, an EXPLAIN runner (out of scope for this
scaffold) compares cost before and after the suggested rewrite.

## Scoring honesty

These scores are weak proxies for "is this a good rewrite". A real
deployment should also include:

- Human review (5-point Likert) on a sampled 10-20% of suggestions.
- Round-trip semantic equivalence check (DuckDB or a unit table) on
  small synthetic inputs.
- A drift watch on the corpus: if expected keywords stop appearing as
  the model improves, the ground truth itself needs an update.
