/**
 * Build-time index for the ⌘K command palette: every page, every major
 * section, every dashboard tab, every measured metric, and a few actions.
 * Serialised into the page as JSON; the palette script ranks it client-side.
 */
import { allMetrics } from "./measured";
import { siteConfig } from "../site.config";

export type PaletteGroup = "Pages" | "Sections" | "Dashboards" | "Metrics" | "Actions";

export interface PaletteItem {
  id: string;
  title: string;
  subtitle?: string;
  group: PaletteGroup;
  /** Navigate here… */
  href?: string;
  /** …or run a named client action. */
  action?: "copy-email" | "toggle-theme" | "print";
  external?: boolean;
  keywords?: string;
}

const pages: PaletteItem[] = [
  { id: "p-home", title: "Home", subtitle: "Overview, evidence, selected work", href: "/", group: "Pages" },
  { id: "p-projects", title: "Projects", subtitle: "Three end-to-end projects + capability matrix", href: "/projects", group: "Pages", keywords: "work case studies portfolio" },
  { id: "p-fraud", title: "Real-Time Fraud Signals", subtitle: "Kafka → Spark → Delta · detectors vs ground truth", href: "/projects/fraud-signals", group: "Pages", keywords: "streaming kafka spark delta fraud anomaly velocity" },
  { id: "p-telecom", title: "Telecom Billing Lakehouse", subtitle: "Medallion · Airflow · dbt · Great Expectations", href: "/projects/telecom-lakehouse", group: "Pages", keywords: "lakehouse medallion bronze silver gold iceberg airflow dbt terraform cdr" },
  { id: "p-sqlopt", title: "AI-Assisted SQL Optimizer", subtitle: "sqlglot heuristics + Claude · real corpus", href: "/projects/ai-sql-optimizer", group: "Pages", keywords: "sql claude llm anthropic spark snowflake sqlglot" },
  { id: "p-dash", title: "Dashboards", subtitle: "Interactive BI-style dashboards", href: "/visualizations", group: "Pages", keywords: "visualizations charts echarts power bi tableau" },
  { id: "p-evidence", title: "Evidence ledger", subtitle: "Every number, its method, and its transcript", href: "/evidence", group: "Pages", keywords: "measured metrics methodology provenance transcript" },
  { id: "p-about", title: "About", subtitle: "Experience, stack, education", href: "/about", group: "Pages", keywords: "bio career at&t" },
  { id: "p-resume", title: "Résumé", subtitle: "HTML résumé + PDF", href: "/resume", group: "Pages", keywords: "resume cv experience" },
  { id: "p-contact", title: "Contact", subtitle: "Send a message", href: "/contact", group: "Pages", keywords: "email hire message" },
];

const sections: PaletteItem[] = [
  { id: "s-home-evidence", title: "Production impact vs. reproducible demos", subtitle: "Home", href: "/#evidence", group: "Sections" },
  { id: "s-home-principles", title: "How I work", subtitle: "Home", href: "/#principles", group: "Sections", keywords: "principles contracts tests observability" },
  { id: "s-home-stack", title: "Stack explorer", subtitle: "Home", href: "/#stack", group: "Sections", keywords: "skills technologies tools" },
  { id: "s-projects-matrix", title: "Capability matrix", subtitle: "Projects", href: "/projects#matrix", group: "Sections" },
  { id: "s-fraud-feed", title: "Event replay with detector verdicts", subtitle: "Fraud Signals", href: "/projects/fraud-signals#feed", group: "Sections" },
  { id: "s-fraud-detectors", title: "Detector source + precision/recall", subtitle: "Fraud Signals", href: "/projects/fraud-signals#detectors", group: "Sections" },
  { id: "s-fraud-thresholds", title: "Threshold explorer", subtitle: "Fraud Signals", href: "/projects/fraud-signals#thresholds", group: "Sections", keywords: "sweep calibration velocity zscore" },
  { id: "s-telecom-medallion", title: "Medallion layers: schemas + samples", subtitle: "Telecom Lakehouse", href: "/projects/telecom-lakehouse#medallion", group: "Sections", keywords: "bronze silver gold" },
  { id: "s-telecom-dags", title: "Airflow DAGs", subtitle: "Telecom Lakehouse", href: "/projects/telecom-lakehouse#orchestration", group: "Sections", keywords: "airflow schedule orchestration" },
  { id: "s-telecom-lineage", title: "dbt lineage explorer", subtitle: "Telecom Lakehouse", href: "/projects/telecom-lakehouse#lineage", group: "Sections", keywords: "dbt models refs" },
  { id: "s-telecom-contracts", title: "Data contracts + dbt tests", subtitle: "Telecom Lakehouse", href: "/projects/telecom-lakehouse#contracts", group: "Sections", keywords: "great expectations quality tests" },
  { id: "s-sql-workbench", title: "Query workbench", subtitle: "SQL Optimizer", href: "/projects/ai-sql-optimizer#workbench", group: "Sections", keywords: "rewrite diff findings" },
  { id: "s-sql-benchmark", title: "Benchmark keyword attribution", subtitle: "SQL Optimizer", href: "/projects/ai-sql-optimizer#benchmark", group: "Sections" },
  { id: "s-about-exp", title: "Experience timeline", subtitle: "About", href: "/about#experience", group: "Sections", keywords: "at&t fraud forecasting" },
];

const dashboards: PaletteItem[] = [
  { id: "d-telecom", title: "Telecom revenue & usage dashboard", subtitle: "Dashboards · scenario data", href: "/visualizations#telecom", group: "Dashboards", keywords: "arpu churn revenue heatmap" },
  { id: "d-fraud", title: "Fraud detection dashboard", subtitle: "Dashboards · make eval data", href: "/visualizations#fraud", group: "Dashboards", keywords: "precision recall detectors" },
  { id: "d-sqlopt", title: "SQL analyzer dashboard", subtitle: "Dashboards · real corpus", href: "/visualizations#sqlopt", group: "Dashboards", keywords: "rules findings coverage" },
];

const metrics: PaletteItem[] = allMetrics().map((m) => ({
  id: `m-${m.id}`,
  title: `${m.value} — ${m.label}`,
  subtitle: m.sublabel,
  href: `/evidence#m-${m.id}`,
  group: "Metrics",
  keywords: `${m.id} ${m.method}`,
}));

const actions: PaletteItem[] = [
  { id: "a-email", title: "Copy email address", subtitle: siteConfig.email, action: "copy-email", group: "Actions", keywords: "contact mail" },
  { id: "a-theme", title: "Toggle dark / light theme", action: "toggle-theme", group: "Actions", keywords: "dark light mode appearance" },
  { id: "a-resume", title: "Download résumé (PDF)", href: siteConfig.resumePath, group: "Actions", keywords: "resume cv pdf" },
  { id: "a-github", title: "Open GitHub profile", href: siteConfig.github, external: true, group: "Actions" },
  { id: "a-linkedin", title: "Open LinkedIn", href: siteConfig.linkedin, external: true, group: "Actions" },
  { id: "a-source", title: "View this site's source", href: siteConfig.githubRepo, external: true, group: "Actions", keywords: "repo code astro" },
  { id: "a-print", title: "Print this page", action: "print", group: "Actions" },
];

export const paletteItems: PaletteItem[] = [...pages, ...sections, ...dashboards, ...metrics, ...actions];
