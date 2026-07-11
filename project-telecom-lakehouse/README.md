# Telecom Billing Lakehouse

[![CI](https://img.shields.io/github/actions/workflow/status/AlexHuggler/Huggler-portfolio/ci-telecom-lakehouse.yml?branch=main&label=CI)](https://github.com/AlexHuggler/Huggler-portfolio/actions/workflows/ci-telecom-lakehouse.yml)
![Python](https://img.shields.io/badge/python-3.11%2B-3776AB?logo=python&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-22c55e)
![Ruff](https://img.shields.io/badge/linting-ruff-261230)
![uv](https://img.shields.io/badge/deps-uv-6340ac)

End-to-end Medallion lakehouse for synthetic CDR (Call Detail Record) data:
**generator -> MinIO/S3 -> Airflow -> Bronze -> Silver -> dbt Gold marts**.
Runs locally on docker-compose; an optional Terraform stack provisions the
AWS variant.

## Problem

Telecom billing teams handle hundreds of millions of events per day -
voice calls, SMS, and data sessions - across many markets and plans. The
business needs are conflicting: ops needs near-real-time revenue
visibility, FP&A wants stable monthly mart freshness, finance requires
auditable late-arriving corrections, and BI consumers want a
reasonable-shape star schema. A traditional warehouse forces every
correction to be a heavyweight rewrite. The Medallion lakehouse pattern
(Bronze raw -> Silver normalized -> Gold dimensional, all Iceberg over
object storage) handles the conflict by treating each layer as
write-optimised for its own job, with explicit data contracts at the
boundary. This project demonstrates the pattern end-to-end with all the
moving parts you'd expect in production: Airflow orchestration,
Great-Expectations data contracts at Bronze, dbt for Silver/Gold with
tests, and a Terraform deployment to AWS.

## Architecture

```mermaid
flowchart LR
  G[data_generator/generate_cdrs.py] -->|parquet| R[(Raw S3 / MinIO<br/>ingest_date partitions)]
  R -->|Airflow ingest_cdr_bronze| BR[(Iceberg Bronze)]
  BR -->|GE cdr_bronze_suite| BR2[validated Bronze]
  BR2 -->|Airflow transform_silver| SI[(Iceberg Silver)]
  SI -->|Airflow build_gold_marts<br/>dbt run + dbt test| GO1[(revenue_by_market)]
  SI --> GO2[(arpu_monthly)]
  SI --> GO3[(churn_signals)]
  GO1 --> BI[Athena / BI consumers]
  GO2 --> BI
  GO3 --> BI
```

## Stack

| Tool | Why this one |
| --- | --- |
| Apache Airflow (LocalExecutor) | Mature DAG model, retries, SLAs, task-level logs |
| Apache Iceberg | Partition evolution, hidden partitioning, engine-portable |
| MinIO (local) / S3 (prod) | Same API, cheap object storage |
| Great Expectations | Bronze-layer column contracts that block Silver on failure |
| dbt | Testable SQL with `unique` / `not_null` / `accepted_values` / `relationships` |
| Terraform | Reproducible AWS provisioning (S3 + Glue catalog) |
| dbt-duckdb (local) / dbt-athena (AWS) | Same models, two engines |

## Setup

```bash
# 1. Install demo deps (no Airflow needed)
make install

# 2. Run the local demo - generator + Bronze + Silver + Gold via DuckDB
make demo
```

![make demo output: 50k CDRs generated, then Bronze/Silver/Gold row counts from the medallion transform](docs/img/pipeline-run.png)

For the full Airflow + MinIO experience:

```bash
# Bring up Airflow + Postgres + MinIO
make airflow-up

# UI:    http://localhost:8080  (admin / admin)
# MinIO: http://localhost:9001  (minio / minio12345)

# Trigger DAGs from the UI or via CLI:
docker compose exec airflow-scheduler airflow dags trigger ingest_cdr_bronze
```

For the analytics layer (fully offline - the project vendors local
replacements for its two dbt_utils macros, so there is no `dbt deps` step):

```bash
make demo   # produces data/raw the dbt sources read
cp dbt_telecom/profiles.yml.example dbt_telecom/profiles.yml
make dbt-run && make dbt-test
```

For the AWS deployment, see [`terraform/README.md`](terraform/README.md).

## Data quality strategy

- **Bronze** is the contract layer. The Great Expectations suite
  `cdr_bronze_suite` (10 expectations) specifies column types, nulls,
  ranges, and a regex on `caller_msisdn`. The design intent is that
  failures fail the Airflow task and block Silver; the bundled demo DAG
  wires the checkpoint as a demonstrative stub, so enforcement requires
  the full Airflow + GE stack.
- **Silver** is the modeled layer. dbt tests on every model with
  `unique`, `not_null`, `accepted_values`, and expression checks
  (`>= 0`, etc).
- **Gold** is the consumption layer. dbt `relationships` tests assert
  referential integrity between marts and Silver.

### Sample data contract

The Bronze contract lives in
[`great_expectations/expectations/cdr_bronze_suite.json`](great_expectations/expectations/cdr_bronze_suite.json).
A representative excerpt:

```json
{
  "expectation_type": "expect_column_values_to_match_regex",
  "kwargs": { "column": "caller_msisdn", "regex": "^\\+1[0-9]{10}$" }
}
```

## Results

Measured on the no-infra demo path (`make demo` + `make dbt-run` +
`make dbt-test`, DuckDB engine, seed 42, 49,998 CDR rows across 3 day
partitions). Single process on a Linux container, 2026-07. Reproduce
with the three commands above.

| Metric | Measured |
| --- | --- |
| Raw -> Bronze -> Silver -> Gold transform | 49,998 rows in 0.53 s (~94k rows/sec, single process) |
| End-to-end demo (generate + transform) | 2.8 s wall clock |
| dbt build | 8 models (bronze views, silver + gold tables), all built |
| dbt tests | 41 of 41 passing (unique, not_null, accepted_values, relationships, expression checks) |
| Bronze data contract | 10 expectations defined in `cdr_bronze_suite.json` (demo DAG stubs enforcement) |
| Unit tests | 8 passed |

![dbt test output: 41 of 41 data tests passing](docs/img/dbt-tests.png)

Raw synthetic CDRs land as Parquet already, so there is no CSV-to-Parquet
compression ratio to report on the local path; on the AWS path the same
claim depends on the upstream feed format.

## Tradeoffs

- **Iceberg vs Delta.** Iceberg wins for engine portability (Spark,
  Trino, Athena, Snowflake all read it) and partition evolution. Delta
  wins for streaming MERGE in Databricks. For a batch-first telecom
  billing workload, Iceberg's the cleaner fit.
- **Airflow vs Dagster.** Dagster has nicer asset-graph semantics and
  better local dev, but Airflow has the talent pool and the
  battle-tested operators. For a portfolio piece showing breadth,
  Airflow is the more useful demonstration.
- **MinIO vs LocalStack.** MinIO is honest about being S3-compatible
  storage, which is what we need; LocalStack is broader but
  overshoots.
- **Great Expectations vs dbt tests only.** GE catches schema drift at
  the contract boundary; dbt tests catch model-level invariants. Both
  layers are needed.

## What I would do differently in production

- Replace the GE 0.18 API with Great Expectations 1.x (or `pandera`)
  once a stable migration path lands.
- Add lineage via OpenLineage emitters on every Airflow task and dbt
  run.
- Add `expect_column_pair_values_to_be_equal` style cross-column
  contracts (e.g. roaming flag must match a roaming-eligible plan).
- Replace LocalExecutor with KubernetesExecutor for scale-out.
- Add an Iceberg compaction DAG to keep the Bronze partition file count
  bounded.

## Limitations

- Synthetic data: phone numbers are random `+1NNNNNNNNNN`, no real PII.
- The local demo uses DuckDB instead of a true Iceberg engine - the
  data contract is the same but partition pruning is approximated.
- Terraform doesn't provision IAM, KMS, or VPC - too
  environment-specific to template.
- `airflow dags list` requires Airflow installed; the ingestion code
  itself does not.

See [`docs/architecture.md`](docs/architecture.md) for deeper detail.
