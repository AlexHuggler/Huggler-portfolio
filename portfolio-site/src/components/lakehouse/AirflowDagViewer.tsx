import { useEffect, useMemo, useRef, useState } from "react";
import ReactFlow, {
  Background,
  Handle,
  Position,
  type Node,
  type Edge,
  type NodeProps,
  type NodeTypes,
} from "reactflow";
import "reactflow/dist/style.css";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import PlayPauseButton from "../shared/PlayPauseButton";

/**
 * AirflowDagViewer
 *
 * Renders a 6-task linear Airflow DAG with reactflow. Status pulses through
 * each task in sequence (queued -> running -> success), looping every ~12s.
 * Hovering any node surfaces operator metadata in an overlay tooltip. Pan,
 * zoom, drag, and connect are all disabled - the diagram is decorative.
 */

type Status = "queued" | "running" | "success";

interface TaskMeta {
  id: string;
  label: string;
  operator: string;
  runtime: string;
  upstream: number;
  downstream: number;
}

const TASKS: TaskMeta[] = [
  {
    id: "generate_cdr_data",
    label: "generate_cdr_data",
    operator: "PythonOperator",
    runtime: "~25s",
    upstream: 0,
    downstream: 1,
  },
  {
    id: "ingest_to_bronze",
    label: "ingest_to_bronze",
    operator: "SparkSubmitOperator",
    runtime: "~3m",
    upstream: 1,
    downstream: 1,
  },
  {
    id: "validate_bronze_ge",
    label: "validate_bronze_ge",
    operator: "GreatExpectationsOperator",
    runtime: "~45s",
    upstream: 1,
    downstream: 1,
  },
  {
    id: "transform_to_silver",
    label: "transform_to_silver",
    operator: "SparkSubmitOperator",
    runtime: "~5m",
    upstream: 1,
    downstream: 1,
  },
  {
    id: "build_gold_marts",
    label: "build_gold_marts",
    operator: "DbtCloudRunJobOperator",
    runtime: "~2m",
    upstream: 1,
    downstream: 1,
  },
  {
    id: "notify_complete",
    label: "notify_complete",
    operator: "EmailOperator",
    runtime: "~5s",
    upstream: 1,
    downstream: 0,
  },
];

const TASK_X_GAP = 175;
const TASK_Y = 40;
const QUEUED_MS = 600;
const RUNNING_MS = 1200;
const RESET_MS = 1200;
const TOTAL_CYCLE_MS =
  TASKS.length * (QUEUED_MS + RUNNING_MS) + RESET_MS;

interface TaskNodeData {
  label: string;
  status: Status;
  operator: string;
  runtime: string;
  upstream: number;
  downstream: number;
  onHover: (id: string | null) => void;
  id: string;
}

function statusColor(s: Status): { bg: string; ring: string; pulse: boolean } {
  switch (s) {
    case "queued":
      return { bg: "rgba(148,163,184,0.45)", ring: "rgba(148,163,184,0.7)", pulse: false };
    case "running":
      return { bg: "#2563eb", ring: "#60a5fa", pulse: true };
    case "success":
      return { bg: "#10b981", ring: "rgba(16,185,129,0.7)", pulse: false };
  }
}

function TaskNode({ data }: NodeProps<TaskNodeData>): JSX.Element {
  const c = statusColor(data.status);
  return (
    <div
      onMouseEnter={() => data.onHover(data.id)}
      onMouseLeave={() => data.onHover(null)}
      onFocus={() => data.onHover(data.id)}
      onBlur={() => data.onHover(null)}
      tabIndex={0}
      aria-label={`Task ${data.label}, status ${data.status}, operator ${data.operator}, runtime ${data.runtime}`}
      style={{
        background: "rgba(15, 23, 42, 0.85)",
        border: `1px solid ${c.ring}`,
        borderRadius: 8,
        padding: "8px 12px",
        minWidth: 150,
        color: "#e2e8f0",
        fontFamily: "Inter, sans-serif",
        cursor: "default",
        outline: "none",
      }}
      className="focus-visible:ring-2 focus-visible:ring-accent"
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{ background: "transparent", border: "none" }}
        isConnectable={false}
      />
      <div className="flex items-center gap-2">
        <span
          className={c.pulse ? "demo-dot-pulse" : undefined}
          style={{
            display: "inline-block",
            width: 8,
            height: 8,
            borderRadius: 999,
            background: c.bg,
            boxShadow: c.pulse ? `0 0 0 3px ${c.bg}33` : undefined,
            flexShrink: 0,
          }}
          aria-hidden="true"
        />
        <span className="text-[11px] font-mono truncate">{data.label}</span>
      </div>
      <div className="text-[10px] text-muted mt-1 font-mono uppercase tracking-wider">
        {data.status}
      </div>
      <Handle
        type="source"
        position={Position.Right}
        style={{ background: "transparent", border: "none" }}
        isConnectable={false}
      />
    </div>
  );
}

const NODE_TYPES: NodeTypes = { task: TaskNode };

