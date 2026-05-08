-- engine: spark
-- category: cte_flattening
-- Several CTEs that each read the same source table and apply
-- near-identical filters. Spark's Catalyst will not always combine these
-- automatically, so the underlying scan can run multiple times.

WITH voice_calls AS (
    SELECT caller_msisdn, start_time, duration_sec, market
    FROM silver.cdr WHERE call_type = 'VOICE'
),
sms_msgs AS (
    SELECT caller_msisdn, start_time, market
    FROM silver.cdr WHERE call_type = 'SMS'
),
data_sessions AS (
    SELECT caller_msisdn, start_time, bytes_used, market
    FROM silver.cdr WHERE call_type = 'DATA'
),
voice_agg AS (
    SELECT market, COUNT(*) AS voice_count, SUM(duration_sec) AS voice_seconds
    FROM voice_calls GROUP BY market
),
sms_agg AS (
    SELECT market, COUNT(*) AS sms_count
    FROM sms_msgs GROUP BY market
),
data_agg AS (
    SELECT market, COUNT(*) AS data_count, SUM(bytes_used) AS bytes_total
    FROM data_sessions GROUP BY market
)
SELECT
    v.market,
    v.voice_count,
    v.voice_seconds,
    s.sms_count,
    d.data_count,
    d.bytes_total
FROM voice_agg v
LEFT JOIN sms_agg s USING (market)
LEFT JOIN data_agg d USING (market);
