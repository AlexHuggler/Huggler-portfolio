import { Play, Pause } from "lucide-react";
import { clsx } from "clsx";

/**
 * PlayPauseButton
 *
 * Minimal accessible control for pausing animated demos. Caller owns the
 * `playing` state; this component only renders + emits clicks. Always
 * keyboard reachable and announces state to screen readers.
 */

interface Props {
  playing: boolean;
  onToggle: () => void;
  label?: string;
  className?: string;
}

export default function PlayPauseButton({
  playing,
  onToggle,
  label = "demo animation",
  className,
}: Props) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={playing}
      aria-label={playing ? `Pause ${label}` : `Play ${label}`}
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-muted hover:text-fg hover:border-fg/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent",
        className,
      )}
    >
      {playing ? (
        <Pause className="h-3.5 w-3.5" aria-hidden="true" />
      ) : (
        <Play className="h-3.5 w-3.5" aria-hidden="true" />
      )}
      <span>{playing ? "Pause" : "Play"}</span>
    </button>
  );
}
