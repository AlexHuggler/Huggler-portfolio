/**
 * ⌘K command palette — vanilla, so pages without React islands never pay
 * for react-dom. Native <dialog> (focus trap, Esc, focus return for free),
 * ARIA combobox + listbox with aria-activedescendant, a polite live result
 * count, and navigation through Astro's view-transition router.
 */
import { navigate } from "astro:transitions/client";
import { copyText } from "./toast";
import type { PaletteItem } from "../data/search-index";

const GROUP_ORDER = ["Pages", "Sections", "Dashboards", "Metrics", "Actions"];
const MAX_RESULTS = 40;

function score(item: PaletteItem, q: string): number {
  if (!q) return item.group === "Metrics" ? 0 : 1;
  const title = item.title.toLowerCase();
  const hay = `${title} ${(item.subtitle ?? "").toLowerCase()} ${(item.keywords ?? "").toLowerCase()}`;
  const words = q.split(/\s+/).filter(Boolean);
  let total = 0;
  for (const w of words) {
    if (title.startsWith(w)) total += 12;
    else if (new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(title)) total += 8;
    else if (title.includes(w)) total += 5;
    else if (hay.includes(w)) total += 3;
    else {
      // subsequence fallback: "tlk" matches "telecom lakehouse"
      let i = 0;
      for (const ch of title) if (ch === w[i]) i++;
      if (i === w.length) total += 1;
      else return 0;
    }
  }
  return total;
}

function bind(): void {
  const dialog = document.getElementById("cmdk") as HTMLDialogElement | null;
  if (!dialog || dialog.dataset.bound === "1") return;
  dialog.dataset.bound = "1";

  const input = dialog.querySelector<HTMLInputElement>("[data-cmdk-input]")!;
  const list = dialog.querySelector<HTMLUListElement>("[data-cmdk-list]")!;
  const status = dialog.querySelector<HTMLElement>("[data-cmdk-status]")!;
  const items: PaletteItem[] = JSON.parse(
    document.getElementById("cmdk-data")!.textContent ?? "[]",
  );
  let results: PaletteItem[] = [];
  let active = 0;
  let opener: HTMLElement | null = null;

  const render = () => {
    const q = input.value.trim().toLowerCase();
    const scored = items
      .map((item) => ({ item, s: score(item, q) }))
      .filter((r) => r.s > 0);
    // Groups stay contiguous: rank groups by their best hit, then items within.
    const best = new Map<string, number>();
    scored.forEach((r) => best.set(r.item.group, Math.max(best.get(r.item.group) ?? 0, r.s)));
    const groupRank = (g: string) =>
      q ? -(best.get(g) ?? 0) * 10 + GROUP_ORDER.indexOf(g) : GROUP_ORDER.indexOf(g);
    results = scored
      .sort((a, b) => groupRank(a.item.group) - groupRank(b.item.group) || b.s - a.s)
      .slice(0, MAX_RESULTS)
      .map((r) => r.item);
    if (!q) results = results.filter((r) => r.group !== "Metrics" && r.group !== "Sections");
    active = Math.min(active, Math.max(results.length - 1, 0));

    list.replaceChildren();
    let lastGroup = "";
    results.forEach((item, i) => {
      if (item.group !== lastGroup) {
        lastGroup = item.group;
        const h = document.createElement("li");
        h.setAttribute("role", "presentation");
        h.className = "cmdk-group";
        h.textContent = item.group;
        list.appendChild(h);
      }
      const li = document.createElement("li");
      li.id = `cmdk-opt-${item.id}`;
      li.setAttribute("role", "option");
      li.setAttribute("aria-selected", String(i === active));
      li.className = "cmdk-option";
      li.dataset.index = String(i);
      const t = document.createElement("span");
      t.className = "cmdk-title";
      t.textContent = item.title;
      li.appendChild(t);
      if (item.subtitle) {
        const s = document.createElement("span");
        s.className = "cmdk-subtitle";
        s.textContent = item.subtitle;
        li.appendChild(s);
      }
      if (item.external) {
        const e = document.createElement("span");
        e.className = "cmdk-hint";
        e.textContent = "↗";
        e.setAttribute("aria-label", "opens in new tab");
        li.appendChild(e);
      }
      li.addEventListener("mousemove", () => {
        if (active !== i) setActive(i);
      });
      li.addEventListener("click", () => run(item));
      list.appendChild(li);
    });
    if (results.length === 0) {
      const empty = document.createElement("li");
      empty.setAttribute("role", "presentation");
      empty.className = "cmdk-empty";
      empty.textContent = "No matches — try “dbt”, “velocity”, or “résumé”.";
      list.appendChild(empty);
    }
    status.textContent = `${results.length} result${results.length === 1 ? "" : "s"}`;
    syncActive();
  };

  const syncActive = () => {
    list.querySelectorAll<HTMLElement>("[role=option]").forEach((el) => {
      el.setAttribute("aria-selected", String(Number(el.dataset.index) === active));
    });
    const current = results[active];
    if (current) {
      input.setAttribute("aria-activedescendant", `cmdk-opt-${current.id}`);
      document.getElementById(`cmdk-opt-${current.id}`)?.scrollIntoView({ block: "nearest" });
    } else {
      input.removeAttribute("aria-activedescendant");
    }
  };

  const setActive = (i: number) => {
    active = (i + results.length) % Math.max(results.length, 1);
    syncActive();
  };

  const close = () => {
    if (dialog.open) dialog.close();
  };

  const run = (item: PaletteItem) => {
    close();
    if (item.action === "copy-email") {
      const email = document.documentElement.dataset.email ?? "";
      void copyText(email, `Copied ${email}`);
      return;
    }
    if (item.action === "toggle-theme") {
      document.getElementById("theme-toggle")?.click();
      return;
    }
    if (item.action === "print") {
      setTimeout(() => window.print(), 50);
      return;
    }
    if (!item.href) return;
    if (item.external) {
      window.open(item.href, "_blank", "noopener,noreferrer");
    } else if (item.href.endsWith(".pdf")) {
      window.location.href = item.href;
    } else {
      void navigate(item.href);
    }
  };

  const open = () => {
    if (dialog.open) return;
    opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    input.value = "";
    active = 0;
    render();
    dialog.showModal();
    input.focus();
  };

  input.addEventListener("input", () => {
    active = 0;
    render();
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive(active + 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive(active - 1);
    } else if (e.key === "Home" && e.ctrlKey) {
      e.preventDefault();
      setActive(0);
    } else if (e.key === "End" && e.ctrlKey) {
      e.preventDefault();
      setActive(results.length - 1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = results[active];
      if (item) run(item);
    }
  });
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) close();
  });
  dialog.addEventListener("close", () => {
    // Return focus to whatever opened the palette (or the page, if that
    // element is gone after a navigation) instead of leaving it in the input.
    if (opener && opener.isConnected && opener !== document.body) opener.focus();
    else if (document.activeElement === input) input.blur();
    opener = null;
  });

  document.addEventListener("keydown", (e) => {
    const target = e.target as HTMLElement | null;
    const typing =
      target &&
      (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      if (dialog.open) close();
      else open();
    } else if (e.key === "/" && !typing && !dialog.open) {
      e.preventDefault();
      open();
    }
  });

  document.addEventListener("click", (e) => {
    const opener = (e.target as HTMLElement).closest("[data-cmdk-open]");
    if (opener) {
      e.preventDefault();
      open();
    }
  });
  document.addEventListener("astro:before-swap", close);
}

// The dialog is transition:persist'ed, so bind once and survive navigations.
bind();
document.addEventListener("astro:page-load", bind);
