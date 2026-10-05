import type { JSX } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, RotateCcw, StepForward } from "lucide-react";
import { usePausable } from "../../hooks/usePausable";
import { feed, type FeedEvent, type FraudLabel, type DetectorKind } from "../../data/artifacts";

/**
 * Replays a contiguous slice of the real `make eval` stream (producer order),
 * showing each event's ground-truth label next to what the detectors did.
 * Event-level flags are what the detectors emitted for that exact event;
 * "account caught" is the account-level verdict the evaluator scores.
 *
 * Motion policy: pauses when off-screen, when the tab is hidden, when the
 * reader presses Pause, and starts paused under reduced motion. Screen
 * readers get a throttled summary, not a firehose of rows.
 */

const EVENTS = feed.events;
const VISIBLE = 9;
const LABEL_KIND: Record<Exclude<FraudLabel, "normal">, DetectorKind> = {
  velocity_burst: "velocity",
  impossible_travel: "geo",
  amount_outlier: "amount",
};
const LABEL_TEXT: Record<FraudLabel, string> = {
  normal: "normal",
  velocity_burst: "velocity burst",
  impossible_travel: "impossible travel",
  amount_outlier: "amount outlier",
};

// Open on a stretch that already shows labeled fraud and a detector hit.
const INITIAL = (() => {
  let labeled = 0;
  let flagged = 0;
  for (let i = 0; i < EVENTS.length; i++) {
    if (EVENTS[i].label !== "normal") labeled++;
    if (EVENTS[i].flags.length) flagged++;
    if (labeled >= 3 && flagged >= 1) return Math.max(VISIBLE, i + 2);
  }
  return VISIBLE;
})();

function verdict(e: FeedEvent): "tp" | "fp" | "caught" | "missed" | "clean" {
  const flagged = e.flags.length > 0;
  if (e.label === "normal") return flagged ? "fp" : "clean";
  if (flagged) return "tp";
  return e.accountFlags.includes(LABEL_KIND[e.label]) ? "caught" : "missed";
}

const VERDICT: Record<ReturnType<typeof verdict>, { text: string; cls: string; title: string }> = {
  tp: { text: "flagged", cls: "measured", title: "Detector flagged this labeled event" },
  caught: { text: "acct caught", cls: "implemented", title: "Not this event, but the account was flagged by the matching detector" },
  missed: { text: "missed", cls: "stub", title: "Labeled event whose account the matching detector never flagged" },
  fp: { text: "false +", cls: "stub", title: "Detector flagged a normal event" },
  clean: { text: "—", cls: "count", title: "Normal event, not flagged" },
};

