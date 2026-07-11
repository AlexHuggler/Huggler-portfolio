import { defineCollection, z } from "astro:content";

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
    role: z.string().optional(),
    period: z.string().optional(),
    results: z.array(z.string()).default([]),
    featured: z.boolean().default(true),
  }),
});

export const collections = { projects };
