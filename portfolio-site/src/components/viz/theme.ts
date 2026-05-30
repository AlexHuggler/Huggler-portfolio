/**
 * Theme tokens + small option helpers shared by the ECharts dashboards.
 *
 * The site toggles dark/light by adding/removing the `dark` class on
 * <html> (see ThemeToggle.astro). Charts read the current mode and rebuild
 * their option with the matching tokens, so they restyle live on toggle.
 * Hex values mirror tailwind.config.mjs.
 */

export type VizMode = "dark" | "light";

export interface VizTokens {
  fg: string;
  muted: string;
  accent: string;
  border: string;
  grid: string;
  tooltipBg: string;
  series: string[];
}

/** Categorical series palette (accent first), reused across dashboards. */
export const VIZ_SERIES = [
  "#2563eb", // accent blue
  "#10b981", // emerald
  "#a855f7", // violet
  "#f59e0b", // amber
  "#ef4444", // red
  "#06b6d4", // cyan
];

export function getTokens(mode: VizMode): VizTokens {
  if (mode === "light") {
    return {
      fg: "#0a0a0a",
      muted: "#52525b",
      accent: "#2563eb",
      border: "#e4e4e7",
      grid: "#e4e4e7",
      tooltipBg: "#ffffff",
      series: VIZ_SERIES,
    };
  }
  return {
    fg: "#ededed",
    muted: "#a1a1aa",
    accent: "#2563eb",
    border: "#1f1f23",
    grid: "#26262b",
    tooltipBg: "#0a0a0a",
    series: VIZ_SERIES,
  };
}

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
