import { useEffect, useRef, useState } from "react";
import * as echarts from "echarts/core";
import {
  BarChart,
  LineChart,
  PieChart,
  HeatmapChart,
  TreemapChart,
  GaugeChart,
  ScatterChart,
} from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  TitleComponent,
  VisualMapComponent,
  DataZoomComponent,
  MarkLineComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import { getTokens, type VizMode, type VizTokens } from "./theme";

/**
 * Tree-shaken ECharts registration. Only the chart types and components the
 * dashboards actually use are pulled in, and this runs once per module load
 * regardless of how many dashboards import the wrapper.
 */
echarts.use([
  BarChart,
  LineChart,
  PieChart,
  HeatmapChart,
  TreemapChart,
  GaugeChart,
  ScatterChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  TitleComponent,
  VisualMapComponent,
  DataZoomComponent,
  MarkLineComponent,
  CanvasRenderer,
]);

function currentMode(): VizMode {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

export interface EChartProps {
  /**
   * Pure builder for the chart option. Define it at module scope (stable
   * identity) so it rebuilds only when theme/motion change. Receives the
   * theme tokens, the current mode, and whether reduced motion is requested.
   */
  buildOption: (
    tokens: VizTokens,
    mode: VizMode,
    reduced: boolean,
  ) => echarts.EChartsCoreOption;
  height?: number;
  ariaLabel: string;
  /** Visually-hidden table fallback for screen readers. */
  fallbackTable?: React.ReactNode;
  className?: string;
}

export default function EChart({
  buildOption,
  height = 320,
  ariaLabel,
  fallbackTable,
  className,
}: EChartProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  const [mode, setMode] = useState<VizMode>(currentMode);
  const reduced = useReducedMotion();

  // Initialise once; tear down on unmount.
  useEffect(() => {
    if (!containerRef.current) return;
    const chart = echarts.init(containerRef.current, undefined, {
      renderer: "canvas",
    });
    chartRef.current = chart;
    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(containerRef.current);
    return () => {
      ro.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  // Track the site theme class on <html>; the toggle dispatches no event.
  useEffect(() => {
    const observer = new MutationObserver(() => setMode(currentMode()));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  }, []);

  // (Re)apply the option whenever theme, motion, or the builder change.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.setOption(buildOption(getTokens(mode), mode, reduced), true);
  }, [buildOption, mode, reduced]);

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
