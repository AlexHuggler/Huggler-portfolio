import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import { Layers, Database, BarChart2 } from "lucide-react";

/**
 * MedallionDiagram
 *
 * Three horizontal bands (Bronze / Silver / Gold) representing the medallion
 * architecture. Droplets fall continuously from Bronze through Silver to
 * Gold and loop. Each band is a focusable button that emits a `lakehouse-tier`
 * CustomEvent (and an optional `onSelect` callback) so a sibling LayerDrillDown
 * can switch tabs and the page can scroll to the drill-down anchor.
 * Honors prefers-reduced-motion by rendering a static layout.
 */

export type Tier = "bronze" | "silver" | "gold";

interface Props {
  onSelect?: (tier: Tier) => void;
  selected?: Tier;
  scrollTargetId?: string;
}

interface BandSpec {
  tier: Tier;
  label: string;
  subtitle: string;
  bg: string;
  border: string;
  fg: string;
  icon: typeof Layers;
}

const BANDS: BandSpec[] = [
  {
    tier: "bronze",
    label: "Bronze",
    subtitle: "Raw landings",
    bg: "rgba(180, 83, 9, 0.18)",
    border: "rgba(180, 83, 9, 0.55)",
    fg: "#fbbf24",
    icon: Layers,
  },
  {
    tier: "silver",
    label: "Silver",
    subtitle: "Cleansed events",
    bg: "rgba(148, 163, 184, 0.14)",
    border: "rgba(148, 163, 184, 0.5)",
    fg: "#cbd5e1",
    icon: Database,
  },
  {
    tier: "gold",
    label: "Gold",
    subtitle: "Business marts",
    bg: "rgba(217, 119, 6, 0.18)",
    border: "rgba(217, 119, 6, 0.55)",
    fg: "#fcd34d",
    icon: BarChart2,
  },
];

// Geometry of the SVG.
const SVG_W = 720;
const SVG_H = 360;
const BAND_H = 88;
const BAND_GAP = 18;
const BAND_X = 24;
const BAND_W = SVG_W - BAND_X * 2;

function bandY(index: number): number {
  const totalH = BANDS.length * BAND_H + (BANDS.length - 1) * BAND_GAP;
  const startY = (SVG_H - totalH) / 2;
  return startY + index * (BAND_H + BAND_GAP);
}

interface DropletShapeProps {
  tier: Tier;
  cx: number;
  cy: number;
  fill: string;
}

function DropletShape({ tier, cx, cy, fill }: DropletShapeProps): JSX.Element {
  if (tier === "bronze") {
    // Irregular: rotated rounded rectangle.
    return (
      <rect
        x={cx - 6}
        y={cy - 4}
        width={12}
        height={8}
        rx={3}
        ry={3}
        transform={`rotate(-18 ${cx} ${cy})`}
        fill={fill}
      />
    );
  }
  if (tier === "silver") {
    return (
      <rect
        x={cx - 5}
        y={cy - 3}
        width={10}
        height={6}
        rx={1}
        ry={1}
        fill={fill}
      />
    );
  }
  // Gold: tiny bar fragment.
  return (
    <rect
      x={cx - 7}
      y={cy - 2}
      width={14}
      height={4}
      rx={0.5}
      ry={0.5}
      fill={fill}
    />
  );
}

interface AnimatedDropletProps {
  delay: number;
  duration: number;
  reduced: boolean;
}

function AnimatedDroplet({
  delay,
  duration,
  reduced,
}: AnimatedDropletProps): JSX.Element {
  const x = BAND_X + 80 + ((delay * 137) % (BAND_W - 160));
  const yBronze = bandY(0) + BAND_H / 2;
  const ySilver = bandY(1) + BAND_H / 2;
  const yGold = bandY(2) + BAND_H / 2;

  if (reduced) {
    return (
      <g aria-hidden="true">
        <DropletShape tier="bronze" cx={x} cy={yBronze} fill="#fbbf24" />
        <DropletShape tier="silver" cx={x + 30} cy={ySilver} fill="#cbd5e1" />
        <DropletShape tier="gold" cx={x + 60} cy={yGold} fill="#fcd34d" />
      </g>
    );
  }

  return (
    <motion.g
      initial={{ opacity: 0 }}
      animate={{ opacity: [0, 1, 1, 1, 0] }}
      transition={{
        duration,
        delay,
        repeat: Infinity,
        ease: "linear",
        times: [0, 0.05, 0.5, 0.95, 1],
      }}
      aria-hidden="true"
    >
      <motion.g
        animate={{
          y: [0, ySilver - yBronze, ySilver - yBronze, yGold - yBronze, 0],
        }}
        transition={{
          duration,
          delay,
          repeat: Infinity,
          ease: "easeInOut",
          times: [0, 0.33, 0.5, 0.83, 1],
        }}
      >
        <motion.g
          animate={{ opacity: [1, 1, 0, 0, 0] }}
          transition={{
            duration,
            delay,
            repeat: Infinity,
            ease: "linear",
            times: [0, 0.32, 0.34, 0.99, 1],
          }}
        >
          <DropletShape tier="bronze" cx={x} cy={yBronze} fill="#fbbf24" />
        </motion.g>
        <motion.g
          animate={{ opacity: [0, 0, 1, 0, 0] }}
          transition={{
            duration,
            delay,
            repeat: Infinity,
            ease: "linear",
            times: [0, 0.32, 0.5, 0.66, 1],
          }}
        >
          <DropletShape tier="silver" cx={x} cy={yBronze} fill="#cbd5e1" />
        </motion.g>
        <motion.g
          animate={{ opacity: [0, 0, 0, 1, 0] }}
          transition={{
            duration,
            delay,
            repeat: Infinity,
            ease: "linear",
            times: [0, 0.65, 0.67, 0.85, 1],
          }}
        >
          <DropletShape tier="gold" cx={x} cy={yBronze} fill="#fcd34d" />
        </motion.g>
      </motion.g>
    </motion.g>
  );
}

