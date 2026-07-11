{#-
  Local replacement for dbt_utils.generate_surrogate_key so the project has
  zero package downloads and `make dbt-run` works fully offline. Same shape:
  md5 over null-safe, '-'-joined column casts.
-#}
{%- macro generate_surrogate_key(field_list) -%}
md5(
  {%- for field in field_list -%}
    coalesce(cast({{ field }} as varchar), '_null_')
    {%- if not loop.last %} || '-' || {% endif -%}
  {%- endfor -%}
)
{%- endmacro -%}
