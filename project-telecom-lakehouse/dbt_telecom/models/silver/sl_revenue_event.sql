{{ config(materialized='table') }}

select
    cdr_id,
    caller_msisdn,
    plan_id,
    market,
    ingest_date,
    start_time,
    call_type,
    case
        when call_type = 'VOICE' then billable_minutes * 0.05
        when call_type = 'DATA'  then billable_mb * 0.02
        when call_type = 'SMS'   then 0.01
        else 0.0
    end as revenue_usd,
    is_roaming
from {{ ref('sl_cdr_clean') }}
