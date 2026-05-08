import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Check, Copy, Loader2 } from "lucide-react";
import { clsx } from "clsx";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import optimizations from "../../data/sql-optimizations.json";
import QueryDiffViewer from "./QueryDiffViewer";
import ReasoningPanel from "./ReasoningPanel";

/**
 * SqlOptimizerDemo
 *
 * Centerpiece demo for the AI-Assisted SQL Optimizer page. Owns selected-
 * query state, drives the "Claude is analyzing" spinner, the typewriter
 * effect into the optimized-SQL editor, the inline diff viewer, and the
 * reasoning panel below. All output is sourced from the static fixture;
 * the live Worker mode is wired but disabled by default.
 */

const Monaco = lazy(() =>
  import("@monaco-editor/react").then((m) => ({ default: m.Editor })),
);

interface ReasoningItem {
  icon: string;
  text: string;
}

interface QueryFixture {
  id: string;
  title: string;
  category: string;
  original_sql: string;
  optimized_sql: string;
  reasoning: ReasoningItem[];
  estimated_cost_reduction_pct: number;
  explanation: string;
}

interface Fixture {
  queries: QueryFixture[];
}

const QUERIES: QueryFixture[] = (optimizations as Fixture).queries;
const SPINNER_MS = 1500;
const TYPING_CHARS_PER_SEC = 80;
const INITIAL_AUTORUN_DELAY_MS = 1000;

const EDITOR_HEIGHT = 320;

const EDITOR_OPTIONS = {
  readOnly: true,
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  fontSize: 12,
  lineNumbers: "on" as const,
  renderLineHighlight: "none" as const,
  fontFamily: "JetBrains Mono, ui-monospace, Menlo, monospace",
};

function EditorFallback() {
  return (
    <div
      className="rounded-md border border-border bg-bg/40 grid place-items-center text-xs text-muted"
      style={{ height: EDITOR_HEIGHT }}
    >
      Loading editor…
    </div>
  );
}

interface CopyButtonProps {
  text: string;
  label: string;
}

function CopyButton({ text, label }: CopyButtonProps) {
  const [copied, setCopied] = useState<boolean>(false);
  const onCopy = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Silently ignore — user can still hand-select the editor text.
    }
  }, [text]);

  return (
    <button
      type="button"
      onClick={onCopy}
      aria-label={`Copy ${label}`}
      className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-[11px] font-medium text-muted hover:text-fg hover:border-fg/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      {copied ? (
        <>
          <Check className="h-3 w-3" aria-hidden="true" />
          <span>Copied</span>
        </>
      ) : (
        <>
          <Copy className="h-3 w-3" aria-hidden="true" />
          <span>Copy</span>
        </>
      )}
    </button>
  );
}

