/**
 * Case-study table of contents: scroll-spy (aria-current="location" on the
 * link for the section in view) and the reading-progress bar. Bound per
 * page load; observers are torn down before view-transition swaps.
 */
function bind(): void {
  const toc = document.querySelector<HTMLElement>("[data-toc]");
  const bar = document.querySelector<HTMLElement>("[data-reading-progress]");
  const cleanups: (() => void)[] = [];

  if (toc) {
    const links = Array.from(toc.querySelectorAll<HTMLAnchorElement>("[data-toc-link]"));
    const targets = links
      .map((a) => document.getElementById(a.dataset.tocLink!))
      .filter((el): el is HTMLElement => !!el);
    const visible = new Map<string, number>();

    const update = () => {
      // Pick the top-most section currently intersecting the reading band.
      let current: string | null = null;
      let best = Infinity;
      visible.forEach((top, id) => {
        if (top < best) {
          best = top;
          current = id;
        }
      });
      if (!current) return;
      links.forEach((a) => {
        if (a.dataset.tocLink === current) a.setAttribute("aria-current", "location");
        else a.removeAttribute("aria-current");
      });
    };

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const id = (e.target as HTMLElement).id;
          if (e.isIntersecting) visible.set(id, e.boundingClientRect.top);
          else visible.delete(id);
        }
        update();
      },
      { rootMargin: "-80px 0px -60% 0px" },
    );
    targets.forEach((t) => io.observe(t));
    cleanups.push(() => io.disconnect());
  }

  if (bar) {
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        const doc = document.documentElement;
        const max = doc.scrollHeight - window.innerHeight;
        bar.style.transform = `scaleX(${max > 0 ? Math.min(window.scrollY / max, 1) : 0})`;
        frame = 0;
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    cleanups.push(() => window.removeEventListener("scroll", onScroll));
  }

  document.addEventListener("astro:before-swap", () => cleanups.forEach((c) => c()), { once: true });
}

document.addEventListener("astro:page-load", bind);
export {};
