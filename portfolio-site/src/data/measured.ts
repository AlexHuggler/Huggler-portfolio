/**
 * Typed accessor for measured.json — the single provenance record for every
 * number the site presents as measured. The file is written only by
 * `python3 scripts/measure.py run` (which executes each project's own make
 * targets and cross-checks the exporters against their printed output) and
 * re-labelled by `scripts/measure.py render`. Never hand-edit a value here.
 */
import raw from "./measured.json";

export type MetricKind = "measured" | "count" | "defined";

export interface MeasuredMetric {
  id: string;
  value: string;
  label: string;
  sublabel: string;
  method: string;
  kind: MetricKind;
  caveat?: string;
}

export interface TestCounts {
  passed: number;
  skipped: number;
}

export interface DetectorScore {
  kind: "velocity" | "geo" | "amount";
  label: string;
  trueAccounts: number;
  flaggedAccounts: number;
  truePositives: number;
  precision: number;
  recall: number;
  f1: number;
}

export interface SweepRow {
  threshold: number;
  precision: number;
  recall: number;
  f1: number;
  flaggedAccounts: number;
}

export interface Evaluations {
  "ai-sql-optimizer": {
    method: string;
    transcript: string;
    tests: TestCounts;
    summary: {
      queries: number;
      meanKeywordOverlap: number;
      meanKeywordOverlapFindingsOnly: number;
      queriesWithFindings: number;
      rulesFired: string[];
      rulesNeverFired: string[];
    };
    byCategory: { category: string; keywordOverlap: number; findingsHitRate: number }[];
    analyzerLatencyMs: { median: number; p95: number; samples: number };
  };
  "fraud-signals": {
    method: string;
    transcript: string;
    tests: TestCounts;
    dataset: {
      events: number;
      accounts: number;
      ratePerSec: number;
      durationSec: number;
      producerFraudRate: number;
      labeledEvents: number;
      labeledEventShare: number;
      labelCounts: Record<string, number>;
      seed: number;
    };
    scores: DetectorScore[];
    sweeps: { velocity: SweepRow[]; amount: SweepRow[] };
    throughput: { events: number; secondsMedian: number; eventsPerSec: number; runs: number };
  };
  "telecom-lakehouse": {
    method: string;
    transcript: string;
    tests: TestCounts;
    dbt: { models: number; tests: number; testsPassed: number };
    dags: number;
    models: number;
    dbtTestsDeclared: number;
    geExpectations: number;
    rowCounts: Record<string, number>;
    partitions: number;
    transform: { secondsMedian: number; runs: number };
  };
}

export type ProjectSlug = keyof Evaluations;

export interface MeasuredData {
  schemaVersion: number;
  measuredAt: string;
  measuredOn: string;
  environment: string;
  environmentDetail: { os: string; python: string; uv: string; cpu: string; cpus: number };
  site: MeasuredMetric[];
  projects: Record<string, { metrics: MeasuredMetric[] }>;
  metrics: Record<string, MeasuredMetric>;
  evaluations: Evaluations;
  notMeasured: Record<string, string[]>;
}

export const measured = raw as unknown as MeasuredData;

export function projectMetrics(slug: string): MeasuredMetric[] {
  return measured.projects[slug]?.metrics ?? [];
}

/** Look up one metric by id; throws at build time if the id is unknown. */
export function metric(id: string): MeasuredMetric {
  const m = measured.metrics[id];
  if (!m) throw new Error(`Unknown measured metric id: ${id}`);
  return m;
}

export function allMetrics(): MeasuredMetric[] {
  return Object.values(measured.metrics);
}

export function evaluation<S extends ProjectSlug>(slug: S): Evaluations[S] {
  return measured.evaluations[slug];
}

/** "2026-10-05" -> "Oct 2026" for display. */
export function measuredLabel(): string {
  const d = new Date(`${measured.measuredOn}T00:00:00Z`);
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}
