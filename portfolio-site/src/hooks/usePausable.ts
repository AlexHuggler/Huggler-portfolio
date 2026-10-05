import { useEffect, useRef, useState, type RefObject } from "react";
import { useReducedMotion } from "./useReducedMotion";

/**
 * One motion policy for every animated island. An animation should run only
 * when ALL of these hold:
 *   - the reader hasn't asked for reduced motion,
 *   - the element is on screen (IntersectionObserver),
 *   - the tab is visible (document.hidden),
 *   - the reader hasn't paused it (the visible pause control, WCAG 2.2.2).
 * Returns `running` plus the user pause state and a toggle.
 */
export function usePausable<T extends Element>(
  ref: RefObject<T | null>,
  { startPaused = false }: { startPaused?: boolean } = {},
) {
  const reduced = useReducedMotion();
  const [userPaused, setUserPaused] = useState(startPaused);
  const [onScreen, setOnScreen] = useState(false);
  const [tabVisible, setTabVisible] = useState(true);
  const toggledByUser = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      ([entry]) => setOnScreen(entry.isIntersecting),
      { threshold: 0.15 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);

  useEffect(() => {
    const onVis = () => setTabVisible(!document.hidden);
    onVis();
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  // Reduced motion starts paused, but the reader can still choose to play.
  useEffect(() => {
    if (reduced && !toggledByUser.current) setUserPaused(true);
  }, [reduced]);

  const toggle = () => {
    toggledByUser.current = true;
    setUserPaused((p) => !p);
  };

  return {
    running: !userPaused && onScreen && tabVisible,
    paused: userPaused,
    reduced,
    toggle,
  };
}
