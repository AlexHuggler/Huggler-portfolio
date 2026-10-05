/**
 * Typed views over the artifact fixtures exported from the real projects by
 * scripts/artifacts/*.py. JSON imports infer loose union types; these
 * interfaces give components (and astro check) the real shapes.
 */
import corpusRaw from "./sqlopt/corpus.json";
import detectorsRaw from "./fraud/detectors.json";
import dashboardRaw from "./fraud/dashboard.json";
import feedRaw from "./fraud/feed.json";
import dagsRaw from "./lakehouse/dags.json";
import dbtRaw from "./lakehouse/dbt.json";
import contractsRaw from "./lakehouse/contracts.json";
import samplesRaw from "./lakehouse/samples.json";

interface Meta {
  synthetic: boolean;
  generatedBy: string;
  source: string;
  note: string;
  sourceDigest?: string;
}

/* ---------------- SQL optimizer ---------------- */
export interface Finding { rule: string; severity: "info" | "warn" | "high"; message: string }
export interface KeywordHit { keyword: string; inFindings: boolean; inQueryText: boolean }
export interface DiffLine { op: "eq" | "add" | "del"; text: string }
export interface CorpusQuery {
  id: string;
  n: number;
  category: string;
  engineTag: string;
  parsedAs: string;
  note: string;
  sql: string;
  stats: { tables: number; ctes: number; joins: number; lines: number };
  findings: Finding[];
  groundTruth: { keywords: string[]; costDirection: string };
  keywordHits: KeywordHit[];
  benchmark: { keywordOverlap: number; findingsHit: boolean; keywordOverlapFindingsOnly: number };
  payload: string;
  withPartitionColumns?: { columns: string[]; findings: Finding[] };
  rewrite?: {
    sql: string;
    dialect: string;
    parses: boolean;
    findingsAfter: Finding[];
    keywordsMatched: string[];
    diff: DiffLine[];
    source: string;
  };
}
export interface Corpus {
  _meta: Meta & { sqlglot: string };
  summary: {
    queries: number;
    meanKeywordOverlap: number;
    meanKeywordOverlapFindingsOnly: number;
    queriesWithFindings: number;
    rulesFired: string[];
    rulesNeverFired: string[];
  };
  rules: { id: string; severity: "info" | "warn" | "high"; message: string; firesOn: string[] }[];
  prompt: string;
  queries: CorpusQuery[];
}
export const corpus = corpusRaw as unknown as Corpus;

/* ---------------- Fraud ---------------- */
export type DetectorKind = "velocity" | "geo" | "amount";
export interface Score {
  kind: DetectorKind;
  label: string;
  trueAccounts: number;
  flaggedAccounts: number;
  truePositives: number;
  precision: number;
  recall: number;
  f1: number;
}
export interface SweepRow { threshold: number; precision: number; recall: number; f1: number; flaggedAccounts: number }
export interface Detectors {
  _meta: Meta;
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
  constants: Record<string, number>;
  kindToLabel: Record<DetectorKind, string>;
  source: Record<DetectorKind, string>;
  scores: Score[];
  sweeps: { velocity: SweepRow[]; amount: SweepRow[] };
  normalRatePerAccountPerMin: number;
}
export const detectors = detectorsRaw as unknown as Detectors;

export const FRAUD_LABELS = ["normal", "velocity_burst", "impossible_travel", "amount_outlier"] as const;
export type FraudLabel = (typeof FRAUD_LABELS)[number];
type LabelCounts = Record<FraudLabel, number>;
export interface FraudDashboard {
  _meta: Meta;
  kpis: { events: number; accounts: number; labeledEvents: number; labeledEventShare: number; flaggedEvents: number; flaggedAccounts: number };
  labelCounts: LabelCounts;
  byCategory: (LabelCounts & { category: string; total: number; labeledShare: number })[];
  byCountry: (LabelCounts & { country: string; total: number; labeledShare: number })[];
  amountBuckets: (LabelCounts & { bucket: string })[];
  timeline: { t: number; events: number; labeled: number; flagged: number }[];
  bucketSec: number;
  travelDestinations: Record<string, number>;
  countries: string[];
  scores: Score[];
}
export const fraudDashboard = dashboardRaw as unknown as FraudDashboard;

export interface FeedEvent {
  i: number;
  t: number;
  account: string;
  amount: number;
  category: string;
  country: string;
  label: FraudLabel;
  flags: DetectorKind[];
  accountFlags: DetectorKind[];
}
export const feed = feedRaw as unknown as { _meta: Meta; offset: number; events: FeedEvent[] };

/* ---------------- Lakehouse ---------------- */
export interface DagTask { id: string; operator: string; callable?: string; doc?: string; command?: string }
export interface Dag {
  id: string;
  description: string;
  schedule: string;
  startDate: string;
  catchup: boolean;
  tags: string[];
  doc: string;
  defaultArgs: { owner?: string; retries?: number; retry_delay?: { timedelta: Record<string, number> }; depends_on_past?: boolean };
  tasks: DagTask[];
  edges: [string, string][];
  file: string;
}
export const dags = dagsRaw as unknown as { _meta: Meta; dags: Dag[] };

export interface DbtTest { column: string; type: string; detail?: string; to?: string }
export interface DbtModel {
  id: string;
  layer: "bronze" | "silver" | "gold";
  materialized: string;
  description: string;
  refs: string[];
  sources: string[];
  tests: DbtTest[];
  sql: string;
  file: string;
}
export const dbt = dbtRaw as unknown as {
  _meta: Meta;
  source: { id: string; description: string; location: string; tests: DbtTest[] };
  models: DbtModel[];
  testCount: number;
  testTypes: string[];
};

export interface Expectation { type: string; column: string | null; rule: string; kwargs: Record<string, unknown> }
export const contracts = contractsRaw as unknown as { _meta: Meta; suite: string; description: string; expectations: Expectation[] };

export interface LayerSample {
  rows: number;
  schema: { column: string; type: string }[];
  sample: Record<string, string | number | boolean | null>[];
}
export const samples = samplesRaw as unknown as {
  _meta: Meta;
  partitions: number;
  layers: Record<"bronze" | "silver" | "gold.revenue_by_market" | "gold.arpu_monthly" | "gold.churn_signals", LayerSample>;
  gold: {
    revenueByMarket: { market: string; day: string; revenueUsd: number; events: number }[];
    arpuMonthly: { plan: string; arpuUsd: number; activeCallers: number }[];
    churnRisk: Record<string, number>;
  };
  distinctCallers: number;
  callMix: Record<string, number>;
};
