SELECT
    market,
    COUNT(*) AS event_count
FROM silver.cdr_events
WHERE ingest_date BETWEEN DATE '2026-04-01' AND DATE '2026-05-01'
  AND start_time >= TIMESTAMP '2026-04-01 00:00:00'
  AND start_time <  TIMESTAMP '2026-05-01 00:00:00'
  AND market = 'WEST'
GROUP BY market;
