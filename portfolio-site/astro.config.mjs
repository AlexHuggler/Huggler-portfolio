// @ts-check
import { defineConfig } from "astro/config";
import tailwind from "@astrojs/tailwind";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import react from "@astrojs/react";

// Custom domain deployment. SITE_URL env var overrides at build time.
// CNAME at public/CNAME binds GitHub Pages to www.alexhuggler.com.

const SITE = process.env.SITE_URL ?? "https://www.alexhuggler.com";

export default defineConfig({
  site: SITE,
  trailingSlash: "ignore",
  integrations: [
    react(),
    tailwind({ applyBaseStyles: false }),
    mdx(),
    sitemap(),
  ],
  vite: {
    ssr: {
      noExternal: ["react-diff-viewer-continued"],
    },
  },
});
