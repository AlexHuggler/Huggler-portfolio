SELECT /*+ BROADCAST(dp) */
    fol.order_id,
    fol.order_date,
    fol.product_id,
    fol.quantity,
    fol.amount_usd,
    dp.product_name,
    dp.category
FROM bronze.fct_order_lines fol
JOIN bronze.dim_product dp
  ON fol.product_id = dp.product_id
WHERE fol.order_date >= '2026-01-01';
