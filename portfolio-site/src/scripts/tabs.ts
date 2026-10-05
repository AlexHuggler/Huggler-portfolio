/**
 * Accessible tabs for server-rendered markup:
 *   <div data-tabs [data-tabs-hash]>
 *     <div role="tablist"> <button role="tab" aria-controls="p1" …> … </div>
 *     <div role="tabpanel" id="p1"> …
 * Roving tabindex, ←/→/Home/End, and (with data-tabs-hash) the selected tab
 * mirrors location.hash via replaceState so links can deep-link a tab
 * without polluting history. Dispatches "tabs:change" for islands.
 */
function bind(): void {
  document.querySelectorAll<HTMLElement>("[data-tabs]").forEach((root) => {
    if (root.dataset.tabsBound === "1") return;
    root.dataset.tabsBound = "1";
    const tabs = Array.from(root.querySelectorAll<HTMLButtonElement>(":scope [role=tablist] [role=tab]"));
    const useHash = root.hasAttribute("data-tabs-hash");

    const select = (tab: HTMLButtonElement, { focus = true, updateHash = true } = {}) => {
      tabs.forEach((t) => {
        const on = t === tab;
        t.setAttribute("aria-selected", String(on));
        t.tabIndex = on ? 0 : -1;
        const panel = document.getElementById(t.getAttribute("aria-controls") ?? "");
        if (panel) panel.hidden = !on;
      });
      if (focus) tab.focus();
      if (useHash && updateHash && tab.dataset.hash) {
        history.replaceState(history.state, "", `#${tab.dataset.hash}`);
      }
      root.dispatchEvent(new CustomEvent("tabs:change", { detail: { id: tab.id, hash: tab.dataset.hash } }));
    };

    tabs.forEach((tab, i) => {
      tab.addEventListener("click", () => select(tab));
      tab.addEventListener("keydown", (e) => {
        let next: number | null = null;
        if (e.key === "ArrowRight") next = (i + 1) % tabs.length;
        else if (e.key === "ArrowLeft") next = (i - 1 + tabs.length) % tabs.length;
        else if (e.key === "Home") next = 0;
        else if (e.key === "End") next = tabs.length - 1;
        if (next !== null) {
          e.preventDefault();
          select(tabs[next]);
        }
      });
    });

    if (useHash) {
      const fromHash = () => {
        const h = location.hash.slice(1);
        const match = tabs.find((t) => t.dataset.hash === h);
        if (match) select(match, { focus: false, updateHash: false });
      };
      fromHash();
      window.addEventListener("hashchange", fromHash);
      document.addEventListener("astro:before-swap", () => window.removeEventListener("hashchange", fromHash), { once: true });
    }
  });
}

document.addEventListener("astro:page-load", bind);
export {};
