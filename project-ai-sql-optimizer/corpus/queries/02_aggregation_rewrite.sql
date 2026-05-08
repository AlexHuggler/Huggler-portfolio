-- engine: snowflake
-- category: aggregation_rewrite
-- Counts and sums computed via correlated subqueries instead of a single
-- GROUP BY. Each subquery scans the fact table again; in Snowflake this
-- defeats result-set caching and inflates credits.

SELECT
    c.customer_id,
    c.customer_name,
    (SELECT COUNT(*)        FROM gold.fct_orders o WHERE o.customer_id = c.customer_id) AS order_count,
    (SELECT SUM(amount_usd) FROM gold.fct_orders o WHERE o.customer_id = c.customer_id) AS total_spend_usd,
    (SELECT MAX(order_date) FROM gold.fct_orders o WHERE o.customer_id = c.customer_id) AS last_order_at
FROM gold.dim_customer c
WHERE c.is_active = TRUE;
