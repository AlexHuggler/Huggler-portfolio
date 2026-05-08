{{ config(materialized='view') }}

with src as (
    select
        event_id,
        account_id,
        cast(amount as double) as amount,
        upper(currency) as currency,
        merchant_category,
        upper(country) as country,
        device_id,
        cast(ts as timestamp) as event_ts,
        label as fraud_label
    from {{ source('raw', 'tx_events') }}
)
select * from src
where amount > 0
