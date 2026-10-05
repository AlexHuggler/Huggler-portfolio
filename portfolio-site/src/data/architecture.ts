/**
 * Architecture, drawn as lanes so the diagram tells the truth about what
 * runs where: the path that needs infrastructure (Kafka, Airflow, an API
 * key) is a separate, status-coded lane from the path anyone can run.
 * Every node names the file or command that implements it.
 */
export type LaneStatus = "measured" | "implemented" | "stub" | "needs-infra" | "planned";

export interface ArchNode {
  label: string;
  detail?: string;
  file?: string;
  status?: LaneStatus;
}

export interface Lane {
  id: string;
  title: string;
  status: LaneStatus;
  note: string;
  nodes: ArchNode[];
}

export const architecture: Record<string, Lane[]> = {
  "fraud-signals": [
    {
      id: "local",
      title: "Local evaluation path",
      status: "measured",
      note: "make eval — runs anywhere, produces every published number",
      nodes: [
        { label: "Producer", detail: "3 labeled fraud patterns, seed 42", file: "src/producer/generate.py" },
        { label: "JSONL sink", detail: "16,664 events", file: "data/eval_events.jsonl" },
        { label: "Detectors", detail: "velocity · geo · amount z-score", file: "src/anomaly/detect.py" },
        { label: "Evaluator", detail: "account-level P/R/F1 vs labels", file: "src/anomaly/evaluate.py" },
      ],
    },
    {
      id: "stream",
      title: "Streaming path",
      status: "needs-infra",
      note: "docker compose up + make run-stream — Kafka 3.7, Spark 3.5",
      nodes: [
        { label: "Producer", detail: "--sink kafka", file: "src/producer/generate.py" },
        { label: "Kafka", detail: "topic tx-events, keyed by account_id" },
        { label: "Structured Streaming", detail: "2-min watermark · checkpoint · maxOffsetsPerTrigger", file: "src/streaming/consumer.py" },
        { label: "Delta table", detail: "append; batch ids make replays idempotent", file: "data/delta/tx_events" },
        { label: "Streamlit", detail: "reads Delta (or JSONL), runs detectors", file: "src/dashboard/app.py", status: "implemented" },
      ],
    },
    {
      id: "model",
      title: "Analytics modeling",
      status: "stub",
      note: "dbt models exist; the build needs a packages.yml for dbt_utils",
      nodes: [
        { label: "stg_transactions", file: "dbt_fraud/models/staging" },
        { label: "fct_transactions", detail: "per-account amount z-score", file: "dbt_fraud/models/marts" },
        { label: "dim_account", file: "dbt_fraud/models/marts" },
      ],
    },
  ],
  "telecom-lakehouse": [
    {
      id: "local",
      title: "Local medallion path",
      status: "measured",
      note: "make demo + dbt build — DuckDB, no cloud account",
      nodes: [
        { label: "CDR generator", detail: "50k rows, 3 day partitions", file: "data_generator/generate_cdrs.py" },
        { label: "Raw Parquet", detail: "partitioned by ingest_date", file: "data/raw/" },
        { label: "Bronze", detail: "typed, normalised", file: "src/lakehouse/transform.py" },
        { label: "Silver", detail: "valid rows, billable minutes / MB", file: "src/lakehouse/transform.py" },
        { label: "Gold marts", detail: "revenue · ARPU · churn", file: "src/lakehouse/transform.py" },
        { label: "dbt build", detail: "8 models, 41 tests", file: "dbt_telecom/" },
      ],
    },
    {
      id: "airflow",
      title: "Orchestrated path",
      status: "needs-infra",
      note: "docker compose: Airflow 2.9 (LocalExecutor), Postgres, MinIO",
      nodes: [
        { label: "MinIO raw zone", detail: "S3-compatible landing" },
        { label: "ingest_cdr_bronze", detail: "@hourly · PythonOperator · 2 retries", file: "dags/ingest_cdr_bronze.py" },
        { label: "transform_silver", detail: "@hourly · GE check → bronze_to_silver", file: "dags/transform_silver.py" },
        { label: "build_gold_marts", detail: "@daily · dbt run → dbt test", file: "dags/build_gold_marts.py" },
      ],
    },
    {
      id: "contract",
      title: "Bronze data contract",
      status: "stub",
      note: "10 expectations defined; the DAG task loads GE but runs no checkpoint",
      nodes: [
        { label: "cdr_bronze_suite", detail: "columns · nulls · regex · sets · ranges", file: "great_expectations/expectations/" },
        { label: "Checkpoint gate", detail: "would block Silver on failure", status: "planned" },
      ],
    },
    {
      id: "aws",
      title: "AWS infrastructure",
      status: "implemented",
      note: "Terraform — validated and fmt-checked in CI, not applied here",
      nodes: [
        { label: "S3 × 4", detail: "raw · bronze · silver · gold; versioned, encrypted, private", file: "terraform/s3.tf" },
        { label: "Glue catalog", detail: "database + cdr_bronze (Parquet)", file: "terraform/glue.tf" },
        { label: "Iceberg tables", detail: "target table format", status: "planned" },
      ],
    },
  ],
  "ai-sql-optimizer": [
    {
      id: "analyze",
      title: "Analyze",
      status: "measured",
      note: "sql-optimizer analyze --dry-run — no API key needed",
      nodes: [
        { label: "Query file", detail: "Spark SQL or Snowflake", file: "corpus/queries/" },
        { label: "sqlglot parse", detail: "dialect-aware AST", file: "src/sql_optimizer/analyzer.py" },
        { label: "6 heuristic rules", detail: "select *, cross join, partition, broadcast, correlated, CTEs", file: "src/sql_optimizer/analyzer.py" },
        { label: "Findings", detail: "rule · severity · message" },
      ],
    },
    {
      id: "suggest",
      title: "Suggest",
      status: "implemented",
      note: "needs ANTHROPIC_API_KEY — benchmark --no-dry-run scores it; no live run recorded",
      nodes: [
        { label: "SQL + findings", detail: "structured user message", file: "src/sql_optimizer/client.py" },
        { label: "Optimizer prompt", detail: "versioned in the repo", file: "src/sql_optimizer/prompts/optimizer_prompt.md" },
        { label: "Claude", detail: "Messages API, retries on 429/5xx", file: "src/sql_optimizer/client.py" },
        { label: "Rewrite + reasoning", detail: "JSON: rewrite · reasoning · confidence" },
      ],
    },
    {
      id: "benchmark",
      title: "Benchmark",
      status: "measured",
      note: "make benchmark — dry run over the corpus",
      nodes: [
        { label: "5-query corpus", detail: "one per category", file: "corpus/queries/" },
        { label: "Ground truth", detail: "expected keywords + cost direction", file: "corpus/ground_truth.yaml" },
        { label: "Scorer", detail: "keyword overlap · findings hit", file: "src/sql_optimizer/benchmark.py" },
      ],
    },
    {
      id: "verify",
      title: "Verify",
      status: "needs-infra",
      note: "benchmark --explain spark|snowflake — needs an engine holding the corpus tables",
      nodes: [
        { label: "EXPLAIN original", detail: "Spark EXPLAIN COST · Snowflake EXPLAIN USING JSON", file: "src/sql_optimizer/explain.py" },
        { label: "EXPLAIN rewrite", detail: "same engine, same statistics", file: "src/sql_optimizer/explain.py" },
        { label: "Cost delta", detail: "estimated bytes scanned, before → after", file: "src/sql_optimizer/benchmark.py" },
      ],
    },
  ],
};
