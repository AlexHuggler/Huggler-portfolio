SELECT /*+ BROADCAST(m, p) */
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
