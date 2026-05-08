import { defineCollection, z } from "astro:content";

const projects = defineCollection({
  type: "content",
  schema: z.object({
    title: z.string(),
    tagline: z.string(),
    order: z.number(),
    stack: z.array(z.string()),
    repoUrl: z.string().url(),
    role: z.string().optional(),
    period: z.string().optional(),
    results: z.array(z.string()).default([]),
    featured: z.boolean().default(true),
  }),
});

export const collections = { projects };
