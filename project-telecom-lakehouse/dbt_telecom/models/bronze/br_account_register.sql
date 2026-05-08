{{ config(materialized='view') }}

with caller_first_seen as (
    select
        caller_msisdn,
        min(start_time) as first_event_at,
        plan_id,
        market
    from {{ ref('br_cdr') }}
    group by caller_msisdn, plan_id, market
)
select
    {{ dbt_utils.generate_surrogate_key(['caller_msisdn']) }} as account_key,
    caller_msisdn,
    plan_id,
    market,
    first_event_at
from caller_first_seen
