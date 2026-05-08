{{ config(materialized='table') }}

with txn as (
    select * from {{ ref('stg_transactions') }}
),
acct as (
    select * from {{ ref('dim_account') }}
)
select
    t.event_id,
    t.account_id,
    t.amount,
    t.currency,
    t.merchant_category,
    t.country,
    t.device_id,
    t.event_ts,
    t.fraud_label,
    case
        when a.stddev_amount is null or a.stddev_amount = 0 then 0
        else (t.amount - a.avg_amount) / a.stddev_amount
    end as amount_zscore,
    a.event_count as account_event_count,
    a.last_country as account_last_country
from txn t
left join acct a using (account_id)
