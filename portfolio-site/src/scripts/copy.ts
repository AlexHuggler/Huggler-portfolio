/**
 * Copy affordances:
 *  - [data-copy="text"] or [data-copy-target="#id"] buttons copy on click;
 *  - every <pre> inside [data-code-copy] (MDX prose, code panels) gets a
 *    copy button injected;
 *  - headings with ids inside [data-anchor-headings] get a "copy link" anchor.
 * All announce through the toast live region.
 */
import { copyText } from "./toast";

function copyButton(label: string): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "code-copy-btn";
  b.textContent = "Copy";
  b.setAttribute("aria-label", label);
  return b;
}

function bind(): void {
  document.querySelectorAll<HTMLElement>("[data-copy], [data-copy-target]").forEach((el) => {
    if (el.dataset.copyBound) return;
    el.dataset.copyBound = "1";
    el.addEventListener("click", () => {
      const target = el.dataset.copyTarget ? document.querySelector(el.dataset.copyTarget) : null;
      const text = el.dataset.copy ?? target?.textContent ?? "";
      void copyText(text.trim(), el.dataset.copyLabel ?? "Copied to clipboard");
    });
  });

  document.querySelectorAll<HTMLElement>("[data-code-copy] pre").forEach((pre) => {
    if (pre.dataset.copyBound) return;
    pre.dataset.copyBound = "1";
    const wrap = document.createElement("div");
    wrap.className = "code-copy-wrap";
    pre.parentNode?.insertBefore(wrap, pre);
    wrap.appendChild(pre);
    const btn = copyButton("Copy code");
    btn.addEventListener("click", () => void copyText(pre.innerText.trim(), "Code copied"));
    wrap.appendChild(btn);
  });

  document.querySelectorAll<HTMLElement>("[data-anchor-headings] :is(h2, h3)[id]").forEach((h) => {
    if (h.querySelector(".heading-anchor")) return;
    const a = document.createElement("a");
    a.href = `#${h.id}`;
    a.className = "heading-anchor";
    a.setAttribute("aria-label", `Copy link to “${h.textContent?.trim()}”`);
    a.textContent = "#";
    a.addEventListener("click", (e) => {
      e.preventDefault();
      const url = new URL(window.location.href);
      url.hash = h.id;
      history.replaceState(null, "", url);
      void copyText(url.toString(), "Link to section copied");
    });
    h.appendChild(a);
  });
}

document.addEventListener("astro:page-load", bind);
export {};
