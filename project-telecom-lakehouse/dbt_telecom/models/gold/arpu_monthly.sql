{{ config(materialized='table') }}

with per_caller as (
    select
        caller_msisdn,
        plan_id,
        date_trunc('month', start_time) as month,
        sum(revenue_usd) as revenue_usd
    from {{ ref('sl_revenue_event') }}
    group by 1, 2, 3
)
select
    month,
    plan_id,
    avg(revenue_usd) as arpu_usd,
    count(*) as active_callers
from per_caller
group by 1, 2
