-- engine: snowflake
-- category: broadcast_join
-- Three-table join where dim_market is small (~5 rows) but is being
-- shuffled because the planner does not see size statistics. The fix is
-- engine-specific: a broadcast hint in Spark, or a result-set cache plus
-- search-optimization in Snowflake.

SELECT
    f.customer_id,
    f.order_date,
    m.market_name,
    p.product_name,
    f.amount_usd
FROM gold.fct_orders f
JOIN gold.dim_market m
  ON f.market_id = m.market_id
JOIN gold.dim_product p
  ON f.product_id = p.product_id
WHERE f.order_date >= '2026-01-01';