export default function FeedReplay(): JSX.Element {
  const rootRef = useRef<HTMLDivElement>(null);
  const { running, paused, toggle } = usePausable(rootRef);
  const [cursor, setCursor] = useState(INITIAL);
  const [speed, setSpeed] = useState<1 | 4>(1);
  const [announce, setAnnounce] = useState("");
  const lastAnnounce = useRef(0);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      setCursor((c) => (c >= EVENTS.length ? VISIBLE : c + 1));
    }, 700 / speed);
    return () => window.clearInterval(id);
  }, [running, speed]);

  const seen = useMemo(() => EVENTS.slice(0, cursor), [cursor]);
  const rows = useMemo(() => seen.slice(-VISIBLE).reverse(), [seen]);
  const stats = useMemo(() => {
    const s = { events: seen.length, labeled: 0, flagged: 0, tp: 0, fp: 0, caught: 0 };
    for (const e of seen) {
      const v = verdict(e);
      if (e.label !== "normal") s.labeled++;
      if (e.flags.length) s.flagged++;
      if (v === "tp") s.tp++;
      if (v === "fp") s.fp++;
      if (v === "tp" || v === "caught") s.caught++;
    }
    return s;
  }, [seen]);

  // Throttled live summary (every ~5 s while playing, immediately on pause).
  useEffect(() => {
    const now = Date.now();
    if (running && now - lastAnnounce.current < 5000) return;
    lastAnnounce.current = now;
    setAnnounce(
      `${stats.events} events replayed: ${stats.labeled} labeled fraud, ${stats.flagged} flagged, ${stats.fp} false positives.`,
    );
  }, [stats, running]);

  const btn =
    "inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 text-xs font-medium text-muted transition-colors hover:border-border-strong hover:text-fg";

  return (
    <div ref={rootRef} className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <button type="button" className={btn} onClick={toggle}>
            {paused ? <Play size={13} aria-hidden="true" /> : <Pause size={13} aria-hidden="true" />}
            {paused ? "Play" : "Pause"}
            <span className="sr-only"> event replay</span>
          </button>
          <button
            type="button"
            className={btn}
            onClick={() => setCursor((c) => Math.min(c + 1, EVENTS.length))}
            disabled={cursor >= EVENTS.length}
          >
            <StepForward size={13} aria-hidden="true" /> Step
          </button>
          <button type="button" className={btn} onClick={() => setCursor(VISIBLE)}>
            <RotateCcw size={13} aria-hidden="true" /> Reset
          </button>
          <div className="segmented ml-1" role="group" aria-label="Replay speed">
            {[1, 4].map((s) => (
              <button key={s} type="button" aria-pressed={speed === s} onClick={() => setSpeed(s as 1 | 4)} className="!px-2 !py-1 text-xs">
                {s}×
              </button>
            ))}
          </div>
        </div>
        <span className="data-chip" data-kind="real" title={feed._meta.note}>
          make eval · events {feed.offset}–{feed.offset + EVENTS.length - 1}
        </span>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_240px]">
        <div className="min-w-0 overflow-x-auto">
          <table className="w-full min-w-[620px] text-left text-sm">
            <caption className="sr-only">Most recent replayed events, newest first</caption>
            <thead>
              <tr className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
                <th scope="col" className="px-4 py-2.5 font-medium">#</th>
                <th scope="col" className="px-2 py-2.5 font-medium">Account</th>
                <th scope="col" className="px-2 py-2.5 font-medium">Merchant</th>
                <th scope="col" className="px-2 py-2.5 font-medium">Ctry</th>
                <th scope="col" className="px-2 py-2.5 text-right font-medium">Amount</th>
                <th scope="col" className="px-3 py-2.5 font-medium">Ground truth</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Detectors</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => {
                const v = verdict(e);
                const meta = VERDICT[v];
                return (
                  <tr key={e.i} className={`feed-row border-t border-border ${e.label !== "normal" ? "feed-row-labeled" : ""}`}>
                    <td className="px-4 py-2 font-mono text-[11px] text-muted">{e.i}</td>
                    <td className="px-2 py-2 font-mono text-[12px]">{e.account}</td>
                    <td className="px-2 py-2 text-[13px] text-fg/85">{e.category.replace(/_/g, " ")}</td>
                    <td className="px-2 py-2 font-mono text-[12px]">{e.country}</td>
                    <td className="px-2 py-2 text-right font-mono text-[12px]">${e.amount.toFixed(2)}</td>
                    <td className="px-3 py-2">
                      <span className={`font-mono text-[11px] ${e.label === "normal" ? "text-muted" : "font-semibold text-fg"}`}>
                        {LABEL_TEXT[e.label]}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <span className="flex flex-wrap items-center gap-1.5">
                        {v === "clean" ? (
                          <span className="font-mono text-[11px] text-muted" title={meta.title}>—</span>
                        ) : (
                          <span className="status-chip" data-status={meta.cls} title={meta.title}>{meta.text}</span>
                        )}
                        {e.flags.map((f) => (
                          <span key={f} className="font-mono text-[10px] text-muted">{f}</span>
                        ))}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <aside className="border-t border-border bg-surface-2 p-4 lg:border-l lg:border-t-0">
          <p className="kicker">Replayed so far</p>
          <dl className="mt-3 grid grid-cols-2 gap-3">
            {[
              ["Events", stats.events],
              ["Labeled fraud", stats.labeled],
              ["Flagged", stats.flagged],
              ["False +", stats.fp],
            ].map(([k, v]) => (
              <div key={k as string} className="flex flex-col">
                <dt className="order-2 text-[11px] text-muted">{k}</dt>
                <dd className="order-1 font-mono text-lg font-semibold">{v}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-border" aria-hidden="true">
            <div className="h-full bg-accent" style={{ width: `${(cursor / EVENTS.length) * 100}%` }} />
          </div>
          <p className="mt-2 font-mono text-[10px] text-muted">{cursor} / {EVENTS.length} events</p>
          <p className="mt-4 text-xs leading-relaxed text-muted">
            The velocity detector flags one event per account, so most burst events show
            <em> acct caught</em> rather than <em>flagged</em> — the evaluator scores accounts, not events.
          </p>
        </aside>
      </div>
      <p className="sr-only" role="status" aria-live="polite">{announce}</p>
    </div>
  );
}
