/**
 * Working principles — each one points at the place on this site (or in
 * the career record) where it is visibly practised, so none is a slogan.
 */
export interface Principle {
  title: string;
  body: string;
  evidence: { label: string; href: string };
}

export const principles: Principle[] = [
  {
    title: "Contracts at the boundary",
    body: "Agree the shape of data with the people who consume it, then encode it: expectations where data enters, tests where models leave. At AT&T that meant contracts and SCD strategies with downstream teams.",
    evidence: { label: "Bronze contract + dbt test surface", href: "/projects/telecom-lakehouse#contracts" },
  },
  {
    title: "Measure, don't assert",
    body: "A number earns its place with a method and a transcript. Every demo metric here is re-run from the project's own make targets and cross-checked before it ships.",
    evidence: { label: "Evidence ledger", href: "/evidence" },
  },
  {
    title: "Say what isn't done",
    body: "Stubs, gaps, and inflated scores get named rather than buried. A reviewer should learn the limits from me, not discover them in the repo.",
    evidence: { label: "Not measured + known limitations", href: "/evidence#limitations" },
  },
  {
    title: "SLAs are a design input",
    body: "Daily and intraday deadlines shape partitioning, cluster sizing, caching, and merge strategy from the start — not as tuning after the first missed run.",
    evidence: { label: "Fraud platform experience", href: "/about#experience" },
  },
  {
    title: "AI multiplies, humans decide",
    body: "LLMs draft, review, and scaffold; parsers and tests keep them honest. The SQL optimizer hands Claude structured findings and prints diffs — it never rewrites files on its own.",
    evidence: { label: "SQL optimizer workbench", href: "/projects/ai-sql-optimizer#workbench" },
  },
];
