# Airflow image for the docker-compose stack: the stock image plus what the DAGs run.
#
# - requirements.txt goes into Airflow's own environment, with apache-airflow
#   pinned and Airflow's constraints file applied, so pip only adds packages and
#   never moves one the image already ships.
# - dbt goes into a separate virtualenv. dbt-core 1.11 needs protobuf>=6, but the
#   image pins opentelemetry-proto 1.25.0, which needs protobuf<5, so the two
#   can't share an environment. Only the `dbt` entry point is put on PATH.
FROM apache/airflow:2.9.3-python3.11

COPY requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir "apache-airflow==${AIRFLOW_VERSION}" -r /tmp/requirements.txt \
        --constraint "https://raw.githubusercontent.com/apache/airflow/constraints-${AIRFLOW_VERSION}/constraints-${PYTHON_VERSION%.*}.txt" \
    && pip check

USER root
COPY requirements-dbt.txt /tmp/requirements-dbt.txt
RUN /usr/local/bin/python -m venv /opt/dbt-venv \
    && /opt/dbt-venv/bin/pip install --no-cache-dir -r /tmp/requirements-dbt.txt \
    && /opt/dbt-venv/bin/pip check \
    && ln -s /opt/dbt-venv/bin/dbt /usr/local/bin/dbt \
    && rm /tmp/requirements.txt /tmp/requirements-dbt.txt

# The compose dbt profile (DuckDB file on the mounted ./data). DBT_PROFILES_DIR
# is set in docker-compose.yml and build_gold_marts passes the same directory.
COPY dbt-profiles.yml /opt/airflow/dbt_profiles/profiles.yml

USER airflow
