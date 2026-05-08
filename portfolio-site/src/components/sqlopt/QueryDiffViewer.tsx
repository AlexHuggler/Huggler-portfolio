import { Suspense, lazy, useEffect, useState } from "react";

/**
 * QueryDiffViewer
 *
 * Inline-mode SQL diff viewer wrapping react-diff-viewer-continued. The
 * library is loaded lazily because its style computation is fairly heavy
 * and its SSR story is finicky. Renders nothing until mounted to keep
 * hydration deterministic.
 */

const ReactDiffViewer = lazy(() =>
  import("react-diff-viewer-continued").then((m) => ({
    default: m.default,
  })),
);

interface Props {
  oldSql: string;
  newSql: string;
}

export default function QueryDiffViewer({ oldSql, newSql }: Props) {
  const [mounted, setMounted] = useState<boolean>(false);
  useEffect(() => setMounted(true), []);

  return (
    <div className="rounded-md border border-border bg-bg/40 overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <h4 className="text-xs font-semibold tracking-tight">Inline diff</h4>
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted">
          original vs optimized
        </span>
      </div>
      <div className="max-h-[420px] overflow-auto text-[12px]">
        {mounted ? (
          <Suspense
            fallback={
              <div className="px-3 py-3 text-xs text-muted">
                Loading diff…
              </div>
            }
          >
            <ReactDiffViewer
              oldValue={oldSql}
              newValue={newSql}
              splitView={false}
              useDarkTheme={true}
              showDiffOnly={false}
              hideLineNumbers={false}
            />
          </Suspense>
        ) : (
          <div className="px-3 py-3 text-xs text-muted">Loading diff…</div>
        )}
      </div>
    </div>
  );
}
