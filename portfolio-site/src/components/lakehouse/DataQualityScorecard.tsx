import type { JSX } from "react";
import { useMemo } from "react";
import { CheckCircle2, ShieldCheck, Fingerprint, Clock } from "lucide-react";
import EChart from "../viz/EChart";
import { cssToken, type VizTokens } from "../viz/theme";

/**
 * DataQualityScorecard
 *
 * Four-card grid of placeholder DQ metrics rendered as ring gauges via the
 * shared ECharts wrapper, colored from the design tokens so they follow the
 * theme. Numbers are explicitly illustrative. Includes a visually-hidden
 * table fallback for screen-reader users.
 */

interface Metric {
  key: string;
  label: string;
  description: string;
  value: number;
  /** CSS custom property carrying the metric color. */
  tokenVar: string;
  /** Fallback hex mirroring global.css (non-DOM contexts). */
  fallback: string;
  icon: typeof CheckCircle2;
}

const METRICS: Metric[] = [
  {
    key: "completeness",
    label: "Completeness",
    description: "% of records with all required fields populated.",
    value: 99.4,
    tokenVar: "--color-success",
    fallback: "#34d399",
    icon: CheckCircle2,
  },
  {
    key: "validity",
    label: "Validity",
    description: "% of records that pass type, range, and regex checks.",
    value: 98.7,
    tokenVar: "--color-accent",
    fallback: "#3b82f6",
    icon: ShieldCheck,
  },
  {
    key: "uniqueness",
    label: "Uniqueness",
    description: "% of records with no duplicate primary key.",
    value: 100,
    tokenVar: "--viz-series-3",
    fallback: "#a855f7",
    icon: Fingerprint,
  },
  {
    key: "freshness",
    label: "Freshness",
    description: "% of partitions arriving within their SLA window.",
    value: 99.9,
    tokenVar: "--color-warn",
    fallback: "#fbbf24",
    icon: Clock,
  },
];

interface GaugeProps {
  metric: Metric;
}

function Gauge({ metric }: GaugeProps): JSX.Element {
  const buildOption = useMemo(() => {
    return (t: VizTokens, _mode: string, reduced: boolean) => {
      const color = cssToken(metric.tokenVar, metric.fallback);
      return {
        animation: !reduced,
        animationDuration: 500,
        series: [
          {
            type: "pie",
            radius: ["74%", "96%"],
            startAngle: 90,
            silent: true,
            label: { show: false },
            data: [
              {
                value: metric.value,
                itemStyle: { color, borderRadius: 6 },
              },
              {
                value: 100 - metric.value,
                itemStyle: { color: `${t.border}` },
              },
            ],
          },
        ],
      };
    };
  }, [metric]);

  return (
    <div
      className="relative"
      style={{ width: "100%", maxWidth: 140 }}
    >
      <EChart
        buildOption={buildOption}
        height={140}
        ariaLabel={`${metric.label} gauge at ${metric.value.toFixed(1)} percent (illustrative)`}
      />
      <div
        className="absolute inset-0 flex items-center justify-center pointer-events-none"
        aria-hidden="true"
      >
        <span
          className="font-mono text-lg font-semibold"
          style={{ color: `rgb(var(${metric.tokenVar}, ${metric.fallback}))` }}
        >
          {metric.value.toFixed(1)}%
        </span>
      </div>
    </div>
  );
}

interface Props {
  id?: string;
}

export default function DataQualityScorecard({ id }: Props): JSX.Element {
  return (
    <div id={id}>
      <div className="mb-3">
        <span
          className="data-chip"
          title="Values are illustrative placeholders for the demo - the measured numbers come from the project's dbt test runs (41/41 passing)."
        >
          Synthetic demo data
        </span>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {METRICS.map((m) => {
          const Icon = m.icon;
          return (
            <article
              key={m.key}
              className="demo-card flex flex-col items-center text-center"
              aria-labelledby={`dq-${m.key}-label`}
            >
              <div className="flex items-center gap-2 self-start">
                <span className="rounded-md border border-border p-1.5">
                  <Icon
                    className="h-4 w-4"
                    style={{ color: `rgb(var(${m.tokenVar}, ${m.fallback}))` }}
                    aria-hidden="true"
                  />
                </span>
                <h3
                  id={`dq-${m.key}-label`}
                  className="text-sm font-semibold tracking-tight"
                >
                  {m.label}
                </h3>
              </div>
              <div className="my-3 w-full flex items-center justify-center">
                <Gauge metric={m} />
              </div>
              <p className="text-xs text-muted">{m.description}</p>
            </article>
          );
        })}
      </div>
      <table className="visually-hidden">
        <caption>
          Data quality scorecard - illustrative placeholder values.
        </caption>
        <thead>
          <tr>
            <th>Metric</th>
            <th>Value (%)</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          {METRICS.map((m) => (
            <tr key={m.key}>
              <td>{m.label}</td>
              <td>{m.value.toFixed(1)}</td>
              <td>{m.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
