{{ config(materialized='table') }}

select
    market,
    ingest_date,
    sum(revenue_usd) as revenue_usd,
    count(*) as event_count,
    count(distinct caller_msisdn) as active_callers
from {{ ref('sl_revenue_event') }}
group by 1, 2
