import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import PlayPauseButton from "../shared/PlayPauseButton";
import fixture from "../../data/fraud-transactions.json";

/**
 * TransactionFeed
 *
 * Scrolling feed of synthetic transactions. Pulls from the static fixture,
 * advances ~2/sec, and loops indefinitely. Anomalies render with a red
 * border and a FRAUD pattern tag; normal transactions are subdued.
 */

interface Txn {
  txn_id: string;
  account_id: string;
  amount: number;
  merchant: string;
  merchant_category: string;
  country: string;
  device_id: string;
  is_fraud: boolean;
  fraud_pattern: string | null;
}

const ALL_TXNS = (fixture as { transactions: Txn[] }).transactions;
const VISIBLE = 8;
const TICK_MS = 500; // 2/sec

function maskAccount(id: string): string {
  return id.replace(/^ACCT_/, "ACCT_••") .slice(0, 9) + "•";
}

function formatAmount(n: number): string {
  return `$${n.toFixed(2)}`;
}

function patternLabel(p: string): string {
  switch (p) {
    case "velocity":      return "VELOCITY";
    case "geo_anomaly":   return "GEO ANOMALY";
    case "amount_outlier":return "AMOUNT OUTLIER";
    default:              return p.toUpperCase();
  }
}

interface TransactionFeedProps {
  onTxn?: (txn: Txn, index: number) => void;
}

export default function TransactionFeed({ onTxn }: TransactionFeedProps) {
  const reduced = useReducedMotion();
  const [playing, setPlaying] = useState(true);
  const [cursor, setCursor] = useState(0);
  const [feed, setFeed] = useState<Txn[]>(() => ALL_TXNS.slice(0, VISIBLE));
  const onTxnRef = useRef(onTxn);
  onTxnRef.current = onTxn;

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      setCursor((c) => {
        const next = (c + 1) % ALL_TXNS.length;
        const txn = ALL_TXNS[next];
        setFeed((curr) => {
          const updated = [txn, ...curr];
          return updated.slice(0, VISIBLE);
        });
        if (onTxnRef.current) onTxnRef.current(txn, next);
        return next;
      });
    }, reduced ? 1500 : TICK_MS);
    return () => window.clearInterval(id);
  }, [playing, reduced]);

  const counts = useMemo(() => {
    let normal = 0;
    let fraud = 0;
    feed.forEach((t) => (t.is_fraud ? fraud++ : normal++));
    return { normal, fraud };
  }, [feed]);

  return (
    <div className="demo-card">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div>
          <h3 className="text-sm font-semibold tracking-tight">
            Live transaction feed
          </h3>
          <p className="text-xs text-muted">
            Synthetic stream from fixture · {ALL_TXNS.length} sample txns
          </p>
        </div>
        <PlayPauseButton
          playing={playing}
          onToggle={() => setPlaying((p) => !p)}
          label="transaction feed"
        />
      </div>
      <ul
        aria-live="polite"
        aria-label="Live transaction feed"
        className="space-y-1.5"
      >
        {feed.map((t, i) => {
          const fresh = i === 0;
          return (
            <li
              key={`${t.txn_id}-${cursor}-${i}`}
              className={[
                "rounded-md border px-3 py-2 text-xs flex items-center justify-between gap-2",
                t.is_fraud
                  ? "border-red-500/60 bg-red-500/5"
                  : "border-border bg-bg/40",
                fresh && !reduced ? "demo-fade-in" : "",
              ].join(" ")}
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                {t.is_fraud ? (
                  <AlertTriangle
                    className="h-3.5 w-3.5 text-red-400 shrink-0"
                    aria-hidden="true"
                  />
                ) : (
                  <CheckCircle2
                    className="h-3.5 w-3.5 text-emerald-400/80 shrink-0"
                    aria-hidden="true"
                  />
                )}
                <span className="font-mono text-muted shrink-0">
                  {maskAccount(t.account_id)}
                </span>
                <span className="truncate">{t.merchant}</span>
                <span className="font-mono text-muted shrink-0">
                  {t.country}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="font-mono">{formatAmount(t.amount)}</span>
                {t.is_fraud && t.fraud_pattern && (
                  <span className="rounded-sm bg-red-500/10 px-1.5 py-0.5 font-mono text-[10px] tracking-wider text-red-300">
                    FRAUD: {patternLabel(t.fraud_pattern)}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <div className="mt-3 flex items-center justify-between text-[11px] text-muted">
        <span>Window of last {VISIBLE} events</span>
        <span>
          <span className="font-mono">{counts.normal}</span> normal ·{" "}
          <span className="font-mono text-red-300">{counts.fraud}</span> flagged
        </span>
      </div>
    </div>
  );
}
