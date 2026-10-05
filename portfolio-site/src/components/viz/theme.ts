/**
 * Theme tokens + small option helpers shared by every ECharts chart.
 *
 * All colors are read at runtime from the CSS custom properties defined in
 * src/styles/global.css — the single source of truth. The site toggles
 * dark/light by adding/removing the `dark` class on <html>; charts read the
 * current computed values and rebuild their option, so they restyle live on
 * toggle. Hex fallbacks below mirror global.css for non-DOM contexts (SSR).
 *
 * Mark specs follow the dataviz rules the site adopted: solid hairline grid,
 * ≤24px bars with a 4px rounded data end, 2px lines, ≥8px markers with a
 * surface ring, ~10% area wash, and text that never wears a series color.
 */

export type VizMode = "dark" | "light";

export interface VizTokens {
  fg: string;
  muted: string;
  accent: string;
  accent2: string;
  border: string;
  grid: string;
  surface: string;
  surface2: string;
  tooltipBg: string;
  success: string;
  warn: string;
  danger: string;
  tierBronze: string;
  tierSilver: string;
  tierGold: string;
  series: string[];
  mode: VizMode;
}

type Fallback = Omit<VizTokens, "mode">;

/** Static fallbacks mirroring global.css, keyed by mode. */
const FALLBACK: Record<VizMode, Fallback> = {
  light: {
    fg: "#111113",
    muted: "#52525b",
    accent: "#2563eb",
    accent2: "#0891b2",
    border: "#e4e4e7",
    grid: "#ececef",
    surface: "#ffffff",
    surface2: "#f4f4f5",
    tooltipBg: "#ffffff",
    success: "#047857",
    warn: "#b45309",
    danger: "#b91c1c",
    tierBronze: "#9c4a1a",
    tierSilver: "#5b6778",
    tierGold: "#856404",
    // Categorical series validated against #ffffff (dataviz six checks).
    series: ["#2563eb", "#b45309", "#7c3aed", "#059669", "#dc2626", "#0891b2"],
  },
  dark: {
    fg: "#ededf0",
    muted: "#a1a1aa",
    accent: "#3b82f6",
    accent2: "#22d3ee",
    border: "#232329",
    grid: "#1d1d23",
    surface: "#111114",
    surface2: "#16161b",
    tooltipBg: "#16161b",
    success: "#34d399",
    warn: "#fbbf24",
    danger: "#f87171",
    tierBronze: "#d9915c",
    tierSilver: "#a3adbd",
    tierGold: "#eab308",
    // Categorical series validated against #111114 (dataviz six checks).
    series: ["#3b82f6", "#d97706", "#a855f7", "#059669", "#ef4444", "#0891b2"],
  },
};

export const MONO = '"JetBrains Mono Variable", "JetBrains Mono", ui-monospace, monospace';
export const SANS = '"Inter Variable", Inter, ui-sans-serif, system-ui, sans-serif';

/** Read one CSS custom property off <html>, with a fallback. */
export function cssToken(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (!raw) return fallback;
  // Color tokens are stored as "R G B" triplets; viz tokens as plain hex.
  return /^\d+ \d+ \d+$/.test(raw) ? `rgb(${raw.split(/\s+/).join(", ")})` : raw;
}

export function getTokens(mode: VizMode): VizTokens {
  const fb = FALLBACK[mode];
  return {
    mode,
    fg: cssToken("--color-fg", fb.fg),
    muted: cssToken("--color-muted", fb.muted),
    accent: cssToken("--color-accent", fb.accent),
    accent2: cssToken("--color-accent-2", fb.accent2),
    border: cssToken("--color-border", fb.border),
    // Gridlines sit one step off the surface: quieter than the border token.
    grid: fb.grid,
    surface: cssToken("--color-surface", fb.surface),
    surface2: cssToken("--color-surface-2", fb.surface2),
    tooltipBg: cssToken(mode === "dark" ? "--color-surface-2" : "--color-surface", fb.tooltipBg),
    success: cssToken("--color-success", fb.success),
    warn: cssToken("--color-warn", fb.warn),
    danger: cssToken("--color-danger", fb.danger),
    tierBronze: cssToken("--tier-bronze", fb.tierBronze),
    tierSilver: cssToken("--tier-silver", fb.tierSilver),
    tierGold: cssToken("--tier-gold", fb.tierGold),
    series: fb.series.map((hex, i) => cssToken(`--viz-series-${i + 1}`, hex)),
  };
}

/** Categorical series palette (dark fallback) for non-DOM contexts. */
export const VIZ_SERIES = FALLBACK.dark.series;

