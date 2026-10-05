# Architecture

End-to-end view of the telecom Medallion lakehouse. The headline diagram is
in the README; this doc fills in the parts a reviewer asks about second.

## Layers

```mermaid
flowchart LR
  G[data_generator/generate_cdrs.py\nFaker + Pyarrow] -->|parquet| R[(Raw S3/MinIO\ningest_date= partition)]
  R -->|Airflow ingest_cdr_bronze\n@hourly| BR[(Bronze Iceberg\ntyped)]
  BR -.->|Bronze Dataset event\ntriggers transform_silver| GE{GE checkpoint\ncdr_bronze_suite\npass?}
  GE -- yes: bronze_to_silver --> SI[(Silver Iceberg\nbillable_minutes, billable_mb)]
  GE -- no --> X[Task fails\nSilver + Gold do not run]
  SI -.->|Silver Dataset event\ntriggers build_gold_marts| D[dbt run + dbt test]
  D --> GO1[(revenue_by_market)]
  D --> GO2[(arpu_monthly)]
  D --> GO3[(churn_signals)]
  GO1 --> BI[BI / Athena / dashboards]
  GO2 --> BI
  GO3 --> BI
```

## Data quality strategy

| Layer | Tool | Tests |
| --- | --- | --- |
| Raw | None | Parquet schema enforced by writer |
| Bronze | Great Expectations | Column types, nulls, ranges, regex on `caller_msisdn` |
| Silver | dbt | `unique`, `not_null`, `accepted_values`, expression checks |
| Gold | dbt | Same set, plus `relationships` between marts |

## Data contract example

The `cdr_bronze_suite` (in `great_expectations/expectations/`) requires:

- All columns present in a fixed set.
- `cdr_id` non-null and unique.
- `caller_msisdn` non-null and matches `^\+1[0-9]{10}$`.
- `call_type` in `{VOICE, SMS, DATA}`.
- `market` in `{NORTH, SOUTH, EAST, WEST, CENTRAL}`.
- `duration_sec` between 0 and 86400.

The `transform_silver` DAG runs the suite through the `cdr_bronze_checkpoint`
(`great_expectations/checkpoints/`, driven by `src/lakehouse/contract.py`) before
`bronze_to_silver`. A failed expectation raises `DataContractError` and fails the
`great_expectations_bronze` task. `bronze_to_silver` is then `upstream_failed`,
no Silver Dataset event fires, and `build_gold_marts` does not run. A missing
`great_expectations` install is a task failure too; the only bypass is
`LAKEHOUSE_ENFORCE_CONTRACT=false`, which logs a warning on every run.

## Orchestration

The DAGs are linked by Airflow Datasets (`dags/lakehouse_datasets.py`), not
separate clocks: `ingest_cdr_bronze` runs `@hourly` and emits the Bronze Dataset;
`transform_silver` is scheduled on Bronze and emits the Silver Dataset;
`build_gold_marts` is scheduled on Silver. Each DAG has `max_active_runs=1`
because each rewrites a single output file. `tests/test_dag_integrity.py` parses
the DAG folder with Airflow and asserts this wiring.

## Local vs production

| Concern | Local docker-compose | AWS production |
| --- | --- | --- |
| Object storage | MinIO | S3 (encrypted, versioned) |
| Catalog | duckdb file | Glue Data Catalog |
| Compute | Python + duckdb | EMR / Glue / Databricks |
| Query | duckdb / `dbt-duckdb` | Athena / `dbt-athena` |
| Orchestration | LocalExecutor Airflow | MWAA |

## Why Iceberg

Hidden partitioning means a `WHERE ingest_date = '2026-01-01'` predicate
prunes correctly even after the partition spec evolves, which Hive-style
catalogs can't promise. Iceberg's metadata-level `MERGE` and
schema-evolution rules make billing corrections (the dominant write
pattern in telecom) tractable without rewriting old partitions.