export default function MedallionDiagram({
  onSelect,
  selected,
  scrollTargetId,
}: Props): JSX.Element {
  const reduced = useReducedMotion();
  const [internalSelected, setInternalSelected] = useState<Tier | undefined>(
    selected,
  );

  useEffect(() => {
    if (selected) setInternalSelected(selected);
  }, [selected]);

  function handleSelect(t: Tier): void {
    setInternalSelected(t);
    onSelect?.(t);
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent<Tier>("lakehouse:tier-select", { detail: t }),
      );
      if (scrollTargetId) {
        const el = document.getElementById(scrollTargetId);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
  }
  const activeSelected = selected ?? internalSelected;

  // A handful of droplets staggered to look continuous.
  const droplets = [0, 0.7, 1.4, 2.1, 2.8, 3.5];
  const cycleSeconds = 6;

  return (
    <div className="w-full">
      <svg
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        className="w-full h-auto"
        role="img"
        aria-label="Medallion architecture diagram with three stacked bands: Bronze for raw landings, Silver for cleansed events, and Gold for business marts. Droplets flow from top to bottom representing data refinement."
      >
        <defs>
          <linearGradient id="medallion-bg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(15,23,42,0.0)" />
            <stop offset="100%" stopColor="rgba(15,23,42,0.0)" />
          </linearGradient>
        </defs>

        {/* Vertical guide line between bands */}
        <line
          x1={SVG_W / 2}
          y1={bandY(0) + BAND_H}
          x2={SVG_W / 2}
          y2={bandY(2)}
          stroke="rgba(148,163,184,0.18)"
          strokeWidth={1}
          strokeDasharray="3 3"
        />

        {/* Bands */}
        {BANDS.map((band, i) => {
          const y = bandY(i);
          const isSelected = activeSelected === band.tier;
          return (
            <g key={band.tier}>
              <motion.rect
                x={BAND_X}
                y={y}
                width={BAND_W}
                height={BAND_H}
                rx={10}
                ry={10}
                fill={band.bg}
                stroke={band.border}
                strokeWidth={isSelected ? 2 : 1}
                initial={false}
                animate={{
                  strokeWidth: isSelected ? 2.5 : 1,
                }}
                transition={{ duration: reduced ? 0 : 0.25 }}
              />
              <text
                x={BAND_X + 24}
                y={y + 32}
                fontSize={18}
                fontFamily="Inter, sans-serif"
                fontWeight={600}
                fill={band.fg}
              >
                {band.label}
              </text>
              <text
                x={BAND_X + 24}
                y={y + 56}
                fontSize={12}
                fontFamily="Inter, sans-serif"
                fill="rgba(226, 232, 240, 0.7)"
              >
                {band.subtitle}
              </text>
              <text
                x={BAND_X + 24}
                y={y + 76}
                fontSize={10}
                fontFamily="JetBrains Mono, ui-monospace, monospace"
                fill="rgba(148, 163, 184, 0.6)"
              >
                {band.tier === "bronze"
                  ? "raw_payload · ingested_at"
                  : band.tier === "silver"
                  ? "caller · callee · duration_sec"
                  : "market · arpu · churn_rate"}
              </text>
            </g>
          );
        })}

        {/* Droplets layer */}
        {droplets.map((delay) => (
          <AnimatedDroplet
            key={delay}
            delay={delay}
            duration={cycleSeconds}
            reduced={reduced}
          />
        ))}

        {/* Click overlays - rendered as foreignObject buttons for accessibility */}
        {BANDS.map((band, i) => {
          const y = bandY(i);
          return (
            <foreignObject
              key={`btn-${band.tier}`}
              x={BAND_X}
              y={y}
              width={BAND_W}
              height={BAND_H}
            >
              <button
                type="button"
                onClick={() => handleSelect(band.tier)}
                aria-label={`Select ${band.label} tier: ${band.subtitle}`}
                aria-pressed={activeSelected === band.tier}
                style={{
                  width: "100%",
                  height: "100%",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  outlineOffset: "2px",
                }}
              />
            </foreignObject>
          );
        })}
      </svg>
      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded"
            style={{ background: "#fbbf24" }}
          />
          Bronze · raw
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded"
            style={{ background: "#cbd5e1" }}
          />
          Silver · cleansed
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded"
            style={{ background: "#fcd34d" }}
          />
          Gold · marts
        </span>
        {reduced && <span className="ml-auto">Static view (reduced motion)</span>}
        {!reduced && (
          <span className="ml-auto">Click a band to explore that tier</span>
        )}
      </div>
    </div>
  );
}
