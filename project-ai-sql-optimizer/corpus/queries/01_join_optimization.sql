-- engine: spark
-- category: join_optimization
-- An order-line join against a small dim_product table. The query selects
-- everything and joins without a broadcast hint - the optimizer may pick a
-- shuffled hash join even though dim_product is well under the 8MB
-- broadcast threshold.

SELECT *
FROM bronze.fct_order_lines fol
JOIN bronze.dim_product dp
  ON fol.product_id = dp.product_id
WHERE fol.order_date >= '2026-01-01';
