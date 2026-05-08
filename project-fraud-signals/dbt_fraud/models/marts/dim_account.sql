{{ config(materialized='table') }}

with txn as (
    select * from {{ ref('stg_transactions') }}
),
agg as (
    select
        account_id,
        min(event_ts) as first_seen_at,
        max(event_ts) as last_seen_at,
        count(*) as event_count,
        avg(amount) as avg_amount,
        stddev_pop(amount) as stddev_amount,
        max(country) as last_country,
        sum(case when fraud_label is not null and fraud_label <> 'normal' then 1 else 0 end) as labeled_fraud_events
    from txn
    group by 1
)
select * from agg
