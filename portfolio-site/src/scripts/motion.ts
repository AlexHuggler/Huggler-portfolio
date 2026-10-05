/**
 * CSS-animation counterpart of hooks/usePausable. Elements marked
 * [data-motion] get data-motion="paused" while off-screen or while the tab is
 * hidden; CSS pauses their animations with animation-play-state. A
 * [data-motion-toggle="<id>"] button pauses/resumes the element with that id
 * and keeps aria-pressed in sync. Re-binds after view-transition swaps.
 */
function bind(): void {
  const els = Array.from(document.querySelectorAll<HTMLElement>("[data-motion]"));
  if (els.length === 0) return;
  const userPaused = new Set<string>();

  const apply = (el: HTMLElement, visible: boolean) => {
    const paused = !visible || document.hidden || userPaused.has(el.id);
    el.dataset.motion = paused ? "paused" : "running";
    // SMIL animations ignore animation-play-state; pause them on the <svg>.
    const svgs = el instanceof SVGSVGElement ? [el] : Array.from(el.querySelectorAll("svg"));
    svgs.forEach((svg) => (paused ? svg.pauseAnimations() : svg.unpauseAnimations()));
  };

  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const el = e.target as HTMLElement;
      el.dataset.onscreen = e.isIntersecting ? "1" : "0";
      apply(el, e.isIntersecting);
    }
  }, { threshold: 0.1 });
  els.forEach((el) => io.observe(el));

  const onVis = () => els.forEach((el) => apply(el, el.dataset.onscreen === "1"));
  document.addEventListener("visibilitychange", onVis);

  document.querySelectorAll<HTMLButtonElement>("[data-motion-toggle]").forEach((btn) => {
    if (btn.dataset.bound) return;
    btn.dataset.bound = "1";
    const id = btn.dataset.motionToggle!;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) userPaused.add(id);
    const sync = () => {
      const paused = userPaused.has(id);
      btn.setAttribute("aria-pressed", String(paused));
      btn.querySelector("[data-label]")!.textContent = paused ? "Play" : "Pause";
      const el = document.getElementById(id);
      if (el) apply(el, el.dataset.onscreen === "1");
    };
    btn.addEventListener("click", () => {
      if (userPaused.has(id)) userPaused.delete(id);
      else userPaused.add(id);
      sync();
    });
    sync();
  });

  document.addEventListener("astro:before-swap", () => {
    io.disconnect();
    document.removeEventListener("visibilitychange", onVis);
  }, { once: true });
}

document.addEventListener("astro:page-load", bind);
export {};
