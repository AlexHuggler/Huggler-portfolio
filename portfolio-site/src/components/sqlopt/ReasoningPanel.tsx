import { motion } from "framer-motion";
import {
  Calendar,
  Database,
  Filter,
  Gauge,
  GitBranch,
  Layers,
  Sparkles,
  Zap,
} from "lucide-react";
import type { ComponentType, SVGProps } from "react";
import { useReducedMotion } from "../../hooks/useReducedMotion";

/**
 * ReasoningPanel
 *
 * Renders the bullet list of reasoning items for the currently-selected
 * query. Icon is resolved via a static lookup keyed on the fixture's
 * `icon` string; missing keys fall back to Sparkles. Items animate in
 * with a staggered fade unless reduced motion is requested.
 */

interface ReasoningItem {
  icon: string;
  text: string;
}

interface QueryFixture {
  id: string;
  title: string;
  reasoning: ReasoningItem[];
  estimated_cost_reduction_pct: number;
  explanation: string;
}

interface Props {
  query: QueryFixture;
}

type LucideIcon = ComponentType<SVGProps<SVGSVGElement>>;

const ICONS: Record<string, LucideIcon> = {
  Filter: Filter as LucideIcon,
  Database: Database as LucideIcon,
  Zap: Zap as LucideIcon,
  GitBranch: GitBranch as LucideIcon,
  Gauge: Gauge as LucideIcon,
  Layers: Layers as LucideIcon,
  Sparkles: Sparkles as LucideIcon,
  Calendar: Calendar as LucideIcon,
};

function resolveIcon(name: string): LucideIcon {
  return ICONS[name] ?? (Sparkles as LucideIcon);
}

export default function ReasoningPanel({ query }: Props) {
  const reduced = useReducedMotion();

  return (
    <div className="demo-card">
      <header className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="demo-eyebrow">Why this rewrite</p>
          <h3 className="mt-1 text-base font-semibold tracking-tight">
            Claude&rsquo;s reasoning
          </h3>
        </div>
        <span className="placeholder-banner inline-block">
          Illustrative · est. {query.estimated_cost_reduction_pct}% cost reduction
        </span>
      </header>

      <ul className="space-y-2.5" key={query.id}>
        {query.reasoning.map((item, i) => {
          const Icon = resolveIcon(item.icon);
          return (
            <motion.li
              key={`${query.id}-${i}`}
              initial={reduced ? false : { opacity: 0, x: -6 }}
              animate={reduced ? undefined : { opacity: 1, x: 0 }}
              transition={
                reduced
                  ? undefined
                  : { duration: 0.3, delay: i * 0.08, ease: "easeOut" }
              }
              className="group flex gap-3 rounded-md border border-l-2 border-border border-l-accent/70 bg-bg/30 px-3 py-2.5 text-sm transition-colors hover:border-fg/30 hover:border-l-accent"
            >
              <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-border bg-bg/40 text-accent">
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
              <span className="text-fg/90 leading-relaxed">{item.text}</span>
            </motion.li>
          );
        })}
      </ul>

      <p className="mt-4 border-t border-border pt-3 text-xs text-muted leading-relaxed">
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted">
          Pattern note ·{" "}
        </span>
        {query.explanation}
      </p>
    </div>
  );
}
