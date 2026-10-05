import type { JSX, ReactNode } from "react";
import { useEffect, useRef } from "react";
import * as echarts from "echarts/core";
import {
  BarChart,
  LineChart,
  PieChart,
  HeatmapChart,
  ScatterChart,
  TreemapChart,
  GaugeChart,
} from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  VisualMapComponent,
  DataZoomComponent,
  MarkLineComponent,
  MarkAreaComponent,
  MarkPointComponent,
  AriaComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import { getTokens, type VizMode, type VizTokens } from "./theme";
import { registerChart, useThemeMode } from "./store";

/**
 * Tree-shaken ECharts registration. Only the chart types and components the
 * site actually uses are pulled in, once per module load.
 */
echarts.use([
  BarChart,
  LineChart,
  PieChart,
  HeatmapChart,
  ScatterChart,
  TreemapChart,
  GaugeChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  VisualMapComponent,
  DataZoomComponent,
  MarkLineComponent,
  MarkAreaComponent,
  MarkPointComponent,
  AriaComponent,
  CanvasRenderer,
]);

export type ChartOption = echarts.EChartsCoreOption;
export type ChartEvents = Record<string, (params: any) => void>;

export interface EChartProps {
  /**
   * Pure builder for the chart option. Keep its identity stable (module scope
   * or useCallback) so it rebuilds only when theme / motion / inputs change.
   */
  buildOption: (tokens: VizTokens, mode: VizMode, reduced: boolean) => ChartOption;
  height?: number;
  ariaLabel: string;
  /** Visually-hidden table fallback for screen readers. */
  fallbackTable?: ReactNode;
  className?: string;
  /** ECharts event handlers, e.g. { click: (p) => ... }. */
  onEvents?: ChartEvents;
  /** Charts sharing a group id get linked tooltips/axis pointers. */
  group?: string;
}

export default function EChart({
  buildOption,
  height = 320,
  ariaLabel,
  fallbackTable,
  className,
  onEvents,
  group,
}: EChartProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  const eventsRef = useRef<ChartEvents | undefined>(onEvents);
  eventsRef.current = onEvents;
  const mode = useThemeMode();
  const reduced = useReducedMotion();

  // Initialise once; tear down on unmount (and on view-transition swaps).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const chart = echarts.init(el, undefined, { renderer: "canvas" });
    chartRef.current = chart;
    const unregister = registerChart(chart);
    const ro = new ResizeObserver(() => {
      if (!chart.isDisposed()) chart.resize();
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      unregister();
      if (!chart.isDisposed()) chart.dispose();
      chartRef.current = null;
    };
  }, []);

  // Event handlers proxy through a ref so changing them never rebinds.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const names = Object.keys(onEvents ?? {});
    names.forEach((name) =>
      chart.on(name, (p: unknown) => eventsRef.current?.[name]?.(p)),
    );
    return () => names.forEach((name) => chart.off(name));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Object.keys(onEvents ?? {}).join("|")]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !group) return;
    chart.group = group;
    echarts.connect(group);
  }, [group]);

  // (Re)apply the option whenever theme, motion, or the builder change.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || chart.isDisposed()) return;
    const option = buildOption(getTokens(mode), mode, reduced);
    chart.setOption({ aria: { enabled: true, label: { description: ariaLabel } }, ...option }, true);
  }, [buildOption, mode, reduced, ariaLabel]);

  return (
    <div className={className}>
      <div
        ref={containerRef}
        role="img"
        aria-label={ariaLabel}
        style={{ width: "100%", height }}
      />
      {fallbackTable && <div className="visually-hidden">{fallbackTable}</div>}
    </div>
  );
}
