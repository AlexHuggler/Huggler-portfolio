import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "../../hooks/useReducedMotion";

/**
 * SequenceDiagram
 *
 * Small animated hero diagram showing the optimizer pipeline:
 * SQL -> Claude -> Suggestion -> Diff -> Verified. Five labeled boxes
 * connected by arrows, with a pulse traveling left-to-right that loops.
 * Reduced motion: renders statically with a single dot mid-track.
 */

interface Stage {
  label: string;
  sub: string;
}

const STAGES: Stage[] = [
  { label: "SQL", sub: "input" },
  { label: "Claude", sub: "messages API" },
  { label: "Suggestion", sub: "rewrite + reasoning" },
  { label: "Diff", sub: "side-by-side" },
  { label: "Verified", sub: "EXPLAIN delta" },
];

const VIEWBOX_W = 1200;
const VIEWBOX_H = 200;
const BOX_W = 180;
const BOX_H = 78;
const Y_CENTER = VIEWBOX_H / 2;

function boxX(i: number): number {
  const totalBoxes = STAGES.length;
  const gap = (VIEWBOX_W - totalBoxes * BOX_W) / (totalBoxes + 1);
  return gap + i * (BOX_W + gap);
}

const PULSE_DURATION_MS = 5200;

export default function SequenceDiagram() {
  const reduced = useReducedMotion();
  const [t, setT] = useState<number>(0);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number>(0);

  useEffect(() => {
    if (reduced) return;
    startRef.current = performance.now();
    const loop = (now: number) => {
      const elapsed = (now - startRef.current) % PULSE_DURATION_MS;
      setT(elapsed / PULSE_DURATION_MS);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [reduced]);

  const trackStartX = boxX(0) + BOX_W / 2;
  const trackEndX = boxX(STAGES.length - 1) + BOX_W / 2;
  const pulseX = reduced
    ? (trackStartX + trackEndX) / 2
    : trackStartX + (trackEndX - trackStartX) * t;

  // Active stage index based on pulse progress.
  const activeIdx = reduced
    ? -1
    : Math.min(
        STAGES.length - 1,
        Math.floor(t * STAGES.length),
      );

  return (
    <div className="w-full">
      <svg
        role="img"
        aria-label="Pipeline diagram showing SQL flowing through Claude, then a suggestion, a diff, and a verified verification step."
        viewBox={`0 0 ${VIEWBOX_W} ${VIEWBOX_H}`}
        className="w-full h-auto"
      >
        <defs>
          <linearGradient id="seq-track" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="rgba(37,99,235,0.15)" />
            <stop offset="100%" stopColor="rgba(37,99,235,0.5)" />
          </linearGradient>
          <radialGradient id="seq-pulse" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#60a5fa" stopOpacity={1} />
            <stop offset="60%" stopColor="#2563eb" stopOpacity={0.6} />
            <stop offset="100%" stopColor="#2563eb" stopOpacity={0} />
          </radialGradient>
        </defs>

        {/* Track line */}
        <line
          x1={trackStartX}
          y1={Y_CENTER}
          x2={trackEndX}
          y2={Y_CENTER}
          stroke="url(#seq-track)"
          strokeWidth={2}
        />

        {/* Arrowheads between consecutive boxes */}
        {STAGES.slice(0, -1).map((_, i) => {
          const startX = boxX(i) + BOX_W;
          const endX = boxX(i + 1);
          const midX = (startX + endX) / 2;
          return (
            <polygon
              key={`arr-${i}`}
              points={`${midX - 6},${Y_CENTER - 6} ${midX + 6},${Y_CENTER} ${midX - 6},${Y_CENTER + 6}`}
              fill="rgba(148,163,184,0.55)"
            />
          );
        })}

        {/* Stage boxes */}
        {STAGES.map((stage, i) => {
          const x = boxX(i);
          const y = Y_CENTER - BOX_H / 2;
          const isActive = activeIdx === i;
          return (
            <g key={stage.label}>
              <rect
                x={x}
                y={y}
                width={BOX_W}
                height={BOX_H}
                rx={10}
                ry={10}
                fill={isActive ? "rgba(37,99,235,0.22)" : "rgba(15,23,42,0.85)"}
                stroke={isActive ? "#60a5fa" : "rgba(148,163,184,0.45)"}
                strokeWidth={isActive ? 1.5 : 1}
              />
              <text
                x={x + BOX_W / 2}
                y={y + BOX_H / 2 - 6}
                textAnchor="middle"
                fontSize={18}
                fontFamily="JetBrains Mono, ui-monospace, Menlo, monospace"
                fill="#e2e8f0"
              >
                {stage.label}
              </text>
              <text
                x={x + BOX_W / 2}
                y={y + BOX_H / 2 + 16}
                textAnchor="middle"
                fontSize={11}
                fontFamily="Inter, sans-serif"
                fill="#94a3b8"
              >
                {stage.sub}
              </text>
            </g>
          );
        })}

        {/* Pulse traveling along the track */}
        <circle
          cx={pulseX}
          cy={Y_CENTER}
          r={18}
          fill="url(#seq-pulse)"
          opacity={reduced ? 0.7 : 0.9}
        />
        <circle
          cx={pulseX}
          cy={Y_CENTER}
          r={5}
          fill="#dbeafe"
          opacity={reduced ? 0.85 : 1}
        />
      </svg>
      {reduced && (
        <p className="mt-2 text-[11px] text-muted text-right">
          Static view (reduced motion)
        </p>
      )}
    </div>
  );
}
