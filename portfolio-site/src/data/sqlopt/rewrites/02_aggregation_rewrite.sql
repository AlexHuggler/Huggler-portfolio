WITH order_stats AS (
    SELECT
        customer_id,
        COUNT(*)        AS order_count,
        SUM(amount_usd) AS total_spend_usd,
        MAX(order_date) AS last_order_at
    FROM gold.fct_orders
    GROUP BY customer_id
)
SELECT
    c.customer_id,
    c.customer_name,
    COALESCE(s.order_count, 0) AS order_count,
    s.total_spend_usd,
    s.last_order_at
FROM gold.dim_customer c
LEFT JOIN order_stats s
  ON s.customer_id = c.customer_id
WHERE c.is_active = TRUE;
