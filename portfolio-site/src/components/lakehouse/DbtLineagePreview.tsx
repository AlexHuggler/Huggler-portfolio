import { useMemo, useState } from "react";
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

/**
 * DbtLineagePreview
 *
 * Static-style reactflow diagram of a sources -> silver -> gold dbt graph.
 * Nodes are layered horizontally and grouped by tier color. Hovering or
 * focusing a model surfaces its `models/...sql` filename in a tooltip.
 * Pan, zoom, and drag are disabled - the diagram is a visual reference.
 */

type Tier = "source" | "silver" | "gold";

interface ModelMeta {
  id: string;
  label: string;
  tier: Tier;
  file: string;
  description: string;
}

const MODELS: ModelMeta[] = [
  {
    id: "src_cdr_raw",
    label: "bronze.cdr_raw",
    tier: "source",
    file: "models/sources/bronze/cdr_raw.yml",
    description: "Raw CDR landing zone (Iceberg, append-only).",
  },
  {
    id: "src_subscribers_raw",
    label: "bronze.subscribers_raw",
    tier: "source",
    file: "models/sources/bronze/subscribers_raw.yml",
    description: "Raw subscriber dump from billing system.",
  },
  {
    id: "silver_cdr",
    label: "silver.cdr_normalized",
    tier: "silver",
    file: "models/silver/cdr_normalized.sql",
    description: "Normalized CDR with E.164 phone numbers and market resolution.",
  },
  {
    id: "silver_subs",
    label: "silver.subscribers_dim",
    tier: "silver",
    file: "models/silver/subscribers_dim.sql",
    description: "Slowly-changing subscriber dimension.",
  },
  {
    id: "silver_markets",
    label: "silver.markets_dim",
    tier: "silver",
    file: "models/silver/markets_dim.sql",
    description: "Market lookup with country/region rollups.",
  },
  {
    id: "gold_revenue",
    label: "gold.revenue_by_market",
    tier: "gold",
    file: "models/gold/revenue_by_market.sql",
    description: "Monthly revenue aggregated by market.",
  },
  {
    id: "gold_arpu",
    label: "gold.arpu_monthly",
    tier: "gold",
    file: "models/gold/arpu_monthly.sql",
    description: "ARPU = revenue / active_subscribers, monthly.",
  },
  {
    id: "gold_churn",
    label: "gold.churn_signals",
    tier: "gold",
    file: "models/gold/churn_signals.sql",
    description: "Cohort survival churn metrics.",
  },
];

const EDGES: Array<[string, string]> = [
  ["src_cdr_raw", "silver_cdr"],
  ["src_subscribers_raw", "silver_subs"],
  ["silver_cdr", "gold_revenue"],
  ["silver_cdr", "gold_arpu"],
  ["silver_cdr", "gold_churn"],
  ["silver_subs", "gold_arpu"],
  ["silver_subs", "gold_churn"],
  ["silver_markets", "gold_revenue"],
];

const TIER_COLORS: Record<Tier, { bg: string; ring: string; fg: string }> = {
  source: {
    bg: "rgba(180, 83, 9, 0.15)",
    ring: "rgba(180, 83, 9, 0.55)",
    fg: "#fbbf24",
  },
  silver: {
    bg: "rgba(148, 163, 184, 0.12)",
    ring: "rgba(148, 163, 184, 0.5)",
    fg: "#cbd5e1",
  },
  gold: {
    bg: "rgba(217, 119, 6, 0.15)",
    ring: "rgba(217, 119, 6, 0.55)",
    fg: "#fcd34d",
  },
};

interface ModelNodeData {
  label: string;
  tier: Tier;
  id: string;
  file: string;
  onHover: (id: string | null) => void;
}

