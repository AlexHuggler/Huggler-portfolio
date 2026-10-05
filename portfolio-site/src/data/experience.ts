/**
 * Career record, taken from public/Alexandre_Huggler_Resume.pdf.
 *
 * These are production results from AT&T work: they cannot be re-run here,
 * so they are always presented as résumé-reported and kept visually apart
 * from the reproducible demo metrics in measured.json. Projected figures are
 * labelled as projections. Contact details beyond email are deliberately
 * not published on the site.
 */

export interface ImpactFigure {
  value: string;
  label: string;
  kind: "realized" | "projected";
  context?: string;
}

export interface Role {
  id: string;
  company: string;
  title: string;
  location: string;
  start: string; // YYYY-MM
  end: string | null; // null = present
  summary: string;
  bullets: string[];
  impact: ImpactFigure[];
  stack: string[];
}

export const roles: Role[] = [
  {
    id: "att-fraud",
    company: "AT&T",
    title: "Advanced Analytics — Global Fraud Management",
    location: "Dallas, TX",
    start: "2023-03",
    end: null,
    summary:
      "Own production PySpark pipelines on Azure Databricks that curate billing, device, and authentication data for nationwide fraud investigations, under daily and intraday SLAs.",
    bullets: [
      "Built and maintain production PySpark pipelines over Delta Lake tables, curating billing, device, and authentication data that powers nationwide fraud investigations and downstream reporting.",
      "Hold daily and intraday SLAs by tuning cluster sizing, partitioning, caching, and Delta Lake merge logic; resolved skew and shuffle bottlenecks across high-cardinality fraud workloads.",
      "Partnered with downstream consumers to define data contracts, dimensional models, and SCD strategies — fewer rework cycles and clearer ownership across analytics teams.",
      "Translated investigative outputs into engineering work: high-velocity credit-card alerting that surfaced 1,200+ accounts with anomalous activity, and a fraud-pattern pipeline driving a $900K/yr reduction in fraud losses.",
      "Delivered a document-authentication data flow that identified missing foreign credit data as the top driver of customer stops, leading to a third-party vendor pilot.",
      "Brought GitHub Copilot and Claude Code into the team's PySpark and SQL workflow for pipeline scaffolding, SQL drafting, test generation, and PR review.",
    ],
    impact: [
      { value: "$900K/yr", label: "fraud-loss reduction", kind: "realized", context: "fraud-pattern pipeline" },
      { value: "1,200+", label: "anomalous accounts surfaced", kind: "realized", context: "high-velocity credit-card alerting" },
      { value: "~$500K/yr", label: "projected profit from vendor pilot", kind: "projected", context: "document-authentication data flow" },
      { value: "~$3M", label: "projected LTV per cohort", kind: "projected", context: "same pilot" },
    ],
    stack: ["PySpark", "Azure Databricks", "Delta Lake", "SQL", "Data contracts", "Dimensional modeling", "GitHub Copilot", "Claude Code"],
  },
  {
    id: "att-forecasting",
    company: "AT&T",
    title: "Forecasting Analyst — Cost and Contract Management",
    location: "Dallas, TX",
    start: "2020-06",
    end: "2023-03",
    summary:
      "Designed and shipped the automated ETL forecasting framework behind leadership forecasts for a ~$2.2B/yr portfolio.",
    bullets: [
      "Designed and shipped an automated ETL forecasting framework on Azure (Databricks, SQL, scheduled orchestration) covering AT&T's ~$2.2B/yr Consumer Tech Experience portfolio.",
      "Scaled it from 3 to 25 leadership-level forecasts and removed ~400+ hours/month of manual work.",
      "Built financial, HR, and time-reporting datasets for executive leadership (1 SVP, 7 VPs, 25 AVPs) through optimized ETL and dimensional modeling.",
      "Worked in Agile ceremonies translating business requirements into pipelines and data contracts.",
    ],
    impact: [
      { value: "~$2.2B/yr", label: "portfolio covered by the forecasting framework", kind: "realized", context: "Consumer Tech Experience" },
      { value: "3 → 25", label: "leadership forecasts automated", kind: "realized" },
      { value: "~400 hrs/mo", label: "manual work removed", kind: "realized", context: "3 → 25 leadership forecasts automated" },
      { value: "33", label: "executives served (1 SVP, 7 VPs, 25 AVPs)", kind: "realized" },
    ],
    stack: ["Azure Databricks", "SQL", "ETL orchestration", "Dimensional modeling", "Power BI"],
  },
];

/** The four career figures the homepage leads with. */
export const headlineImpact: (ImpactFigure & { role: string })[] = [
  { ...roles[0].impact[0], role: "Global Fraud Management" },
  { ...roles[0].impact[1], role: "Global Fraud Management" },
  { ...roles[1].impact[0], role: "Cost & Contract Management" },
  { ...roles[1].impact[2], role: "Cost & Contract Management" },
];

export const CAREER_START = "2020-06";

/** "2023-03" → "Mar 2023"; null → "Present". */
export function monthLabel(ym: string | null): string {
  if (!ym) return "Present";
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Whole years of experience since CAREER_START, at build time. */
export function yearsOfExperience(now = new Date()): number {
  const [y, m] = CAREER_START.split("-").map(Number);
  return Math.floor((now.getUTCFullYear() - y) + (now.getUTCMonth() + 1 - m) / 12);
}

export function durationLabel(start: string, end: string | null, now = new Date()): string {
  const [sy, sm] = start.split("-").map(Number);
  const [ey, em] = end ? end.split("-").map(Number) : [now.getUTCFullYear(), now.getUTCMonth() + 1];
  const months = (ey - sy) * 12 + (em - sm);
  const y = Math.floor(months / 12);
  const mo = months % 12;
  return [y && `${y} yr${y > 1 ? "s" : ""}`, mo && `${mo} mo`].filter(Boolean).join(" ");
}
