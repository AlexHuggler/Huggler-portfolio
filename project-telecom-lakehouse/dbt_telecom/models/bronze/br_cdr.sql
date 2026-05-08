{{ config(materialized='view') }}

select
    cdr_id,
    caller_msisdn,
    nullif(callee_msisdn, '') as callee_msisdn,
    cast(start_time as timestamp) as start_time,
    cast(duration_sec as integer) as duration_sec,
    cast(bytes_used as bigint) as bytes_used,
    upper(call_type) as call_type,
    upper(market) as market,
    plan_id,
    cast(is_roaming as boolean) as is_roaming,
    cast(ingest_date as date) as ingest_date
from {{ source('raw', 'cdr_raw') }}
