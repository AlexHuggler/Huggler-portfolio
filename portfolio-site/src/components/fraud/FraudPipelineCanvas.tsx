import { useEffect, useMemo, useRef, useState } from "react";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import PlayPauseButton from "../shared/PlayPauseButton";

/**
 * FraudPipelineCanvas
 *
 * SVG canvas (1200x280, viewBox-scaled) showing six pipeline stages with
 * colored dots flowing left-to-right. ~92% normal (blue) and ~8% anomalous
 * (red); red dots pulse briefly when they arrive at the Spark detection
 * node. Pause/play and prefers-reduced-motion are honored.
 */

interface Dot {
  id: number;
  bornAt: number;
  segment: number;        // 0..N-2
  segmentDuration: number;
  fraud: boolean;
}

const NODES = [
  { x: 70,   label: "Producer" },
  { x: 270,  label: "Kafka" },
  { x: 480,  label: "Spark Stream" },
  { x: 700,  label: "Delta Lake" },
  { x: 900,  label: "dbt" },
  { x: 1110, label: "Dashboard" },
];
const NUM_SEGMENTS = NODES.length - 1;
const TOTAL_TARGET_DOTS = 22;
const DOT_SEGMENT_MS = 1300;
const SPAWN_INTERVAL_MS = DOT_SEGMENT_MS * NUM_SEGMENTS / TOTAL_TARGET_DOTS;

let nextDotId = 1;

export default function FraudPipelineCanvas() {
  const reduced = useReducedMotion();
  const [playing, setPlaying] = useState<boolean>(true);
  const [tick, setTick] = useState<number>(0);
  const dotsRef = useRef<Dot[]>([]);
  const lastSpawnRef = useRef<number>(0);
  const rafRef = useRef<number | null>(null);
  const lastFrameRef = useRef<number>(0);
  const accumRef = useRef<number>(0);

  // Static rendering for reduced motion: 6 dots, evenly distributed.
  const staticDots = useMemo<Dot[]>(() => {
    const out: Dot[] = [];
    for (let i = 0; i < 8; i++) {
      out.push({
        id: i,
        bornAt: 0,
        segment: i % NUM_SEGMENTS,
        segmentDuration: DOT_SEGMENT_MS,
        fraud: i === 4,
      });
    }
    return out;
  }, []);

  useEffect(() => {
    if (reduced || !playing) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      return;
    }
    lastFrameRef.current = performance.now();
    const step = (now: number) => {
      const delta = now - lastFrameRef.current;
      lastFrameRef.current = now;
      accumRef.current += delta;
      lastSpawnRef.current += delta;
      if (lastSpawnRef.current >= SPAWN_INTERVAL_MS) {
        lastSpawnRef.current = 0;
        const fraud = Math.random() < 0.08;
        dotsRef.current.push({
          id: nextDotId++,
          bornAt: now,
          segment: 0,
          segmentDuration: DOT_SEGMENT_MS,
          fraud,
        });
      }
      // Advance + cull.
      dotsRef.current = dotsRef.current
        .map((d) => {
          const elapsed = now - d.bornAt;
          const seg = Math.floor(elapsed / d.segmentDuration);
          return { ...d, segment: seg };
        })
        .filter((d) => d.segment < NUM_SEGMENTS);
      setTick((t) => (t + 1) % 1_000_000);
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [playing, reduced]);

  const renderedDots = reduced ? staticDots : dotsRef.current;
  const now =
    typeof performance !== "undefined" ? performance.now() : 0;

  return (
    <div className="relative w-full">
      <div className="absolute right-2 top-2 z-10">
        {!reduced && (
          <PlayPauseButton
            playing={playing}
            onToggle={() => setPlaying((p) => !p)}
            label="fraud pipeline animation"
          />
        )}
      </div>
      <svg
        role="img"
        aria-label="Pipeline diagram showing transactions flowing through Producer, Kafka, Spark Stream, Delta Lake, dbt, and Dashboard. Most events are normal; a small fraction are flagged as fraud."
        viewBox="0 0 1200 280"
        className="w-full h-auto"
      >
        <defs>
          <linearGradient id="track" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="rgba(37,99,235,0.05)" />
            <stop offset="100%" stopColor="rgba(37,99,235,0.35)" />
          </linearGradient>
        </defs>
        {/* Track line */}
        <line
          x1={NODES[0].x}
          y1={140}
          x2={NODES[NODES.length - 1].x}
          y2={140}
          stroke="url(#track)"
          strokeWidth={2}
        />
        {/* Stage nodes */}
        {NODES.map((node, i) => (
          <g key={node.label}>
            <circle
              cx={node.x}
              cy={140}
              r={28}
              fill="rgba(15,23,42,0.85)"
              stroke="rgba(148,163,184,0.45)"
              strokeWidth={1.5}
            />
            <text
              x={node.x}
              y={140}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={11}
              fontFamily="JetBrains Mono, ui-monospace, Menlo, monospace"
              fill="#e2e8f0"
            >
              {String(i + 1).padStart(2, "0")}
            </text>
            <text
              x={node.x}
              y={195}
              textAnchor="middle"
              fontSize={12}
              fontFamily="Inter, sans-serif"
              fill="#94a3b8"
            >
              {node.label}
            </text>
          </g>
        ))}
        {/* Direction arrowheads between nodes */}
        {NODES.slice(0, -1).map((node, i) => {
          const next = NODES[i + 1];
          const midX = (node.x + next.x) / 2;
          return (
            <polygon
              key={`arrow-${i}`}
              points={`${midX - 5},134 ${midX + 5},140 ${midX - 5},146`}
              fill="rgba(148,163,184,0.5)"
            />
          );
        })}
        {/* Flowing dots */}
        {renderedDots.map((dot) => {
          const elapsed = reduced
            ? dot.segmentDuration * 0.5
            : now - dot.bornAt;
          const total = dot.segmentDuration * NUM_SEGMENTS;
          const t = Math.min(elapsed / total, 1);
          const x = NODES[0].x + (NODES[NODES.length - 1].x - NODES[0].x) * t;
          const isAtSpark = !reduced && dot.fraud && dot.segment === 1;
          const r = isAtSpark ? 6 : 4;
          const fill = dot.fraud ? "#ef4444" : "#2563eb";
          const opacity = dot.fraud ? 1 : 0.85;
          return (
            <circle
              key={dot.id}
              cx={x}
              cy={140}
              r={r}
              fill={fill}
              opacity={opacity}
              className={isAtSpark ? "demo-dot-pulse" : undefined}
            />
          );
        })}
      </svg>
      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full bg-[#2563eb]" />
          Normal event
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full bg-[#ef4444]" />
          Flagged as fraud
        </span>
        {reduced && <span className="ml-auto">Static view (reduced motion)</span>}
      </div>
    </div>
  );
}
