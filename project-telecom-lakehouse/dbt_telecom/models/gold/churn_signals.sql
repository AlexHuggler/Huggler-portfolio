{{ config(materialized='table') }}

with per_caller as (
    select
        caller_msisdn,
        max(ingest_date) as last_active_date,
        sum(voice_events + sms_events + data_events) as events_30d,
        sum(roaming_events) as roaming_events
    from {{ ref('sl_account_daily') }}
    group by 1
)
select
    caller_msisdn,
    last_active_date,
    events_30d,
    roaming_events,
    case
        when events_30d <= 1 then 'high'
        when events_30d <= 5 then 'medium'
        else 'low'
    end as churn_risk
from per_caller
