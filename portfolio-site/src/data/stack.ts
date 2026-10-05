/**
 * Stack, mapped to evidence. Proficiency follows the résumé's own wording:
 * tools listed plainly are "core"; tools it lists as "familiar with" stay
 * "familiar" here too. `production` marks tools the résumé's AT&T bullets
 * name explicitly; `projects` are the portfolio repos that actually use them.
 */

export type StackLevel = "core" | "familiar";
export type ProjectSlug = "fraud-signals" | "telecom-lakehouse" | "ai-sql-optimizer";

export interface StackItem {
  name: string;
  group: StackGroup;
  level: StackLevel;
  production?: boolean;
  projects: ProjectSlug[];
  note?: string;
}

export type StackGroup =
  | "Languages"
  | "Compute & streaming"
  | "Platforms & storage"
  | "Orchestration & modeling"
  | "Quality & delivery"
  | "BI & AI tooling";

export const stackGroups: StackGroup[] = [
  "Languages",
  "Compute & streaming",
  "Platforms & storage",
  "Orchestration & modeling",
  "Quality & delivery",
  "BI & AI tooling",
];

export const stack: StackItem[] = [
  { name: "Python", group: "Languages", level: "core", production: true, projects: ["fraud-signals", "telecom-lakehouse", "ai-sql-optimizer"] },
  { name: "SQL / T-SQL", group: "Languages", level: "core", production: true, projects: ["fraud-signals", "telecom-lakehouse", "ai-sql-optimizer"] },
  { name: "Bash", group: "Languages", level: "core", projects: [] },
  { name: "DAX / M", group: "Languages", level: "core", projects: [] },
  { name: "Scala", group: "Languages", level: "familiar", projects: [], note: "working knowledge" },

  { name: "PySpark", group: "Compute & streaming", level: "core", production: true, projects: ["fraud-signals"] },
  { name: "Spark Structured Streaming", group: "Compute & streaming", level: "core", projects: ["fraud-signals"] },
  { name: "Apache Kafka", group: "Compute & streaming", level: "familiar", projects: ["fraud-signals"] },
  { name: "DuckDB", group: "Compute & streaming", level: "familiar", projects: ["telecom-lakehouse"], note: "local medallion engine" },

  { name: "Azure Databricks", group: "Platforms & storage", level: "core", production: true, projects: [] },
  { name: "Delta Lake", group: "Platforms & storage", level: "core", production: true, projects: ["fraud-signals"] },
  { name: "Azure Synapse", group: "Platforms & storage", level: "core", projects: [] },
  { name: "Azure SQL", group: "Platforms & storage", level: "core", projects: [] },
  { name: "Snowflake", group: "Platforms & storage", level: "familiar", projects: ["ai-sql-optimizer"], note: "target dialect" },
  { name: "AWS S3 / Glue", group: "Platforms & storage", level: "familiar", projects: ["telecom-lakehouse"], note: "provisioned with Terraform" },
  { name: "Apache Iceberg", group: "Platforms & storage", level: "familiar", projects: ["telecom-lakehouse"], note: "target table format; the demo writes Parquet" },

  { name: "Apache Airflow", group: "Orchestration & modeling", level: "core", projects: ["telecom-lakehouse"] },
  { name: "dbt", group: "Orchestration & modeling", level: "core", projects: ["telecom-lakehouse", "fraud-signals"] },
  { name: "Azure Data Factory", group: "Orchestration & modeling", level: "core", projects: [] },
  { name: "Databricks Workflows", group: "Orchestration & modeling", level: "core", projects: [] },
  { name: "Dimensional modeling / SCD", group: "Orchestration & modeling", level: "core", production: true, projects: ["telecom-lakehouse"] },
  { name: "Medallion architecture", group: "Orchestration & modeling", level: "core", projects: ["telecom-lakehouse"] },

  { name: "Data contracts", group: "Quality & delivery", level: "core", production: true, projects: ["telecom-lakehouse"] },
  { name: "Great Expectations", group: "Quality & delivery", level: "familiar", projects: ["telecom-lakehouse"] },
  { name: "pytest", group: "Quality & delivery", level: "core", projects: ["fraud-signals", "telecom-lakehouse", "ai-sql-optimizer"] },
  { name: "GitHub Actions CI", group: "Quality & delivery", level: "core", projects: ["fraud-signals", "telecom-lakehouse", "ai-sql-optimizer"] },
  { name: "Terraform", group: "Quality & delivery", level: "familiar", projects: ["telecom-lakehouse"] },
  { name: "Docker", group: "Quality & delivery", level: "familiar", projects: ["fraud-signals", "telecom-lakehouse"] },

  { name: "Power BI", group: "BI & AI tooling", level: "core", projects: [] },
  { name: "Tableau", group: "BI & AI tooling", level: "core", projects: [] },
  { name: "Claude API / Claude Code", group: "BI & AI tooling", level: "core", production: true, projects: ["ai-sql-optimizer"] },
  { name: "GitHub Copilot", group: "BI & AI tooling", level: "core", production: true, projects: [] },
  { name: "sqlglot", group: "BI & AI tooling", level: "familiar", projects: ["ai-sql-optimizer"] },
];

export const projectNames: Record<ProjectSlug, string> = {
  "fraud-signals": "Fraud Signals",
  "telecom-lakehouse": "Telecom Lakehouse",
  "ai-sql-optimizer": "SQL Optimizer",
};
