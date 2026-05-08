{{ config(materialized='table') }}

select
    caller_msisdn,
    plan_id,
    market,
    ingest_date,
    sum(billable_minutes) as billable_minutes,
    sum(billable_mb) as billable_mb,
    count(*) filter (where call_type = 'VOICE') as voice_events,
    count(*) filter (where call_type = 'SMS') as sms_events,
    count(*) filter (where call_type = 'DATA') as data_events,
    sum(case when is_roaming then 1 else 0 end) as roaming_events
from {{ ref('sl_cdr_clean') }}
group by 1, 2, 3, 4
