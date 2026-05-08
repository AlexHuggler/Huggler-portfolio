import { clsx } from "clsx";

/**
 * StackPills
 *
 * React-side counterpart to the Astro StackPill component. Renders a
 * horizontal row of stack badges with optional tooltip rationale. Used
 * inside React islands where the Astro component is not reachable.
 */

export interface StackItem {
  label: string;
  rationale?: string;
}

interface Props {
  items: StackItem[];
  className?: string;
}

export default function StackPills({ items, className }: Props) {
  return (
    <ul className={clsx("flex flex-wrap gap-1.5", className)}>
      {items.map((item) => (
        <li key={item.label}>
          <span
            className="pill"
            title={item.rationale ?? undefined}
            aria-label={
              item.rationale
                ? `${item.label}: ${item.rationale}`
                : item.label
            }
          >
            {item.label}
          </span>
        </li>
      ))}
    </ul>
  );
}