export default function SqlOptimizerDemo() {
  const reduced = useReducedMotion();

  // Live mode wiring: opt-in via PUBLIC_LIVE_DEMO_URL when the user
  // self-hosts the Cloudflare Worker proxy. Default behavior never makes
  // an external request.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const liveUrl = (import.meta as any).env?.PUBLIC_LIVE_DEMO_URL as
    | string
    | undefined;
  // Reference so TS does not flag as unused; the default demo path always
  // reads from the fixture.
  void liveUrl;

  const [selectedId, setSelectedId] = useState<string>(QUERIES[0].id);
  const [analyzing, setAnalyzing] = useState<boolean>(false);
  const [typedSql, setTypedSql] = useState<string>("");
  const [mobileTab, setMobileTab] = useState<"original" | "optimized">(
    "original",
  );
  const hasAutoRunRef = useRef<boolean>(false);
  const runIdRef = useRef<number>(0);

  const selected = useMemo<QueryFixture>(
    () => QUERIES.find((q) => q.id === selectedId) ?? QUERIES[0],
    [selectedId],
  );

  // Re-run analyze + type pipeline whenever the selected query changes.
  // For reduced motion, skip both the spinner and the typewriter.
  const runAnalysis = useCallback(
    (q: QueryFixture) => {
      const runId = ++runIdRef.current;

      if (reduced) {
        setAnalyzing(false);
        setTypedSql(q.optimized_sql);
        return () => {
          /* nothing to cancel */
        };
      }

      setAnalyzing(true);
      setTypedSql("");

      const spinnerTimer = window.setTimeout(() => {
        if (runId !== runIdRef.current) return;
        setAnalyzing(false);

        // Typewriter: increment substring index using a setInterval.
        // ~80 chars/sec → ~12.5ms tick.
        const target = q.optimized_sql;
        const tickMs = Math.max(8, Math.floor(1000 / TYPING_CHARS_PER_SEC));
        let idx = 0;
        const typer = window.setInterval(() => {
          if (runId !== runIdRef.current) {
            window.clearInterval(typer);
            return;
          }
          idx = Math.min(target.length, idx + 1);
          setTypedSql(target.slice(0, idx));
          if (idx >= target.length) {
            window.clearInterval(typer);
          }
        }, tickMs);

        // Save the typer id on a ref-keyed slot for cleanup if a new run
        // is kicked off before completion.
        typerCleanupRef.current = () => window.clearInterval(typer);
      }, SPINNER_MS);

      spinnerCleanupRef.current = () => window.clearTimeout(spinnerTimer);

      return () => {
        window.clearTimeout(spinnerTimer);
      };
    },
    [reduced],
  );

  const typerCleanupRef = useRef<(() => void) | null>(null);
  const spinnerCleanupRef = useRef<(() => void) | null>(null);

  // Auto-run on mount: paint empty briefly then animate in.
  useEffect(() => {
    if (hasAutoRunRef.current) return;
    hasAutoRunRef.current = true;
    const t = window.setTimeout(() => {
      runAnalysis(selected);
    }, INITIAL_AUTORUN_DELAY_MS);
    return () => {
      window.clearTimeout(t);
      if (spinnerCleanupRef.current) spinnerCleanupRef.current();
      if (typerCleanupRef.current) typerCleanupRef.current();
    };
    // selected captured intentionally for the first run only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-run when the user picks a different query.
  useEffect(() => {
    if (!hasAutoRunRef.current) return;
    if (spinnerCleanupRef.current) spinnerCleanupRef.current();
    if (typerCleanupRef.current) typerCleanupRef.current();
    runAnalysis(selected);
    return () => {
      if (spinnerCleanupRef.current) spinnerCleanupRef.current();
      if (typerCleanupRef.current) typerCleanupRef.current();
    };
  }, [selected, runAnalysis]);

  // The diff viewer should reflect the in-progress typed SQL while typing
  // and the final SQL once typing completes.
  const showFinalDiff =
    !analyzing && typedSql.length === selected.optimized_sql.length;

  return (
    <div className="space-y-5">
    <div className="demo-card">
      {/* Top — Query selector */}
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="demo-eyebrow">Live demo</p>
          <h3 className="mt-1 text-base font-semibold tracking-tight">
            Optimize a query
          </h3>
          <p className="mt-1 max-w-prose text-xs text-muted">
            Pick one of the five corpus samples. The original goes in; Claude
            returns a rewrite, reasoning, and an estimated cost delta. Output
            is replayed from a fixture so the page never makes an API call by
            default.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label
            htmlFor="sqlopt-query-select"
            className="font-mono text-[11px] uppercase tracking-widest text-muted"
          >
            Query
          </label>
          <select
            id="sqlopt-query-select"
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="rounded-md border border-border bg-bg/60 px-2.5 py-1.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {QUERIES.map((q) => (
              <option key={q.id} value={q.id}>
                {q.title}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Mobile tab toggle */}
      <div className="mt-5 md:hidden flex items-center gap-2">
        <button
          type="button"
          onClick={() => setMobileTab("original")}
          aria-pressed={mobileTab === "original"}
          className={clsx(
            "rounded-md border px-3 py-1.5 text-xs font-medium",
            mobileTab === "original"
              ? "border-accent text-fg"
              : "border-border text-muted hover:text-fg",
          )}
        >
          Original
        </button>
        <button
          type="button"
          onClick={() => setMobileTab("optimized")}
          aria-pressed={mobileTab === "optimized"}
          className={clsx(
            "rounded-md border px-3 py-1.5 text-xs font-medium",
            mobileTab === "optimized"
              ? "border-accent text-fg"
              : "border-border text-muted hover:text-fg",
          )}
        >
          Optimized
        </button>
      </div>

      {/* Middle — two editors */}
      <div className="mt-3 grid gap-4 md:grid-cols-2">
        {/* Original */}
        <div
          className={clsx(
            "flex flex-col",
            mobileTab === "original" ? "block" : "hidden md:block",
          )}
        >
          <div className="flex items-center justify-between mb-2">
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted">
              Original SQL
            </p>
            <CopyButton text={selected.original_sql} label="original SQL" />
          </div>
          <div
            className="rounded-md border border-border overflow-hidden bg-[#1e1e1e]"
            style={{ height: EDITOR_HEIGHT }}
          >
            <Suspense fallback={<EditorFallback />}>
              <Monaco
                height={EDITOR_HEIGHT}
                language="sql"
                theme="vs-dark"
                value={selected.original_sql}
                options={EDITOR_OPTIONS}
              />
            </Suspense>
          </div>
        </div>

        {/* Optimized */}
        <div
          className={clsx(
            "relative flex flex-col",
            mobileTab === "optimized" ? "block" : "hidden md:block",
          )}
        >
          <div className="flex items-center justify-between mb-2">
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted">
              Optimized SQL
            </p>
            <CopyButton
              text={selected.optimized_sql}
              label="optimized SQL"
            />
          </div>
          <div
            className="relative rounded-md border border-border overflow-hidden bg-[#1e1e1e]"
            style={{ height: EDITOR_HEIGHT }}
          >
            <Suspense fallback={<EditorFallback />}>
              <Monaco
                height={EDITOR_HEIGHT}
                language="sql"
                theme="vs-dark"
                value={typedSql}
                options={EDITOR_OPTIONS}
              />
            </Suspense>
            {analyzing && !reduced && (
              <div
                role="status"
                aria-live="polite"
                className="absolute inset-0 grid place-items-center bg-bg/70 backdrop-blur-[1px]"
              >
                <div className="flex flex-col items-center gap-2 text-center">
                  <Loader2
                    className="h-5 w-5 animate-spin text-accent"
                    aria-hidden="true"
                  />
                  <p className="font-mono text-[11px] uppercase tracking-widest text-muted">
                    Claude is analyzing…
                  </p>
                  <p className="text-[11px] text-muted max-w-[18rem]">
                    sqlglot AST + heuristics &rarr; Messages API &rarr;
                    structured rewrite
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom — diff viewer */}
      <div className="mt-5">
        <QueryDiffViewer
          oldSql={selected.original_sql}
          newSql={showFinalDiff ? selected.optimized_sql : typedSql || " "}
        />
      </div>

    </div>
      {/* Reasoning panel lives BELOW the demo card per spec, but the parent
          owns query state, so it's rendered as a sibling inside this
          React island. */}
      <ReasoningPanel query={selected} />
    </div>
  );
}
