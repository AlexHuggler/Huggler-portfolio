import { defineCollection, z } from "astro:content";

/** Status vocabulary shared with the .status-chip styles. */
export const capabilityStatus = z.enum(["measured", "implemented", "stub", "needs-infra", "planned"]);

const projects = defineCollection({
  type: "content",
  schema: z.object({
    title: z.string(),
    tagline: z.string(),
    order: z.number(),
    stack: z.array(z.string()),
    repoUrl: z.string().url(),
    /** One-sentence business problem, tuned for skim reading on cards. */
    problem: z.string(),
    /** One-sentence technical approach (the pipeline in prose). */
    approach: z.string(),
    /** Short capability labels shown as "what this demonstrates". */
    demonstrates: z.array(z.string()).default([]),
    /** Filename under src/assets/projects/ used as the card preview. */
    screenshot: z.string().optional(),
    /** The one command that reproduces the headline results. */
    runCommand: z.string(),
    /** Repo-relative docs worth reading, in order. */
    docs: z.array(z.object({ label: z.string(), path: z.string() })).default([]),
    /** What exists, honestly: measured / implemented / stub / needs-infra / planned. */
    capabilities: z
      .array(z.object({ name: z.string(), status: capabilityStatus, note: z.string().optional() }))
      .default([]),
  }),
});

export const collections = { projects };
