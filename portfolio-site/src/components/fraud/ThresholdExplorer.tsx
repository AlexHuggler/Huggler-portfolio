import type { JSX } from "react";
import { useCallback, useId, useMemo, useState } from "react";
import EChart from "../viz/EChart";
import ChartCard from "../viz/ChartCard";
import { axisLabel, grid, legend, lineStyle, motion, splitLine, tooltip, type VizTokens } from "../viz/theme";
import { detectors, type SweepRow } from "../../data/artifacts";

/**
 * Threshold explorer over the real sweeps exported by scripts/artifacts/fraud.py:
 * the detector re-run at every threshold against the same labeled make-eval set.
 * Pick a detector and a threshold to read precision / recall / F1 and how many
 * accounts would be flagged, relative to the threshold the code ships with.
 */

type Kind = "velocity" | "amount";
const CONFIG: Record<Kind, { label: string; unit: string; shipped: number; rows: SweepRow[]; fmt: (n: number) => string }> = {
  velocity: {
    label: "Velocity",
    unit: "events in 60 s",
    shipped: detectors.constants.VELOCITY_THRESHOLD,
    rows: detectors.sweeps.velocity,
    fmt: (n) => String(n),
  },
  amount: {
    label: "Amount z-score",
    unit: "standard deviations",
    shipped: detectors.constants.ZSCORE_THRESHOLD,
    rows: detectors.sweeps.amount,
    fmt: (n) => n.toFixed(1),
  },
};

function bestF1(rows: SweepRow[]): SweepRow {
  return rows.reduce((a, b) => (b.f1 > a.f1 ? b : a));
}

export default function ThresholdExplorer(): JSX.Element {
  const [kind, setKind] = useState<Kind>("velocity");
  const cfg = CONFIG[kind];
  const best = useMemo(() => bestF1(cfg.rows), [cfg]);
  const [selected, setSelected] = useState<Record<Kind, number>>({
    velocity: bestF1(CONFIG.velocity.rows).threshold,
    amount: bestF1(CONFIG.amount.rows).threshold,
  });
  const sel = cfg.rows.find((r) => r.threshold === selected[kind]) ?? best;
  const shipped = cfg.rows.find((r) => r.threshold === cfg.shipped)!;
  const groupName = useId();

  const buildOption = useCallback(
    (t: VizTokens, _m: unknown, reduced: boolean) => {
      const xs = cfg.rows.map((r) => cfg.fmt(r.threshold));
      const series = (name: string, key: "precision" | "recall" | "f1", color: string) => ({
        name,
        type: "line" as const,
        data: cfg.rows.map((r) => r[key]),
        ...lineStyle(t, color),
        showSymbol: true,
      });
      return {
        ...motion(reduced),
        grid: grid({ top: 40, right: 24 }),
        legend: legend(t, { top: 0, left: 0 }),
        tooltip: tooltip(t, {
          trigger: "axis",
          valueFormatter: (v: unknown) => (typeof v === "number" ? v.toFixed(2) : String(v)),
        }),
        xAxis: {
          type: "category",
          data: xs,
          boundaryGap: false,
          name: cfg.unit,
          nameLocation: "middle",
          nameGap: 28,
          nameTextStyle: { color: t.muted, fontSize: 10 },
          axisLabel: axisLabel(t),
          axisLine: { lineStyle: { color: t.border } },
        },
        yAxis: { type: "value", min: 0, max: 1, interval: 0.25, axisLabel: axisLabel(t), splitLine: splitLine(t) },
        series: [
          {
            ...series("Precision", "precision", t.series[0]),
            markLine: {
              symbol: "none",
              silent: true,
              label: { color: t.muted, fontSize: 10, formatter: "{b}" },
              data: [
                { name: "shipped", xAxis: cfg.fmt(cfg.shipped), lineStyle: { color: t.muted, type: "dashed", width: 1 } },
                ...(sel.threshold !== cfg.shipped
                  ? [{ name: "selected", xAxis: cfg.fmt(sel.threshold), lineStyle: { color: t.accent, type: "solid", width: 1.5 } }]
                  : []),
              ],
            },
          },
          series("Recall", "recall", t.series[1]),
          series("F1", "f1", t.series[2]),
        ],
      };
    },
    [cfg, sel.threshold],
  );

  const delta = (a: number, b: number, digits = 2) => {
    const d = a - b;
    if (Math.abs(d) < 10 ** -digits / 2) return "±0";
    return `${d > 0 ? "+" : "−"}${Math.abs(d).toFixed(digits)}`;
  };

  return (
    <ChartCard
      id="threshold-explorer"
      title="Precision / recall as the threshold moves"
      subtitle="Each point re-runs the detector on the full labeled set — account-level scoring, same as make eval."
      provenance={{
        label: "Real sweep · make eval set",
        title: "scripts/artifacts/fraud.py patches the detector's threshold constant and re-scores against the producer's ground-truth labels.",
        kind: "real",
      }}
      controls={
        <div className="flex flex-col gap-3">
          <div className="segmented self-start" role="group" aria-label="Detector">
            {(Object.keys(CONFIG) as Kind[]).map((k) => (
              <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}>
                {CONFIG[k].label}
              </button>
            ))}
          </div>
          <fieldset>
            <legend className="mb-2 font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
              Threshold ({cfg.unit})
            </legend>
            <div className="flex flex-wrap gap-1.5">
              {cfg.rows.map((r) => {
                const checked = r.threshold === sel.threshold;
                return (
                  <label key={r.threshold} className={`chip-toggle cursor-pointer ${checked ? "!border-accent/60 !bg-accent/10 !text-accent-fg" : ""}`}>
                    <input
                      type="radio"
                      className="sr-only"
                      name={groupName}
                      value={r.threshold}
                      checked={checked}
                      onChange={() => setSelected((s) => ({ ...s, [kind]: r.threshold }))}
                    />
                    {cfg.fmt(r.threshold)}
                    {r.threshold === cfg.shipped && <span className="text-[9px] uppercase tracking-wider opacity-70">shipped</span>}
                  </label>
                );
              })}
            </div>
          </fieldset>
        </div>
      }
      takeaway={
        <>
          {cfg.label} at {cfg.fmt(sel.threshold)}: precision {sel.precision.toFixed(2)} ({delta(sel.precision, shipped.precision)} vs shipped),
          recall {sel.recall.toFixed(2)} ({delta(sel.recall, shipped.recall)}), {sel.flaggedAccounts} accounts flagged
          vs {shipped.flaggedAccounts}. Best F1 is {best.f1.toFixed(2)} at {cfg.fmt(best.threshold)}.
        </>
      }
      table={{
        caption: `${cfg.label} detector threshold sweep`,
        columns: ["Threshold", "Precision", "Recall", "F1", "Accounts flagged"],
        rows: cfg.rows.map((r) => [cfg.fmt(r.threshold), r.precision.toFixed(3), r.recall.toFixed(3), r.f1.toFixed(3), r.flaggedAccounts]),
      }}
      height={300}
      renderChart={(h) => (
        <EChart
          buildOption={buildOption}
          height={h}
          ariaLabel={`${cfg.label} detector: precision, recall and F1 across thresholds. Shipped threshold ${cfg.fmt(cfg.shipped)}; best F1 ${best.f1.toFixed(2)} at ${cfg.fmt(best.threshold)}.`}
        />
      )}
    />
  );
}