/** Severity → status token. Reserved for state, never for series identity. */
export function severityColor(t: VizTokens, sev: string): string {
  if (sev === "high") return t.danger;
  if (sev === "warn") return t.warn;
  return t.accent;
}

/** Tooltip styling: values lead, labels follow; surface-colored card. */
export function tooltip(t: VizTokens, extra: Record<string, unknown> = {}) {
  return {
    backgroundColor: t.tooltipBg,
    borderColor: t.border,
    borderWidth: 1,
    padding: [8, 12],
    textStyle: { color: t.fg, fontSize: 12, fontFamily: SANS },
    extraCssText: `border-radius:10px;box-shadow:0 12px 28px -12px rgba(0,0,0,${t.mode === "dark" ? 0.7 : 0.18});`,
    axisPointer: {
      type: "line",
      lineStyle: { color: t.muted, width: 1, opacity: 0.5 },
      shadowStyle: { color: t.mode === "dark" ? "rgba(255,255,255,0.03)" : "rgba(15,23,42,0.04)" },
    },
    ...extra,
  };
}

export function axisLabel(t: VizTokens, extra: Record<string, unknown> = {}) {
  // hideOverlap drops colliding tick labels on narrow charts instead of overprinting them.
  return { color: t.muted, fontSize: 11, fontFamily: MONO, hideOverlap: true, ...extra };
}

export function axisName(t: VizTokens) {
  return { color: t.muted, fontSize: 10, fontFamily: MONO, padding: [0, 0, 2, 0] };
}

export function axisLine(t: VizTokens) {
  return { show: true, lineStyle: { color: t.border, width: 1 } };
}

/** Solid hairline gridlines, one step off the surface (never dashed). */
export function splitLine(t: VizTokens) {
  return { show: true, lineStyle: { color: t.grid, width: 1, type: "solid" as const } };
}

export function legend(t: VizTokens, extra: Record<string, unknown> = {}) {
  return {
    textStyle: { color: t.muted, fontSize: 11, fontFamily: SANS },
    inactiveColor: t.border,
    itemWidth: 10,
    itemHeight: 10,
    itemGap: 14,
    icon: "roundRect",
    ...extra,
  };
}

/** Standard grid with room for axis labels. */
export function grid(extra: Record<string, unknown> = {}) {
  return { left: 8, right: 16, top: 32, bottom: 8, containLabel: true, ...extra };
}

/** Bar mark spec: capped thickness, 4px rounded data end, square at baseline. */
export function barStyle(color: string, horizontal = false) {
  return {
    barMaxWidth: 24,
    itemStyle: {
      color,
      borderRadius: horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0],
    },
  };
}

/** Line mark spec: 2px, round caps, ≥8px end markers with a surface ring. */
export function lineStyle(t: VizTokens, color: string, area = false) {
  return {
    symbol: "circle",
    symbolSize: 8,
    showSymbol: false,
    lineStyle: { color, width: 2, cap: "round", join: "round" },
    itemStyle: { color, borderColor: t.surface, borderWidth: 2 },
    emphasis: { focus: "series" as const, scale: 1.25 },
    ...(area ? { areaStyle: { color, opacity: 0.1 } } : {}),
  };
}

/** Animation settings that honour reduced motion. */
export function motion(reduced: boolean) {
  return reduced
    ? { animation: false }
    : {
        animation: true,
        animationDuration: 600,
        animationEasing: "cubicOut",
        animationDelay: (idx: number) => Math.min(idx * 18, 360),
      };
}

/** Format a number as compact USD. */
export function usd(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
  if (abs >= 10) return `$${n.toFixed(0)}`;
  return `$${n.toFixed(2)}`;
}

/** Axis tick money: $10k / $2.5k / $500, no trailing ".0". */
export function usdTick(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${+(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${+(n / 1_000).toFixed(1)}k`;
  return `$${+n.toFixed(2)}`;
}

/** Compact number: 1,284 / 12.9k / 4.2M. */
export function compact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 10_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString("en-US");
}

export function pct(n: number, digits = 1): string {
  return `${n.toFixed(digits)}%`;
}

/** "rgb(1, 2, 3)" or "#rrggbb" → same color at the given alpha. */
export function withAlpha(color: string, alpha: number): string {
  if (color.startsWith("#")) {
    const h = color.slice(1);
    const n = parseInt(h.length === 3 ? h.replace(/./g, "$&$&") : h, 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
  }
  const m = color.match(/\d+(\.\d+)?/g);
  if (!m) return color;
  return `rgba(${m[0]}, ${m[1]}, ${m[2]}, ${alpha})`;
}
