/**
 * Cross-project capability matrix for /projects: the same engineering
 * concerns down the side, each project's honest status across the top.
 * Status vocabulary matches the case studies' capability lists.
 */
import type { LaneStatus } from "./architecture";

export type Cell = { status: LaneStatus; note: string } | null;
export const matrixProjects = ["fraud-signals", "telecom-lakehouse", "ai-sql-optimizer"] as const;

export const capabilityMatrix: { area: string; cells: Record<(typeof matrixProjects)[number], Cell> }[] = [
  {
    area: "Ingestion",
    cells: {
      "fraud-signals": { status: "implemented", note: "labeled synthetic producer → Kafka or JSONL" },
      "telecom-lakehouse": { status: "implemented", note: "CDR generator → partitioned Parquet" },
      "ai-sql-optimizer": null,
    },
  },
  {
    area: "Stream processing",
    cells: {
      "fraud-signals": { status: "needs-infra", note: "Structured Streaming → Delta, 2-min watermark" },
      "telecom-lakehouse": null,
      "ai-sql-optimizer": null,
    },
  },
  {
    area: "Orchestration",
    cells: {
      "fraud-signals": null,
      "telecom-lakehouse": { status: "needs-infra", note: "3 Airflow DAGs, hourly + daily" },
      "ai-sql-optimizer": null,
    },
  },
  {
    area: "Transformation & modeling",
    cells: {
      "fraud-signals": { status: "stub", note: "dbt models; build needs packages.yml" },
      "telecom-lakehouse": { status: "measured", note: "DuckDB medallion + 8 dbt models" },
      "ai-sql-optimizer": null,
    },
  },
  {
    area: "Data contracts & tests",
    cells: {
      "fraud-signals": null,
      "telecom-lakehouse": { status: "measured", note: "41/41 dbt tests; GE suite defined (stub)" },
      "ai-sql-optimizer": null,
    },
  },
  {
    area: "Detection & static analysis",
    cells: {
      "fraud-signals": { status: "measured", note: "velocity · travel · z-score detectors" },
      "telecom-lakehouse": null,
      "ai-sql-optimizer": { status: "measured", note: "sqlglot AST + 6 heuristic rules" },
    },
  },
  {
    area: "LLM integration",
    cells: {
      "fraud-signals": null,
      "telecom-lakehouse": null,
      "ai-sql-optimizer": { status: "implemented", note: "Claude rewrite + live benchmark; needs API key" },
    },
  },
  {
    area: "Evaluation vs ground truth",
    cells: {
      "fraud-signals": { status: "measured", note: "account-level P/R/F1 + threshold sweep" },
      "telecom-lakehouse": null,
      "ai-sql-optimizer": { status: "measured", note: "keyword overlap, findings hit" },
    },
  },
  {
    area: "Unit tests + CI",
    cells: {
      "fraud-signals": { status: "measured", note: "pytest + ruff + demo in GitHub Actions" },
      "telecom-lakehouse": { status: "measured", note: "pytest + ruff + demo + terraform validate" },
      "ai-sql-optimizer": { status: "measured", note: "pytest + ruff + demo in GitHub Actions" },
    },
  },
  {
    area: "Infrastructure",
    cells: {
      "fraud-signals": { status: "implemented", note: "docker compose: Kafka, Spark" },
      "telecom-lakehouse": { status: "implemented", note: "Terraform: S3 × 4 + Glue; compose: Airflow, MinIO" },
      "ai-sql-optimizer": { status: "stub", note: "Cloudflare Worker proxy, unconfigured" },
    },
  },
  {
    area: "Operator UI",
    cells: {
      "fraud-signals": { status: "implemented", note: "Streamlit dashboard" },
      "telecom-lakehouse": null,
      "ai-sql-optimizer": { status: "implemented", note: "Rich CLI tables + diffs" },
    },
  },
];
