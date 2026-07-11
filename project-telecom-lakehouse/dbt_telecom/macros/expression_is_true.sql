{#-
  Local replacement for the dbt_utils.expression_is_true generic test.
  Column-level usage evaluates "<column> <expression>"; model-level usage
  evaluates the expression as-is. Rows violating the expression fail.
-#}
{% test expression_is_true(model, expression, column_name=None) %}
select *
from {{ model }}
where not ({% if column_name %}{{ column_name }} {% endif %}{{ expression }})
{% endtest %}
