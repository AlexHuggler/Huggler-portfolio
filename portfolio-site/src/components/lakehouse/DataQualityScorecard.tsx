import { useEffect, useState } from "react";
import {
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
  PolarAngleAxis,
} from "recharts";
import { CheckCircle2, ShieldCheck, Fingerprint, Clock } from "lucide-react";

/**
 * DataQualityScorecard
 *
 * Four-card grid of placeholder DQ metrics rendered as radial gauges via
 * Recharts. Numbers are explicitly illustrative. Includes a visually-hidden
 * table fallback for screen-reader users and gates the chart on a mounted
 * state so SSR does not warn about ResponsiveContainer dimensions.
 */

interface Metric {
  key: string;
  label: string;
  description: string;
  value: number;
  color: string;
  icon: typeof CheckCircle2;
}

const METRICS: Metric[] = [
  {
    key: "completeness",
    label: "Completeness",
    description: "% of records with all required fields populated.",
    value: 99.4,
    color: "#10b981",
    icon: CheckCircle2,
  },
  {
    key: "validity",
    label: "Validity",
    description: "% of records that pass type, range, and regex checks.",
    value: 98.7,
    color: "#2563eb",
    icon: ShieldCheck,
  },
  {
    key: "uniqueness",
    label: "Uniqueness",
    description: "% of records with no duplicate primary key.",
    value: 100,
    color: "#a855f7",
    icon: Fingerprint,
  },
  {
    key: "freshness",
    label: "Freshness",
    description: "% of partitions arriving within their SLA window.",
    value: 99.9,
    color: "#f59e0b",
    icon: Clock,
  },
];

interface GaugeProps {
  value: number;
  color: string;
  mounted: boolean;
}

function Gauge({ value, color, mounted }: GaugeProps): JSX.Element {
  const data = [{ name: "score", value, fill: color }];
  return (
    <div
      className="relative"
      style={{ width: "100%", aspectRatio: "1 / 1", maxWidth: 140 }}
    >
      {mounted && (
        <ResponsiveContainer
          width="100%"
          height="100%"
          minWidth={80}
          minHeight={80}
        >
          <RadialBarChart
            cx="50%"
            cy="50%"
            innerRadius="72%"
            outerRadius="100%"
            barSize={10}
            data={data}
            startAngle={90}
            endAngle={-270}
          >
            <PolarAngleAxis
              type="number"
              domain={[0, 100]}
              angleAxisId={0}
              tick={false}
            />
            <RadialBar
              background={{ fill: "rgba(148,163,184,0.12)" }}
              dataKey="value"
              cornerRadius={6}
              isAnimationActive={false}
            />
          </RadialBarChart>
        </ResponsiveContainer>
      )}
      <div
        className="absolute inset-0 flex items-center justify-center pointer-events-none"
        aria-hidden="true"
      >
        <span className="font-mono text-lg font-semibold" style={{ color }}>
          {value.toFixed(1)}%
        </span>
      </div>
    </div>
  );
}

interface Props {
  id?: string;
}

export default function DataQualityScorecard({ id }: Props): JSX.Element {
  const [mounted, setMounted] = useState<boolean>(false);
  useEffect(() => setMounted(true), []);

  return (
    <div id={id}>
      <div className="placeholder-banner mb-3">
        Values are illustrative placeholders for the demo - real numbers come
        from the project's Great Expectations + dbt test runs.
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
                    style={{ color: m.color }}
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
                <Gauge value={m.value} color={m.color} mounted={mounted} />
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
