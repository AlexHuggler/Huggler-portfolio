.PHONY: install test lint format run run-producer run-stream run-dashboard demo eval clean

UV ?= uv
PY ?= $(UV) run python

install:
	$(UV) sync --extra dev

install-streaming:
	$(UV) sync --extra dev --extra streaming --extra dashboard

test:
	$(UV) run pytest

lint:
	$(UV) run ruff check src tests

format:
	$(UV) run ruff format src tests

run-producer:
	$(PY) -m producer.generate --sink jsonl --rate 50 --duration 30

run-stream:
	$(PY) -m streaming.consumer

run-dashboard:
	$(UV) run streamlit run src/dashboard/app.py

demo:
	@echo "==> Generating 10s of synthetic events with embedded fraud patterns"
	$(PY) -m producer.generate --sink jsonl --rate 100 --duration 10 --out data/events.jsonl
	@echo ""
	@echo "==> Running anomaly detection over the events"
	$(PY) -m anomaly.detect data/events.jsonl
	@echo ""
	@echo "Demo complete. See data/events.jsonl for the raw events."

run: demo

eval:
	@echo "==> Generating a labeled evaluation set (seed 42, ~17k simulated events)"
	$(PY) -m producer.generate --sink jsonl --rate 50 --duration 300 --accounts 1000 --out data/eval_events.jsonl
	@echo ""
	@echo "==> Scoring detectors against the embedded ground-truth labels"
	$(PY) -m anomaly.evaluate data/eval_events.jsonl

clean:
	rm -rf data/events.jsonl checkpoints/ spark-warehouse/ .pytest_cache .ruff_cache dist build *.egg-info
