-- engine: spark
-- category: partition_pruning
-- The events table is partitioned by ingest_date but the query filters on
-- a derived date_format expression, which Spark cannot push down to the
-- partition predicate.

SELECT
    market,
    COUNT(*) AS event_count
FROM silver.cdr_events
WHERE date_format(start_time, 'yyyy-MM') = '2026-04'
  AND market = 'WEST'
GROUP BY market;