function buildStatuses(elapsed: number, total: number): Status[] {
  const statuses: Status[] = TASKS.map(() => "queued");
  // Each task occupies QUEUED_MS + RUNNING_MS within the cycle (excluding RESET_MS).
  const slot = QUEUED_MS + RUNNING_MS;
  for (let i = 0; i < TASKS.length; i++) {
    const start = i * slot;
    const runStart = start + QUEUED_MS;
    const end = start + slot;
    if (elapsed >= end) {
      statuses[i] = "success";
    } else if (elapsed >= runStart) {
      statuses[i] = "running";
    } else if (elapsed >= start) {
      statuses[i] = "queued";
    }
  }
  // During the reset window, everything stays "success" briefly.
  return statuses;
}

interface Props {
  id?: string;
}

export default function AirflowDagViewer({ id }: Props): JSX.Element {
  const reduced = useReducedMotion();
  const [playing, setPlaying] = useState<boolean>(true);
  const [statuses, setStatuses] = useState<Status[]>(() =>
    reduced ? TASKS.map(() => "success") : TASKS.map(() => "queued"),
  );
  const [hovered, setHovered] = useState<string | null>(null);
  const startRef = useRef<number>(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (reduced) {
      setStatuses(TASKS.map(() => "success"));
      return;
    }
    if (!playing) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      return;
    }
    startRef.current = performance.now();
    const tick = (now: number) => {
      const elapsed = (now - startRef.current) % TOTAL_CYCLE_MS;
      setStatuses(buildStatuses(elapsed, TOTAL_CYCLE_MS));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [playing, reduced]);

  const nodes: Node<TaskNodeData>[] = useMemo(
    () =>
      TASKS.map((t, i) => ({
        id: t.id,
        type: "task",
        position: { x: 20 + i * TASK_X_GAP, y: TASK_Y },
        data: {
          label: t.label,
          status: statuses[i],
          operator: t.operator,
          runtime: t.runtime,
          upstream: t.upstream,
          downstream: t.downstream,
          onHover: setHovered,
          id: t.id,
        },
        draggable: false,
        selectable: true,
        connectable: false,
      })),
    [statuses],
  );

  const edges: Edge[] = useMemo(
    () =>
      TASKS.slice(0, -1).map((t, i) => ({
        id: `${t.id}-${TASKS[i + 1].id}`,
        source: t.id,
        target: TASKS[i + 1].id,
        animated:
          !reduced && (statuses[i] === "running" || statuses[i + 1] === "running"),
        style: {
          stroke:
            statuses[i] === "success"
              ? "rgba(16, 185, 129, 0.6)"
              : "rgba(148, 163, 184, 0.4)",
          strokeWidth: 1.5,
        },
      })),
    [statuses, reduced],
  );

  const hoveredTask = hovered
    ? TASKS.find((t) => t.id === hovered) ?? null
    : null;

  return (
    <div className="demo-card" id={id}>
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <h3 className="text-sm font-semibold tracking-tight">
            Airflow DAG · daily lakehouse pipeline
          </h3>
          <p className="text-xs text-muted">
            6 tasks · runs nightly at 02:00 UTC · LocalExecutor
          </p>
        </div>
        <PlayPauseButton
          playing={playing && !reduced}
          onToggle={() => setPlaying((p) => !p)}
          label={
            reduced
              ? "DAG animation (disabled - reduced motion)"
              : "DAG animation"
          }
          className={reduced ? "opacity-50 pointer-events-none" : undefined}
        />
      </div>
      <div
        className="relative rounded-md border border-border bg-bg/40"
        style={{ height: 180 }}
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={NODE_TYPES}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          panOnDrag={false}
          panOnScroll={false}
          zoomOnScroll={false}
          zoomOnPinch={false}
          zoomOnDoubleClick={false}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable
          proOptions={{ hideAttribution: true }}
          minZoom={0.4}
          maxZoom={1.5}
        >
          <Background
            gap={16}
            size={1}
            color="rgba(148, 163, 184, 0.08)"
          />
        </ReactFlow>
        {hoveredTask && (
          <div
            role="tooltip"
            className="absolute top-2 left-2 z-10 rounded-md border border-border bg-bg/95 px-3 py-2 text-xs shadow-lg pointer-events-none"
            style={{ maxWidth: 240 }}
          >
            <p className="font-mono text-[11px] font-semibold">
              {hoveredTask.label}
            </p>
            <dl className="mt-1 space-y-0.5 text-[11px] text-muted">
              <div className="flex justify-between gap-3">
                <dt>operator</dt>
                <dd className="font-mono text-fg/80">{hoveredTask.operator}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>est. runtime</dt>
                <dd className="font-mono text-fg/80">{hoveredTask.runtime}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>upstream</dt>
                <dd className="font-mono text-fg/80">{hoveredTask.upstream}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>downstream</dt>
                <dd className="font-mono text-fg/80">
                  {hoveredTask.downstream}
                </dd>
              </div>
            </dl>
          </div>
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ background: "rgba(148,163,184,0.55)" }}
          />
          queued
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ background: "#2563eb" }}
          />
          running
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ background: "#10b981" }}
          />
          success
        </span>
        {reduced && (
          <span className="ml-auto">Static view (reduced motion)</span>
        )}
      </div>
    </div>
  );
}
