"""Spark Structured Streaming consumer: Kafka -> Delta with watermark + checkpoint.

This module is imported lazily so the rest of the package (producer, anomaly
detection, dashboard) can run without PySpark installed.

To run it locally:

    make install-streaming
    docker compose up -d
    make run-stream

Configuration is read from environment variables so the same code runs on a
laptop, in CI with a local Kafka, or against a managed Kafka in production.
"""

from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class StreamConfig:
    bootstrap: str = os.environ.get("KAFKA_BOOTSTRAP", "localhost:9092")
    topic: str = os.environ.get("KAFKA_TOPIC", "tx-events")
    starting_offsets: str = os.environ.get("KAFKA_STARTING_OFFSETS", "latest")
    delta_path: str = os.environ.get("DELTA_PATH", "data/delta/tx_events")
    checkpoint_path: str = os.environ.get("CHECKPOINT_PATH", "checkpoints/tx_events")
    watermark: str = os.environ.get("WATERMARK", "2 minutes")
    trigger_interval: str = os.environ.get("TRIGGER_INTERVAL", "10 seconds")
    max_offsets_per_trigger: int = int(os.environ.get("MAX_OFFSETS_PER_TRIGGER", "10000"))


def event_schema():
    """Spark StructType for incoming Kafka payloads.

    Defined as a function so that PySpark is only imported when needed.
    """
    from pyspark.sql.types import (
        DoubleType,
        StringType,
        StructField,
        StructType,
        TimestampType,
    )

    return StructType(
        [
            StructField("event_id", StringType(), nullable=False),
            StructField("account_id", StringType(), nullable=False),
            StructField("amount", DoubleType(), nullable=False),
            StructField("currency", StringType(), nullable=True),
            StructField("merchant_category", StringType(), nullable=True),
            StructField("country", StringType(), nullable=True),
            StructField("device_id", StringType(), nullable=True),
            StructField("ts", TimestampType(), nullable=False),
            StructField("label", StringType(), nullable=True),
        ]
    )


def build_spark():
    """Construct a SparkSession configured for Delta Lake."""
    from pyspark.sql import SparkSession

    builder = (
        SparkSession.builder.appName("fraud-signals-stream")
        .config("spark.sql.extensions", "io.delta.sql.DeltaSparkSessionExtension")
        .config(
            "spark.sql.catalog.spark_catalog",
            "org.apache.spark.sql.delta.catalog.DeltaCatalog",
        )
        .config("spark.sql.shuffle.partitions", "4")
    )
    try:
        from delta import configure_spark_with_delta_pip

        return configure_spark_with_delta_pip(builder).getOrCreate()
    except ImportError:
        return builder.getOrCreate()


def stream_kafka_to_delta(cfg: StreamConfig | None = None):
    """Wire up the streaming query: Kafka source -> JSON parse -> watermark -> Delta sink.

    Returns the active StreamingQuery so callers can `awaitTermination` or stop it.
    """
    from pyspark.sql.functions import col, from_json

    cfg = cfg or StreamConfig()
    spark = build_spark()

    raw = (
        spark.readStream.format("kafka")
        .option("kafka.bootstrap.servers", cfg.bootstrap)
        .option("subscribe", cfg.topic)
        .option("startingOffsets", cfg.starting_offsets)
        .option("maxOffsetsPerTrigger", cfg.max_offsets_per_trigger)
        .load()
    )

    parsed = (
        raw.selectExpr("CAST(value AS STRING) AS json", "timestamp AS ingest_ts")
        .select(from_json(col("json"), event_schema()).alias("e"), "ingest_ts")
        .select("e.*", "ingest_ts")
        .withWatermark("ts", cfg.watermark)
    )

    query = (
        parsed.writeStream.format("delta")
        .option("checkpointLocation", cfg.checkpoint_path)
        .option("mergeSchema", "false")
        .outputMode("append")
        .trigger(processingTime=cfg.trigger_interval)
        .start(cfg.delta_path)
    )
    return query


def main() -> None:
    cfg = StreamConfig()
    print(f"Starting stream cfg={cfg}")
    query = stream_kafka_to_delta(cfg)
    query.awaitTermination()


if __name__ == "__main__":
    main()
