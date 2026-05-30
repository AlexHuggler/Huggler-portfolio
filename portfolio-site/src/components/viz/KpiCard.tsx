interface KpiCardProps {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}

/** Compact stat card matching the site's .demo-card styling. */
export default function KpiCard({
  label,
  value,
  sub,
  accent,
}: KpiCardProps): JSX.Element {
  return (
    <div className="demo-card">
      <p className="demo-eyebrow">{label}</p>
      <p
        className="mt-2 font-mono text-2xl font-semibold tracking-tight"
        style={accent ? { color: accent } : undefined}
      >
        {value}
      </p>
      {sub && <p className="mt-1 text-xs text-muted">{sub}</p>}
    </div>
  );
}
