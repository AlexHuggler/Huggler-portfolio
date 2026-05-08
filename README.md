# Huggler Portfolio Monorepo

This monorepo contains Alex Huggler's public data engineering portfolio: a static
showcase site plus three production-quality data engineering projects. Each
subdirectory is independently structured (own `LICENSE`, `.gitignore`, `README`,
CI workflow) so it can later be split into its own GitHub repository.

## Contents

| Path | What it is |
| --- | --- |
| [`portfolio-site/`](./portfolio-site) | Astro + Tailwind static site for GitHub Pages |
| [`project-fraud-signals/`](./project-fraud-signals) | Real-time fraud detection: Kafka, Spark Structured Streaming, Delta, dbt, Streamlit |
| [`project-telecom-lakehouse/`](./project-telecom-lakehouse) | Telecom CDR Medallion lakehouse: Airflow, MinIO/S3, Iceberg, Great Expectations, dbt |
| [`project-ai-sql-optimizer/`](./project-ai-sql-optimizer) | CLI tool that uses Claude to suggest Spark/Snowflake query rewrites |

## Quick start

Each project is self-contained. From the repo root:

```bash
# Portfolio site
cd portfolio-site && npm install && npm run dev

# Any Python project
cd project-fraud-signals && make install && make demo
cd project-telecom-lakehouse && make install && make demo
cd project-ai-sql-optimizer && make install && make demo
```

All three Python projects use [`uv`](https://docs.astral.sh/uv/) for dependency
management, Python 3.11+, `ruff` for linting, and `pytest` for tests.

Every `make demo` target runs to completion in well under five minutes with no
external services (Kafka, AWS, Anthropic API) required. Real cloud or API calls
are gated behind environment variables and skipped when absent.

## Splitting into separate GitHub repos

To push any single subdirectory to its own GitHub repository while preserving
its history, use `git subtree split`:

```bash
git subtree split --prefix=project-fraud-signals -b fraud-signals-only
git push git@github.com:alexhuggler/fraud-signals.git fraud-signals-only:main
```

Or, for a clean cut without monorepo history, copy the directory into a fresh
repository:

```bash
cp -r project-fraud-signals /tmp/fraud-signals
cd /tmp/fraud-signals && git init && git add -A && git commit -m "Initial commit"
gh repo create alexhuggler/fraud-signals --public --source=. --push
```

## Repository layout conventions

- Python projects use the `src/` layout with `pyproject.toml` (no
  `requirements.txt`).
- Architecture diagrams are inline Mermaid in each `README.md` (no image files).
- Every project has GitHub Actions CI running test + lint on push to `main`.
- All licenses are MIT.
- No real secrets, API keys, or PII anywhere in this repo.

## License

MIT. See individual project `LICENSE` files.
