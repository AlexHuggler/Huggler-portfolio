/**
 * Tiny toast bus. Anything (Astro scripts, React islands) calls toast("…");
 * the persisted <Toast /> region in BaseLayout renders it into a polite live
 * region. Decoupled through a DOM event so islands never import UI code.
 */
export type ToastTone = "default" | "success";

export interface ToastDetail {
  message: string;
  tone?: ToastTone;
}

export const TOAST_EVENT = "site:toast";

export function toast(message: string, tone: ToastTone = "default"): void {
  if (typeof document === "undefined") return;
  document.dispatchEvent(new CustomEvent<ToastDetail>(TOAST_EVENT, { detail: { message, tone } }));
}

/** Copy text and announce the result. Returns whether the copy succeeded. */
export async function copyText(text: string, label = "Copied to clipboard"): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    toast(label, "success");
    return true;
  } catch {
    toast("Copy failed — select and copy manually");
    return false;
  }
}
