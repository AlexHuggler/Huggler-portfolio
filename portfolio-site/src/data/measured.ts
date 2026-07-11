/**
 * Typed accessor for measured.json - the single provenance record for every
 * number the site presents as measured. Values come from running each
 * project's make targets in a clean container; see each project README's
 * Results section for the full methodology. Never hand-edit a value here
 * without re-measuring.
 */
import raw from "./measured.json";

export interface MeasuredMetric {
  value: string;
  label: string;
  sublabel: string;
  method: string;
}

export interface MeasuredData {
  measuredAt: string;
  environment: string;
  site: MeasuredMetric[];
  projects: Record<string, { metrics: MeasuredMetric[] }>;
}

export const measured = raw as MeasuredData;

export function projectMetrics(slug: string): MeasuredMetric[] {
  return measured.projects[slug]?.metrics ?? [];
}
