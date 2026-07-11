/**
 * Theme tokens + small option helpers shared by the ECharts dashboards.
 *
 * All colors are read at runtime from the CSS custom properties defined in
 * src/styles/global.css — the single source of truth. The site toggles
 * dark/light by adding/removing the `dark` class on <html>; charts read the
 * current computed values and rebuild their option, so they restyle live on
 * toggle. Hex fallbacks below mirror global.css for non-DOM contexts (tests).
 */

export type VizMode = "dark" | "light";

export interface VizTokens {
  fg: string;
  muted: string;
  accent: string;
  accent2: string;
  border: string;
  grid: string;
  tooltipBg: string;
  series: string[];
}

/** Static fallbacks mirroring global.css, keyed by mode. */
const FALLBACK: Record<VizMode, Omit<VizTokens, "series"> & { series: string[] }> = {
  light: {
    fg: "#111113",
    muted: "#52525b",
    accent: "#2563eb",
    accent2: "#0891b2",
    border: "#e4e4e7",
    grid: "#e4e4e7",
    tooltipBg: "#ffffff",
    // Categorical series validated against #ffffff (dataviz six checks).
    series: ["#2563eb", "#b45309", "#7c3aed", "#059669", "#dc2626", "#0891b2"],
  },
  dark: {
    fg: "#ededf0",
    muted: "#a1a1aa",
    accent: "#3b82f6",
    accent2: "#22d3ee",
    border: "#232329",
    grid: "#26262b",
    tooltipBg: "#111114",
    // Categorical series validated against #111114 (dataviz six checks).
    series: ["#3b82f6", "#d97706", "#a855f7", "#059669", "#ef4444", "#0891b2"],
  },
};

/** Read one CSS custom property off <html>, with a fallback. */
export function cssToken(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  if (!raw) return fallback;
  // Color tokens are stored as "R G B" triplets; viz tokens as plain hex.
  return /^\d+ \d+ \d+$/.test(raw) ? `rgb(${raw.split(/\s+/).join(", ")})` : raw;
}

export function getTokens(mode: VizMode): VizTokens {
  const fb = FALLBACK[mode];
  return {
    fg: cssToken("--color-fg", fb.fg),
    muted: cssToken("--color-muted", fb.muted),
    accent: cssToken("--color-accent", fb.accent),
    accent2: cssToken("--color-accent-2", fb.accent2),
    border: cssToken("--color-border", fb.border),
    grid: cssToken("--color-border", fb.grid),
    tooltipBg: cssToken("--color-surface", fb.tooltipBg),
    series: fb.series.map((hex, i) => cssToken(`--viz-series-${i + 1}`, hex)),
  };
}

/** Categorical series palette for the current document theme. */
export const VIZ_SERIES = FALLBACK.dark.series;

/** Tooltip styling that follows the theme. */
export function tooltip(t: VizTokens, extra: Record<string, unknown> = {}) {
  return {
    backgroundColor: t.tooltipBg,
    borderColor: t.border,
    borderWidth: 1,
    textStyle: { color: t.fg, fontSize: 12 },
    ...extra,
  };
}

export function axisLabel(t: VizTokens) {
  return { color: t.muted, fontSize: 11 };
}

export function axisLine(t: VizTokens) {
  return { show: true, lineStyle: { color: t.border } };
}

export function splitLine(t: VizTokens) {
  return { show: true, lineStyle: { color: t.grid, type: "dashed" as const } };
}

export function legend(t: VizTokens, extra: Record<string, unknown> = {}) {
  return {
    textStyle: { color: t.muted, fontSize: 11 },
    inactiveColor: t.border,
    ...extra,
  };
}

/** Standard grid with room for axis labels. */
export function grid(extra: Record<string, unknown> = {}) {
  return { left: 8, right: 16, top: 28, bottom: 24, containLabel: true, ...extra };
}

/** Format a number as compact USD. */
export function usd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
  return `$${n.toFixed(0)}`;
}
