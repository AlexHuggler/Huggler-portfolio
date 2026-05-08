{{ config(materialized='table') }}

with src as (
    select * from {{ ref('br_cdr') }}
)
select
    cdr_id,
    caller_msisdn,
    callee_msisdn,
    start_time,
    duration_sec,
    case when call_type = 'VOICE' then ceil(duration_sec / 60.0) else 0 end as billable_minutes,
    bytes_used,
    round(bytes_used / 1048576.0, 3) as billable_mb,
    call_type,
    market,
    plan_id,
    coalesce(is_roaming, false) as is_roaming,
    ingest_date
from src
where caller_msisdn is not null
  and duration_sec >= 0
  and call_type in ('VOICE', 'SMS', 'DATA')
