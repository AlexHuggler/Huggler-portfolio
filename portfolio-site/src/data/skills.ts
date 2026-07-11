/** Skills matrix data for the About page. */
export interface SkillArea {
  area: string;
  tools: string;
  level: "Expert" | "Advanced" | "Working";
}

export const skills: SkillArea[] = [
  { area: "Compute", tools: "PySpark, Spark Structured Streaming, Databricks", level: "Expert" },
  { area: "Modeling", tools: "dbt, SQL, dimensional modeling", level: "Expert" },
  { area: "Languages", tools: "Python, SQL, Bash, a little Scala", level: "Expert" },
  { area: "Cloud", tools: "Azure (ADF, ADLS Gen2, Synapse), AWS (S3, Glue, Athena)", level: "Advanced" },
  { area: "Lakehouse", tools: "Delta Lake, Apache Iceberg, Parquet", level: "Advanced" },
  { area: "Warehouse", tools: "Snowflake, Synapse Dedicated SQL", level: "Advanced" },
  { area: "Orchestration", tools: "Apache Airflow, ADF, Databricks Workflows", level: "Advanced" },
  { area: "Streaming", tools: "Apache Kafka, Spark Structured Streaming", level: "Advanced" },
  { area: "Infra", tools: "Terraform, Docker, GitHub Actions", level: "Working" },
  { area: "ML / AI", tools: "Azure ML, Anthropic API, prompt engineering for data tooling", level: "Working" },
];
