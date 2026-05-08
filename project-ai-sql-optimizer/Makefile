.PHONY: install test lint format run demo benchmark clean

UV ?= uv
PY ?= $(UV) run python

install:
	$(UV) sync --extra dev

test:
	$(UV) run pytest

lint:
	$(UV) run ruff check src tests

format:
	$(UV) run ruff format src tests

run:
	$(UV) run sql-optimizer --help

demo:
	@echo "==> Running analyzer in dry-run mode against the 5 example queries"
	@for q in corpus/queries/01_join_optimization.sql \
	         corpus/queries/02_aggregation_rewrite.sql \
	         corpus/queries/03_cte_flattening.sql \
	         corpus/queries/04_partition_pruning.sql \
	         corpus/queries/05_broadcast_join.sql; do \
	  echo ""; \
	  echo "----- $$q -----"; \
	  $(UV) run sql-optimizer analyze "$$q" --dry-run; \
	done

benchmark:
	$(UV) run sql-optimizer benchmark --dry-run

clean:
	rm -rf .pytest_cache .ruff_cache build dist *.egg-info
