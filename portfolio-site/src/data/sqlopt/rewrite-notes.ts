/**
 * Prose for the hand-written reference rewrites in ./rewrites/*.sql. These
 * are an engineer's reference answers — not Claude output and not
 * EXPLAIN-verified — and each states the assumptions it depends on.
 * scripts/artifacts/sqlopt.py checks that every rewrite parses and records
 * which analyzer findings and ground-truth keywords it clears.
 */
export interface RewriteNote {
  title: string;
  change: string;
  assumptions: string[];
}

export const rewriteNotes: Record<string, RewriteNote> = {
  "01_join_optimization": {
    title: "Project the columns, broadcast the dimension",
    change:
      "Replace SELECT * with the columns a consumer needs and hint the small dim_product side for a broadcast hash join instead of a shuffle.",
    assumptions: [
      "The column list is illustrative; the real consumer's needs decide it.",
      "dim_product stays under the broadcast threshold. With AQE on Spark 3.x the planner may already convert this join at runtime when statistics are fresh.",
    ],
  },
  "02_aggregation_rewrite": {
    title: "One GROUP BY instead of three correlated scans",
    change:
      "Aggregate gold.fct_orders once per customer in a CTE and LEFT JOIN it to the active customers, so the fact table is scanned once instead of three times.",
    assumptions: [
      "COALESCE(order_count, 0) keeps the zero that a correlated COUNT(*) returns for customers without orders; SUM and MAX stay NULL, as before.",
      "The LEFT JOIN preserves every active customer, matching the original row count.",
    ],
  },
  "03_cte_flattening": {
    title: "Six CTEs → one scan with conditional aggregates",
    change:
      "Read silver.cdr once and compute each call-type metric with conditional aggregation instead of three filtered CTEs, three GROUP BYs and two joins.",
    assumptions: [
      "HAVING voice_count > 0 keeps the original driving set (markets with at least one voice call).",
      "NULLIF(…, 0) reproduces the NULLs the original LEFT JOINs produce for markets with no SMS or data rows.",
    ],
  },
  "04_partition_pruning": {
    title: "Give the planner a partition predicate",
    change:
      "Bound ingest_date directly so Spark can prune partitions, and keep an exact start_time range so the result is unchanged.",
    assumptions: [
      "Events land in an ingest_date partition no later than one day after start_time; the upper bound would need widening for later arrivals.",
      "start_time is a timestamp. The original date_format() filter is replaced by a sargable range rather than kept alongside it.",
    ],
  },
  "05_broadcast_join": {
    title: "Broadcast both small dimensions (Spark form)",
    change:
      "On Spark, hint dim_market (~5 rows) and dim_product for broadcast so the large fact table never shuffles.",
    assumptions: [
      "This query is tagged Snowflake, which has no join hints: there the planner broadcasts small build sides on its own once statistics exist, so the remaining levers are clustering and search optimization, not SQL.",
      "The benchmark parses this file as Spark because it ignores the engine header — the rewrite follows the parser.",
    ],
  },
};

export const categoryTitle: Record<string, string> = {
  join_optimization: "Join optimization",
  aggregation_rewrite: "Aggregation rewrite",
  cte_flattening: "CTE flattening",
  partition_pruning: "Partition pruning",
  broadcast_join: "Broadcast join",
};
