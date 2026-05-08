.PHONY: install install-airflow install-quality test lint format gen-data \
        airflow-up airflow-down dbt-run dbt-test demo run clean

UV ?= uv
PY ?= $(UV) run python

install:
	$(UV) sync --extra dev

install-airflow:
	$(UV) sync --extra dev --extra airflow --extra quality --extra storage --extra dbt

test:
	$(UV) run pytest

lint:
	$(UV) run ruff check src data_generator dags tests

format:
	$(UV) run ruff format src data_generator dags tests

gen-data:
	$(PY) -m data_generator.generate_cdrs --rows 50000 --out data/raw/

bronze-silver:
	$(PY) -m lakehouse.transform bronze-silver

airflow-up:
	docker compose up -d

airflow-down:
	docker compose down

dbt-run:
	cd dbt_telecom && $(UV) run dbt run

dbt-test:
	cd dbt_telecom && $(UV) run dbt test

demo:
	@echo "==> Generating 50k synthetic CDR rows -> data/raw/"
	$(PY) -m data_generator.generate_cdrs --rows 50000 --out data/raw/
	@echo ""
	@echo "==> Running lightweight Bronze -> Silver -> Gold transform (no Airflow)"
	$(PY) -m lakehouse.transform run-all
	@echo ""
	@echo "Demo complete. See data/{bronze,silver,gold}/."

run: demo

clean:
	rm -rf data/raw data/bronze data/silver data/gold dbt_telecom/target dbt_telecom/dbt_packages \
	       .pytest_cache .ruff_cache build dist *.egg-info
