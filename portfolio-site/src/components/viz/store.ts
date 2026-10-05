/**
 * Shared client-side stores for chart islands.
 *
 * - One MutationObserver on <html class> feeds every chart's theme via
 *   useSyncExternalStore (instead of one observer per chart).
 * - A registry of live ECharts instances that are disposed on
 *   `astro:before-swap`, because Astro's view transitions replace the DOM
 *   without unmounting React roots — without this, canvases leak per visit.
 */
import { useSyncExternalStore } from "react";
import type { VizMode } from "./theme";

type Listener = () => void;

const listeners = new Set<Listener>();
let observer: MutationObserver | null = null;

function readMode(): VizMode {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  if (!observer && typeof document !== "undefined") {
    observer = new MutationObserver(() => listeners.forEach((l) => l()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && observer) {
      observer.disconnect();
      observer = null;
    }
  };
}

export function useThemeMode(): VizMode {
  return useSyncExternalStore(subscribe, readMode, () => "dark");
}

/* ---------------------------------------------------------------- */

interface Disposable {
  dispose: () => void;
  isDisposed?: () => boolean;
}

const charts = new Set<Disposable>();
let swapBound = false;

export function registerChart(chart: Disposable): () => void {
  charts.add(chart);
  if (!swapBound && typeof document !== "undefined") {
    swapBound = true;
    document.addEventListener("astro:before-swap", () => {
      charts.forEach((c) => {
        if (!c.isDisposed?.()) c.dispose();
      });
      charts.clear();
    });
  }
  return () => charts.delete(chart);
}
