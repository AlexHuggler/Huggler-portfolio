import { useEffect, useState } from "react";

/**
 * useReducedMotion
 *
 * Subscribes to the prefers-reduced-motion media query so animated React
 * islands can swap continuous motion for a static rendering. Returns false
 * during SSR to keep first paint deterministic; updates after hydration.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mql.matches);
    const handler = (event: MediaQueryListEvent) => setReduced(event.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  return reduced;
}
