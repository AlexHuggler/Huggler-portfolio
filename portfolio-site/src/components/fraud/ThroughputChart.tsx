import type { JSX } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import EChart from "../viz/EChart";
import {
  axisLabel,
  splitLine,
  tooltip,
  type VizMode,
  type VizTokens,
} from "../viz/theme";
import { useReducedMotion } from "../../hooks/useReducedMotion";

/**
 * ThroughputChart
 *
 * Rolling 60-second area chart of synthetic events/sec, rendered with the
 * shared ECharts wrapper so it follows the design tokens and restyles live
 * on theme toggle. Updates every second when active.
 */

interface Point {
  t: number;
  eventsPerSec: number;
}

const WINDOW_SEC = 60;
const baseline = 18;
const variance = 9;

/** Apply alpha to a token color that may be `rgb(...)` or `#hex`. */
function withAlpha(color: string, alpha: number): string {
  if (color.startsWith("rgb(")) {
    return color.replace("rgb(", "rgba(").replace(")", `, ${alpha})`);
  }
  return `${color}${Math.round(alpha * 255)
    .toString(16)
    .padStart(2, "0")}`;
}

export default function ThroughputChart(): JSX.Element {
  const reduced = useReducedMotion();
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
      setPoints((prev) => [...prev.slice(1), { t, eventsPerSec: Math.max(0, next) }]);
    }, 1000);
    return () => window.clearInterval(id);
  }, [reduced]);

  const buildOption = useCallback(
    (t: VizTokens, _mode: VizMode, reducedMotion: boolean) => ({
      animation: !reducedMotion,
      animationDuration: 300,
      grid: { left: 8, right: 8, top: 10, bottom: 4, containLabel: true },
      tooltip: tooltip(t, {
        trigger: "axis",
        valueFormatter: (v: unknown) => `${Number(v).toFixed(1)} ev/s`,
      }),
      xAxis: {
        type: "category",
        boundaryGap: false,
        data: points.map((p) => `${p.t}s`),
        axisLabel: { ...axisLabel(t), interval: 14 },
        axisLine: { show: false },
        axisTick: { show: false },
      },
      yAxis: {
        type: "value",
        axisLabel: axisLabel(t),
        splitLine: splitLine(t),
      },
      series: [
        {
          name: "Throughput",
          type: "line",
          smooth: true,
          symbol: "none",
          data: points.map((p) => Number(p.eventsPerSec.toFixed(1))),
          lineStyle: { color: t.accent, width: 2 },
          areaStyle: {
            color: {
              type: "linear",
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: withAlpha(t.accent, 0.4) },
                { offset: 1, color: withAlpha(t.accent, 0) },
              ],
            },
          },
        },
      ],
    }),
    [points],
  );

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
            <span
              className="data-chip"
              title="Latency percentiles are illustrative placeholders; the measured detector numbers live in the repo README."
            >
              Synthetic demo data
            </span>
          </p>
        </div>
      </div>
      <EChart
        buildOption={buildOption}
        height={176}
        ariaLabel="Area chart of synthetic stream throughput over the last 60 seconds"
      />
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
        Latency values shown as placeholders. Measured detector throughput and
        precision/recall live in the repo README (make eval).
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
