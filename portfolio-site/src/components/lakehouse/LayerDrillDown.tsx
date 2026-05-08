import { useEffect, useRef, useState, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import samples from "../../data/lakehouse-samples.json";

/**
 * LayerDrillDown
 *
 * Three-tab interface (Bronze / Silver / Gold) showing schema, sample rows,
 * transformations, and DQ checks for each medallion tier. Driven externally
 * via `tier` + `onChange` so a sibling MedallionDiagram can swap tiers, but
 * also has internal state if used standalone. Tabs are keyboard navigable
 * (left/right arrows). Animations respect reduced-motion preferences.
 */

export type Tier = "bronze" | "silver" | "gold";

interface Props {
  tier?: Tier;
  onChange?: (tier: Tier) => void;
  id?: string;
}

interface BronzeRow {
  raw_payload: string;
  ingested_at: string;
  source_file: string;
  schema_version: string;
  ingest_partition: string;
}

interface SilverRow {
  caller: string;
  callee: string;
  start_time: string;
  duration_sec: number | null;
  call_type: string;
  market: string;
  is_valid: boolean;
  validation_notes: string | null;
}

interface GoldRow {
  market: string;
  month: string;
  total_revenue: number;
  active_subscribers: number;
  arpu: number;
  churn_rate_pct: number;
}

interface SchemaCol {
  name: string;
  type: string;
}

interface TierMeta {
  id: Tier;
  label: string;
  short: string;
  description: string;
  schema: SchemaCol[];
  transforms: string[];
  dqChecks: string[];
  rowCount: string;
  accent: string;
}

const TIERS: TierMeta[] = [
  {
    id: "bronze",
    label: "Bronze · Raw landings",
    short: "Bronze",
    description:
      "Append-only landing zone. We keep raw payloads as they arrived so any downstream issue is replayable.",
    schema: [
      { name: "raw_payload", type: "string (JSON)" },
      { name: "ingested_at", type: "timestamp" },
      { name: "source_file", type: "string" },
      { name: "schema_version", type: "string" },
      { name: "ingest_partition", type: "date" },
    ],
    transforms: [
      "Schema-on-read JSON parse",
      "Append to ingest partition",
      "Capture source file + ingested_at",
    ],
    dqChecks: [
      "Schema validation via Great Expectations",
      "Null-rate <= 2% on caller/callee",
      "Source-file checksum match",
    ],
    rowCount: "~ 1.2 B rows",
    accent: "#fbbf24",
  },
  {
    id: "silver",
    label: "Silver · Cleansed events",
    short: "Silver",
    description:
      "Normalized, validated events. Parsed columns, market enrichment, validation flags - no rows dropped.",
    schema: [
      { name: "caller", type: "string (E.164)" },
      { name: "callee", type: "string (E.164)" },
      { name: "start_time", type: "timestamp" },
      { name: "duration_sec", type: "int (nullable)" },
      { name: "call_type", type: "enum" },
      { name: "market", type: "string" },
      { name: "is_valid", type: "boolean" },
      { name: "validation_notes", type: "string (nullable)" },
    ],
    transforms: [
      "Format phone numbers (E.164 normalized)",
      "Discard self-calls and negative durations",
      "Resolve cell -> market lookup",
      "Mark validation issues without dropping",
    ],
    dqChecks: [
      "dbt unique on (caller, start_time)",
      "dbt not_null on caller, callee, start_time",
      "Range check: duration_sec in [0, 24h]",
    ],
    rowCount: "~ 1.18 B rows",
    accent: "#cbd5e1",
  },
  {
    id: "gold",
    label: "Gold · Business marts",
    short: "Gold",
    description:
      "Aggregated marts: market revenue, ARPU, churn signals. Optimized for BI consumers and dashboards.",
    schema: [
      { name: "market", type: "string" },
      { name: "month", type: "date (yyyy-MM)" },
      { name: "total_revenue", type: "decimal(18,2)" },
      { name: "active_subscribers", type: "int" },
      { name: "arpu", type: "decimal(10,2)" },
      { name: "churn_rate_pct", type: "decimal(5,2)" },
    ],
    transforms: [
      "Aggregate by market + month",
      "Compute ARPU = revenue / active_subscribers",
      "Derive churn_rate from cohort survival",
    ],
    dqChecks: [
      "Row count alert if month-over-month delta > 25%",
      "arpu within plausibility bounds",
      "Freshness SLA: gold lag < 6h",
    ],
    rowCount: "~ 4.2 K rows",
    accent: "#fcd34d",
  },
];

interface Fixture {
  bronze: BronzeRow[];
  silver: SilverRow[];
  gold: GoldRow[];
}

const FIXTURE = samples as Fixture;

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function BronzeTable({ rows }: { rows: BronzeRow[] }): JSX.Element {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs font-mono">
        <thead>
          <tr className="text-left text-muted">
            <th className="px-2 py-1.5 font-medium">raw_payload</th>
            <th className="px-2 py-1.5 font-medium">ingested_at</th>
            <th className="px-2 py-1.5 font-medium">source_file</th>
            <th className="px-2 py-1.5 font-medium">partition</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr
              key={i}
              className="border-t border-border align-top"
            >
              <td className="px-2 py-1.5 max-w-[280px] truncate" title={r.raw_payload}>
                {truncate(r.raw_payload, 56)}
              </td>
              <td className="px-2 py-1.5 whitespace-nowrap text-muted">
                {r.ingested_at}
              </td>
              <td className="px-2 py-1.5 max-w-[200px] truncate text-muted" title={r.source_file}>
                {r.source_file.split("/").slice(-2).join("/")}
              </td>
              <td className="px-2 py-1.5 whitespace-nowrap text-muted">
                {r.ingest_partition}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SilverTable({ rows }: { rows: SilverRow[] }): JSX.Element {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs font-mono">
        <thead>
          <tr className="text-left text-muted">
            <th className="px-2 py-1.5 font-medium">caller</th>
            <th className="px-2 py-1.5 font-medium">callee</th>
            <th className="px-2 py-1.5 font-medium">start_time</th>
            <th className="px-2 py-1.5 font-medium">dur (s)</th>
            <th className="px-2 py-1.5 font-medium">type</th>
            <th className="px-2 py-1.5 font-medium">market</th>
            <th className="px-2 py-1.5 font-medium">valid</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-border">
              <td className="px-2 py-1.5 whitespace-nowrap">{r.caller}</td>
              <td className="px-2 py-1.5 whitespace-nowrap">{r.callee}</td>
              <td className="px-2 py-1.5 whitespace-nowrap text-muted">
                {r.start_time}
              </td>
              <td className="px-2 py-1.5 whitespace-nowrap">
                {r.duration_sec ?? "null"}
              </td>
              <td className="px-2 py-1.5 whitespace-nowrap text-muted">
                {r.call_type}
              </td>
              <td className="px-2 py-1.5 whitespace-nowrap text-muted">
                {r.market}
              </td>
              <td className="px-2 py-1.5 whitespace-nowrap">
                {r.is_valid ? (
                  <span className="text-emerald-400">true</span>
                ) : (
                  <span
                    className="text-red-400"
                    title={r.validation_notes ?? undefined}
                  >
                    false
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GoldTable({ rows }: { rows: GoldRow[] }): JSX.Element {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs font-mono">
        <thead>
          <tr className="text-left text-muted">
            <th className="px-2 py-1.5 font-medium">market</th>
            <th className="px-2 py-1.5 font-medium">month</th>
            <th className="px-2 py-1.5 font-medium text-right">total_revenue</th>
            <th className="px-2 py-1.5 font-medium text-right">subscribers</th>
            <th className="px-2 py-1.5 font-medium text-right">arpu</th>
            <th className="px-2 py-1.5 font-medium text-right">churn %</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-border">
              <td className="px-2 py-1.5 whitespace-nowrap">{r.market}</td>
              <td className="px-2 py-1.5 whitespace-nowrap text-muted">
                {r.month}
              </td>
              <td className="px-2 py-1.5 whitespace-nowrap text-right">
                ${r.total_revenue.toLocaleString()}
              </td>
              <td className="px-2 py-1.5 whitespace-nowrap text-right">
                {r.active_subscribers.toLocaleString()}
              </td>
              <td className="px-2 py-1.5 whitespace-nowrap text-right">
                ${r.arpu.toFixed(2)}
              </td>
              <td className="px-2 py-1.5 whitespace-nowrap text-right">
                {r.churn_rate_pct.toFixed(1)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function LayerDrillDown({
  tier: tierProp,
  onChange,
  id,
}: Props): JSX.Element {
  const reduced = useReducedMotion();
  const [internal, setInternal] = useState<Tier>("bronze");
  const tier = tierProp ?? internal;
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const setTier = useCallback(
    (t: Tier) => {
      setInternal(t);
      onChange?.(t);
    },
    [onChange],
  );

  // Sync internal state when external prop changes.
  useEffect(() => {
    if (tierProp && tierProp !== internal) {
      setInternal(tierProp);
    }
  }, [tierProp, internal]);

  // Listen for the global tier-select event so a sibling MedallionDiagram
  // (separate React island) can drive this component.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (e: Event): void => {
      const ce = e as CustomEvent<Tier>;
      if (ce.detail) {
        setInternal(ce.detail);
        onChange?.(ce.detail);
      }
    };
    window.addEventListener("lakehouse:tier-select", handler);
    return () =>
      window.removeEventListener("lakehouse:tier-select", handler);
  }, [onChange]);

  const meta = TIERS.find((t) => t.id === tier) ?? TIERS[0];

  function onKeyDown(e: React.KeyboardEvent<HTMLButtonElement>): void {
    const idx = TIERS.findIndex((t) => t.id === tier);
    if (idx === -1) return;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      const nextIdx = (idx + 1) % TIERS.length;
      const nextTier = TIERS[nextIdx].id;
      setTier(nextTier);
      tabRefs.current[nextIdx]?.focus();
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      const prevIdx = (idx - 1 + TIERS.length) % TIERS.length;
      const prevTier = TIERS[prevIdx].id;
      setTier(prevTier);
      tabRefs.current[prevIdx]?.focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      setTier(TIERS[0].id);
      tabRefs.current[0]?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      setTier(TIERS[TIERS.length - 1].id);
      tabRefs.current[TIERS.length - 1]?.focus();
    }
  }

  const tabContent = (() => {
    if (meta.id === "bronze") {
      return <BronzeTable rows={FIXTURE.bronze} />;
    }
    if (meta.id === "silver") {
      return <SilverTable rows={FIXTURE.silver} />;
    }
    return <GoldTable rows={FIXTURE.gold} />;
  })();

  return (
    <div className="demo-card" id={id}>
      <div
        role="tablist"
        aria-label="Medallion tier drill-down"
        className="flex gap-1 border-b border-border mb-4"
      >
        {TIERS.map((t, i) => {
          const active = t.id === tier;
          return (
            <button
              key={t.id}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              role="tab"
              type="button"
              aria-selected={active}
              aria-controls={`tier-panel-${t.id}`}
              id={`tier-tab-${t.id}`}
              tabIndex={active ? 0 : -1}
              onClick={() => setTier(t.id)}
              onKeyDown={onKeyDown}
              className={[
                "relative px-3 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-t-md",
                active
                  ? "text-fg"
                  : "text-muted hover:text-fg",
              ].join(" ")}
              style={
                active
                  ? {
                      borderBottom: `2px solid ${t.accent}`,
                      marginBottom: "-1px",
                    }
                  : undefined
              }
            >
              {t.short}
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id={`tier-panel-${meta.id}`}
        aria-labelledby={`tier-tab-${meta.id}`}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={meta.id}
            layout={!reduced}
            initial={reduced ? false : { opacity: 0, y: 6 }}
            animate={reduced ? undefined : { opacity: 1, y: 0 }}
            exit={reduced ? undefined : { opacity: 0, y: -4 }}
            transition={{ duration: reduced ? 0 : 0.22 }}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2 mb-1">
              <h3
                className="text-base font-semibold tracking-tight"
                style={{ color: meta.accent }}
              >
                {meta.label}
              </h3>
              <span className="placeholder-banner inline-block">
                {meta.rowCount} (illustrative)
              </span>
            </div>
            <p className="text-sm text-muted mb-4">{meta.description}</p>

            <div className="grid gap-4 lg:grid-cols-2">
              {/* Sample rows */}
              <div className="demo-surface">
                <p className="font-mono text-[10px] uppercase tracking-widest text-muted mb-2">
                  Sample rows
                </p>
                {tabContent}
              </div>

              {/* Schema */}
              <div className="demo-surface">
                <p className="font-mono text-[10px] uppercase tracking-widest text-muted mb-2">
                  Schema
                </p>
                <ul className="space-y-1 text-xs font-mono">
                  {meta.schema.map((c) => (
                    <li
                      key={c.name}
                      className="flex items-center justify-between gap-3 border-b border-border/40 pb-1 last:border-b-0 last:pb-0"
                    >
                      <span>{c.name}</span>
                      <span className="text-muted">{c.type}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Transformations */}
              <div className="demo-surface">
                <p className="font-mono text-[10px] uppercase tracking-widest text-muted mb-2">
                  Transformations applied
                </p>
                <ul className="space-y-1.5 text-sm">
                  {meta.transforms.map((t) => (
                    <li key={t} className="flex items-start gap-2">
                      <span
                        className="mt-1.5 inline-block h-1.5 w-1.5 rounded-full shrink-0"
                        style={{ background: meta.accent }}
                        aria-hidden="true"
                      />
                      <span>{t}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* DQ checks */}
              <div className="demo-surface">
                <p className="font-mono text-[10px] uppercase tracking-widest text-muted mb-2">
                  Data-quality checks
                </p>
                <ul className="space-y-1.5 text-sm">
                  {meta.dqChecks.map((d) => (
                    <li key={d} className="flex items-start gap-2">
                      <span
                        className="mt-1.5 inline-block h-1.5 w-1.5 rounded-full shrink-0 border"
                        style={{ borderColor: meta.accent }}
                        aria-hidden="true"
                      />
                      <span>{d}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
