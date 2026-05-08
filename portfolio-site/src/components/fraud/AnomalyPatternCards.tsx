import { motion, useReducedMotion as useFmReducedMotion } from "framer-motion";
import { Activity, Globe, BarChart3 } from "lucide-react";

/**
 * AnomalyPatternCards
 *
 * Three pattern cards (velocity, geo, amount outlier) with mini animated
 * visuals and a Python detection-logic snippet each. Animations respect
 * prefers-reduced-motion via framer-motion's built-in detection.
 */

interface Pattern {
  id: string;
  title: string;
  description: string;
  icon: typeof Activity;
  visual: (reduced: boolean) => JSX.Element;
  code: string;
}

const VelocityVisual = (reduced: boolean) => (
  <svg viewBox="0 0 220 60" className="w-full h-14">
    <line x1="10" y1="30" x2="210" y2="30" stroke="rgba(148,163,184,0.2)" />
    {[18, 22, 27, 33, 39].map((cx, i) => (
      <motion.circle
        key={cx}
        cx={cx}
        cy={30}
        r={4}
        fill="#ef4444"
        initial={reduced ? { opacity: 1 } : { opacity: 0 }}
        animate={reduced ? { opacity: 1 } : { opacity: [0, 1, 1, 0.2] }}
        transition={
          reduced
            ? undefined
            : { duration: 2.4, repeat: Infinity, delay: i * 0.12 }
        }
      />
    ))}
    {[80, 120, 160, 200].map((cx) => (
      <circle key={cx} cx={cx} cy={30} r={3} fill="#2563eb" opacity={0.7} />
    ))}
  </svg>
);

const GeoVisual = (reduced: boolean) => (
  <svg viewBox="0 0 220 60" className="w-full h-14">
    <ellipse
      cx={110} cy={30} rx={100} ry={20}
      fill="none" stroke="rgba(148,163,184,0.2)"
    />
    <circle cx={40} cy={36} r={4} fill="#2563eb" />
    <circle cx={180} cy={24} r={4} fill="#ef4444" />
    <motion.path
      d="M 40 36 Q 110 0, 180 24"
      stroke="#ef4444"
      strokeWidth={1.5}
      fill="none"
      strokeDasharray="4 4"
      initial={reduced ? { pathLength: 1 } : { pathLength: 0 }}
      animate={reduced ? { pathLength: 1 } : { pathLength: 1 }}
      transition={reduced ? undefined : { duration: 1.6, repeat: Infinity, repeatType: "loop" }}
    />
  </svg>
);

const OutlierVisual = (reduced: boolean) => {
  const bars = [10, 12, 16, 20, 18, 14, 9, 7, 5, 4, 3];
  return (
    <svg viewBox="0 0 220 60" className="w-full h-14">
      {bars.map((h, i) => (
        <rect
          key={i}
          x={10 + i * 14}
          y={50 - h}
          width={10}
          height={h}
          fill="#2563eb"
          opacity={0.6}
        />
      ))}
      <motion.rect
        x={196}
        y={6}
        width={10}
        height={44}
        fill="#ef4444"
        initial={reduced ? { opacity: 1 } : { opacity: 0.4 }}
        animate={reduced ? { opacity: 1 } : { opacity: [0.4, 1, 0.4] }}
        transition={reduced ? undefined : { duration: 1.8, repeat: Infinity }}
      />
    </svg>
  );
};

const PATTERNS: Pattern[] = [
  {
    id: "velocity",
    title: "Velocity",
    description:
      "Many transactions on the same account in a short window — often after a card-not-present compromise.",
    icon: Activity,
    visual: VelocityVisual,
    code: `# stateful aggregation per account, last 60s window
df.withWatermark("ts", "5 minutes") \\
  .groupBy(window("ts", "60 seconds"), "account_id") \\
  .agg(count("*").alias("txn_count")) \\
  .filter("txn_count > 8")`,
  },
  {
    id: "geo",
    title: "Geographic Anomaly",
    description:
      "Two transactions on the same account from countries that cannot be reached in the elapsed time.",
    icon: Globe,
    visual: GeoVisual,
    code: `prev = lag("country").over(by_account)
gap = (col("ts") - lag("ts").over(by_account)).cast("long")
df.withColumn("impossible_travel",
   (prev != col("country")) & (gap < 3600))`,
  },
  {
    id: "outlier",
    title: "Amount Outlier",
    description:
      "Amount falls outside the account's recent distribution — Z-score above the rolling threshold.",
    icon: BarChart3,
    visual: OutlierVisual,
    code: `mean = avg("amount").over(by_account_30d)
sd   = stddev("amount").over(by_account_30d)
df.withColumn("z", (col("amount") - mean) / sd) \\
  .filter("abs(z) > 3.5")`,
  },
];

export default function AnomalyPatternCards() {
  const reduced = useFmReducedMotion() ?? false;
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {PATTERNS.map((p) => {
        const Icon = p.icon;
        return (
          <article
            key={p.id}
            className="demo-card flex flex-col"
            aria-labelledby={`pattern-${p.id}-title`}
          >
            <header className="flex items-center gap-2">
              <span className="rounded-md border border-border p-1.5">
                <Icon className="h-4 w-4 text-accent" aria-hidden="true" />
              </span>
              <h3
                id={`pattern-${p.id}-title`}
                className="text-sm font-semibold tracking-tight"
              >
                {p.title}
              </h3>
            </header>
            <p className="mt-2 text-xs text-muted">{p.description}</p>
            <div className="mt-3" aria-hidden="true">
              {p.visual(reduced)}
            </div>
            <p className="mt-3 font-mono text-[10px] uppercase tracking-widest text-muted">
              Detection logic
            </p>
            <pre className="code-block mt-1 whitespace-pre">{p.code}</pre>
          </article>
        );
      })}
    </div>
  );
}
