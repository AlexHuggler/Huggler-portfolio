import { useEffect, useRef, useState } from "react";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { useReducedMotion } from "../../hooks/useReducedMotion";

/**
 * ThroughputChart
 *
 * Rolling 60-second area chart of synthetic events/sec. Updates every
 * second when active. Shows clearly-labeled placeholder latency p50/p95/p99
 * values so recruiters see where the project's measured numbers will land.
 */

interface Point {
  t: number;
  eventsPerSec: number;
}

const WINDOW_SEC = 60;
const baseline = 18;
const variance = 9;

export default function ThroughputChart() {
  const reduced = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [points, setPoints] = useState<Point[]>(() => {
    const out: Point[] = [];
    for (let i = WINDOW_SEC - 1; i >= 0; i--) {
      out.push({
        t: -i,
        eventsPerSec: baseline + Math.sin(i / 6) * variance * 0.4,
      });
    }
    return out;
  });
  const tickRef = useRef(0);

  useEffect(() => {
    if (reduced) return;
    const id = window.setInterval(() => {
      tickRef.current += 1;
      const t = tickRef.current;
      const next = baseline +
        Math.sin(t / 6) * variance * 0.6 +
        (Math.random() - 0.5) * variance;
      setPoints((prev) => {
        const updated = [...prev.slice(1), { t, eventsPerSec: Math.max(0, next) }];
        return updated;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [reduced]);

  return (
    <div className="demo-card">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <h3 className="text-sm font-semibold tracking-tight">
            Throughput (events/sec)
          </h3>
          <p className="text-xs text-muted">
            Rolling 60-second window · synthetic stream
          </p>
        </div>
        <div className="text-right text-[11px] text-muted leading-tight">
          <p className="font-mono">latency p50/p95/p99</p>
          <p>
            <span className="placeholder-banner inline-block px-1.5 py-0">
              illustrative placeholders
            </span>
          </p>
        </div>
      </div>
      <div className="h-44 w-full">
        {mounted && (
        <ResponsiveContainer width="100%" height="100%" minWidth={120} minHeight={120}>
          <AreaChart data={points} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
            <defs>
              <linearGradient id="thrFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#2563eb" stopOpacity={0.5} />
                <stop offset="100%" stopColor="#2563eb" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgba(148,163,184,0.1)" vertical={false} />
            <XAxis
              dataKey="t"
              tickLine={false}
              axisLine={false}
              tick={{ fill: "#64748b", fontSize: 10 }}
              tickFormatter={(v: number) => `${v}s`}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fill: "#64748b", fontSize: 10 }}
              width={32}
            />
            <Tooltip
              contentStyle={{
                background: "rgba(10,10,10,0.95)",
                border: "1px solid #1f1f23",
                borderRadius: 6,
                fontSize: 12,
              }}
              labelFormatter={(v) => `t=${v}s`}
              formatter={(v: number) => [`${v.toFixed(1)} ev/s`, "Throughput"]}
            />
            <Area
              type="monotone"
              dataKey="eventsPerSec"
              stroke="#2563eb"
              strokeWidth={1.5}
              fill="url(#thrFill)"
              isAnimationActive={!reduced}
              animationDuration={reduced ? 0 : 600}
            />
          </AreaChart>
        </ResponsiveContainer>
        )}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        {[
          { label: "p50", value: "~120ms" },
          { label: "p95", value: "~410ms" },
          { label: "p99", value: "~860ms" },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-md border border-border px-2 py-1.5"
          >
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted">
              {stat.label}
            </p>
            <p className="font-mono text-sm">{stat.value}</p>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-muted">
        Latency values shown as placeholders. Real numbers come from local Spark
        runs in the project repo.
      </p>
      <table className="visually-hidden">
        <caption>Throughput data points, last {WINDOW_SEC} seconds</caption>
        <thead>
          <tr><th>Second</th><th>Events per second</th></tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.t}><td>{p.t}</td><td>{p.eventsPerSec.toFixed(1)}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
