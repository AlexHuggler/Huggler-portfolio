SELECT
    market,
    COUNT(CASE WHEN call_type = 'VOICE' THEN 1 END)                  AS voice_count,
    SUM(CASE WHEN call_type = 'VOICE' THEN duration_sec END)         AS voice_seconds,
    NULLIF(COUNT(CASE WHEN call_type = 'SMS' THEN 1 END), 0)         AS sms_count,
    NULLIF(COUNT(CASE WHEN call_type = 'DATA' THEN 1 END), 0)        AS data_count,
    SUM(CASE WHEN call_type = 'DATA' THEN bytes_used END)            AS bytes_total
FROM silver.cdr
WHERE call_type IN ('VOICE', 'SMS', 'DATA')
GROUP BY market
HAVING COUNT(CASE WHEN call_type = 'VOICE' THEN 1 END) > 0;
