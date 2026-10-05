import type { JSX, ReactNode } from "react";

export type KpiTone = "default" | "accent" | "success" | "warn" | "danger";

interface KpiCardProps {
  label: string;
  value: string;
  sub?: ReactNode;
  /** Semantic tone for the small marker beside the label — never the value text. */
  tone?: KpiTone;
}

const TONE: Record<KpiTone, string> = {
  default: "bg-border-strong",
  accent: "bg-accent",
  success: "bg-success",
  warn: "bg-warn",
  danger: "bg-danger",
};

/** Compact stat tile: label, value (text tokens only), optional context line. */
export default function KpiCard({ label, value, sub, tone = "default" }: KpiCardProps): JSX.Element {
  return (
    <div className="card p-4">
      <p className="flex items-center gap-2 font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-muted">
        <span className={`h-1.5 w-1.5 rounded-full ${TONE[tone]}`} aria-hidden="true" />
        {label}
      </p>
      <p className="mt-2 font-mono text-[1.375rem] font-semibold leading-tight tracking-tight text-fg">
        {value}
      </p>
      {sub && <p className="mt-1 text-xs leading-relaxed text-muted">{sub}</p>}
    </div>
  );
}
