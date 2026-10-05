import type { JSX, ReactNode } from "react";
import { useEffect, useId, useRef, useState } from "react";
import { Download, Link2, Maximize2, Table2, X } from "lucide-react";
import DataTable from "./DataTable";
import { copyText, toast } from "../../scripts/toast";

/**
 * ChartCard — the frame every chart on the site sits in.
 *
 * Title + one-line "what this shows", a takeaway sentence (the insight, not a
 * restatement of the title), and a provenance chip. Actions: Show data (the
 * same table screen readers get, made visible), Download CSV, Expand (native
 * <dialog>; the large chart mounts only while open), and Copy link.
 */

export interface ChartTable {
  caption: string;
  columns: string[];
  rows: (string | number)[][];
}

export interface Provenance {
  label: string;
  /** Fuller disclaimer shown on hover/focus. */
  title: string;
  kind: "synthetic" | "real";
}

interface ChartCardProps {
  id: string;
  title: string;
  subtitle?: string;
  takeaway?: ReactNode;
  provenance: Provenance;
  table: ChartTable;
  /** Render the chart at a given height (called again, larger, in the dialog). */
  renderChart: (height: number) => ReactNode;
  height?: number;
  className?: string;
  /** Extra controls rendered in the card header (filters, toggles). */
  controls?: ReactNode;
}

function toCsv(table: ChartTable): string {
  const esc = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [table.columns, ...table.rows].map((r) => r.map(esc).join(",")).join("\n");
}

export default function ChartCard({
  id,
  title,
  subtitle,
  takeaway,
  provenance,
  table,
  renderChart,
  height = 300,
  className,
  controls,
}: ChartCardProps): JSX.Element {
  const [showData, setShowData] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const tableId = useId();

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (expanded && !d.open) d.showModal();
    if (!expanded && d.open) d.close();
  }, [expanded]);

  const download = () => {
    const blob = new Blob([toCsv(table)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${id}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast(`Downloaded ${id}.csv`, "success");
  };

  const copyLink = () => {
    const url = new URL(window.location.href);
    url.hash = id;
    void copyText(url.toString(), "Link to chart copied");
  };

  const actionBtn =
    "inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs text-muted transition-colors hover:bg-surface-2 hover:text-fg";

  return (
    <figure
      id={id}
      className={`card scroll-mt-28 flex flex-col p-4 md:p-5 ${className ?? ""}`}
      aria-labelledby={titleId}
    >
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 flex-[1_1_14rem]">
          <h3 id={titleId} className="text-[15px] font-semibold tracking-tight text-fg">
            {title}
          </h3>
          {subtitle && <p className="mt-0.5 text-xs leading-relaxed text-muted">{subtitle}</p>}
        </div>
        <span className="data-chip" data-kind={provenance.kind} title={provenance.title}>
          {provenance.label}
          <span className="sr-only">. {provenance.title}</span>
        </span>
      </header>

      {controls && <div className="mt-3">{controls}</div>}

      <div className="mt-3" style={{ minHeight: height }}>
        {renderChart(height)}
      </div>

      {showData ? (
        <div
          id={tableId}
          className="data-table-visible mt-3 max-h-72 overflow-auto rounded-lg border border-border"
          tabIndex={0}
          role="region"
          aria-label={`${title}: data table (scrollable)`}
        >
          <DataTable {...table} />
        </div>
      ) : (
        // Screen readers always get the data, chart or no chart.
        <div className="visually-hidden">
          <DataTable {...table} />
        </div>
      )}

      <footer className="mt-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-2 border-t border-border pt-3">
        {takeaway ? (
          <figcaption className="min-w-0 flex-[1_1_18rem] text-[13px] leading-relaxed text-fg/90">
            <span className="mr-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-accent-fg">
              Takeaway
            </span>
            {takeaway}
          </figcaption>
        ) : (
          <span />
        )}
        <div className="-mr-1 flex shrink-0 items-center">
          <button
            type="button"
            className={actionBtn}
            aria-pressed={showData}
            aria-controls={showData ? tableId : undefined}
            onClick={() => setShowData((v) => !v)}
          >
            <Table2 size={14} aria-hidden="true" />
            <span>{showData ? "Hide data" : "Show data"}</span>
          </button>
          <button type="button" className={actionBtn} onClick={download}>
            <Download size={14} aria-hidden="true" />
            <span>CSV</span>
          </button>
          <button
            type="button"
            className={actionBtn}
            onClick={() => setExpanded(true)}
            aria-haspopup="dialog"
          >
            <Maximize2 size={14} aria-hidden="true" />
            <span className="sr-only">Expand {title}</span>
          </button>
          <button type="button" className={actionBtn} onClick={copyLink}>
            <Link2 size={14} aria-hidden="true" />
            <span className="sr-only">Copy link to {title}</span>
          </button>
        </div>
      </footer>

      <dialog
        ref={dialogRef}
        className="chart-dialog"
        aria-labelledby={`${titleId}-dlg`}
        onClose={() => setExpanded(false)}
        onClick={(e) => {
          if (e.target === dialogRef.current) setExpanded(false);
        }}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <p id={`${titleId}-dlg`} className="text-base font-semibold tracking-tight text-fg">
              {title}
            </p>
            {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={() => setExpanded(false)}
            aria-label="Close expanded chart"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
        <div className="p-5">{expanded && renderChart(Math.max(height * 1.6, 460))}</div>
        {takeaway && (
          <p className="border-t border-border px-5 py-3 text-[13px] leading-relaxed text-fg/90">
            {takeaway}
          </p>
        )}
      </dialog>
    </figure>
  );
}