function ModelNode({ data }: NodeProps<ModelNodeData>): JSX.Element {
  const c = TIER_COLORS[data.tier];
  return (
    <div
      onMouseEnter={() => data.onHover(data.id)}
      onMouseLeave={() => data.onHover(null)}
      onFocus={() => data.onHover(data.id)}
      onBlur={() => data.onHover(null)}
      tabIndex={0}
      aria-label={`${data.label}, source file ${data.file}`}
      style={{
        background: c.bg,
        border: `1px solid ${c.ring}`,
        borderRadius: 6,
        padding: "6px 10px",
        minWidth: 140,
        color: c.fg,
        fontFamily: "JetBrains Mono, ui-monospace, monospace",
        fontSize: 11,
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
      <span>{data.label}</span>
      <Handle
        type="source"
        position={Position.Right}
        style={{ background: "transparent", border: "none" }}
        isConnectable={false}
      />
    </div>
  );
}

const NODE_TYPES: NodeTypes = { model: ModelNode };

const COL_X: Record<Tier, number> = {
  source: 0,
  silver: 220,
  gold: 460,
};

interface Props {
  id?: string;
}

export default function DbtLineagePreview({ id }: Props): JSX.Element {
  const [hovered, setHovered] = useState<string | null>(null);

  const nodes: Node<ModelNodeData>[] = useMemo(() => {
    // Lay out per-column, vertically spaced.
    const tiers: Tier[] = ["source", "silver", "gold"];
    const out: Node<ModelNodeData>[] = [];
    tiers.forEach((tier) => {
      const inTier = MODELS.filter((m) => m.tier === tier);
      const total = inTier.length;
      const ySpacing = 60;
      const startY = -((total - 1) * ySpacing) / 2;
      inTier.forEach((m, i) => {
        out.push({
          id: m.id,
          type: "model",
          position: { x: COL_X[tier], y: startY + i * ySpacing + 100 },
          data: {
            label: m.label,
            tier: m.tier,
            id: m.id,
            file: m.file,
            onHover: setHovered,
          },
          draggable: false,
          selectable: true,
          connectable: false,
        });
      });
    });
    return out;
  }, []);

  const edges: Edge[] = useMemo(
    () =>
      EDGES.map(([src, tgt]) => ({
        id: `${src}-${tgt}`,
        source: src,
        target: tgt,
        style: { stroke: "rgba(148,163,184,0.45)", strokeWidth: 1.2 },
      })),
    [],
  );

  const hoveredModel = hovered
    ? MODELS.find((m) => m.id === hovered) ?? null
    : null;

  return (
    <div className="demo-card" id={id}>
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <h3 className="text-sm font-semibold tracking-tight">
            dbt lineage · sources to gold
          </h3>
          <p className="text-xs text-muted">
            Hover or focus a model to see its source file.
          </p>
        </div>
      </div>
      <div
        className="relative rounded-md border border-border bg-bg/40"
        style={{ height: 260 }}
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
          <Background gap={16} size={1} color="rgba(148, 163, 184, 0.08)" />
        </ReactFlow>
        {hoveredModel && (
          <div
            role="tooltip"
            className="absolute top-2 right-2 z-10 rounded-md border border-border bg-bg/95 px-3 py-2 text-xs shadow-lg pointer-events-none"
            style={{ maxWidth: 260 }}
          >
            <p className="font-mono text-[11px] font-semibold">
              {hoveredModel.label}
            </p>
            <p className="font-mono text-[10px] text-muted mt-1">
              {hoveredModel.file}
            </p>
            <p className="text-[11px] text-muted mt-1.5 leading-snug">
              {hoveredModel.description}
            </p>
          </div>
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-2 w-2 rounded"
            style={{ background: TIER_COLORS.source.fg }}
          />
          Sources (Bronze)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-2 w-2 rounded"
            style={{ background: TIER_COLORS.silver.fg }}
          />
          Silver models
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-2 w-2 rounded"
            style={{ background: TIER_COLORS.gold.fg }}
          />
          Gold marts
        </span>
      </div>
    </div>
  );
}
