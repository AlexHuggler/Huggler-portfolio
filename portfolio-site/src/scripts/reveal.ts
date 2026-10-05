/**
 * Scroll reveal for elements marked .reveal. Only elements that start below
 * the fold are hidden (via .reveal-pending), so nothing visible on first
 * paint ever flashes, no-JS readers see everything, and reduced-motion
 * readers get no animation at all.
 */
function bind(): void {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const els = Array.from(document.querySelectorAll<HTMLElement>(".reveal"));
  const fold = window.innerHeight * 0.95;
  const pending = els.filter((el) => el.getBoundingClientRect().top > fold);
  if (pending.length === 0) return;
  pending.forEach((el) => el.classList.add("reveal-pending"));
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        e.target.classList.remove("reveal-pending");
        io.unobserve(e.target);
      }
    },
    { rootMargin: "0px 0px -8% 0px" },
  );
  pending.forEach((el) => io.observe(el));
  document.addEventListener("astro:before-swap", () => io.disconnect(), { once: true });
}

document.addEventListener("astro:page-load", bind);
export {};
