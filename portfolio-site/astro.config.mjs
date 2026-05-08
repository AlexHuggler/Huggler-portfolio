// @ts-check
import { defineConfig } from "astro/config";
import tailwind from "@astrojs/tailwind";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import react from "@astrojs/react";

// Two deployment scenarios are supported. Pick ONE and uncomment.
//
// 1) Custom domain (recommended). With public/CNAME pointing at e.g.
//    "alexhuggler.com", set `site` to the canonical https URL and leave
//    `base` undefined.
//
// 2) GitHub project page (e.g. https://alexhuggler.github.io/Huggler-portfolio).
//    Set `site` to the GitHub Pages URL and `base` to "/Huggler-portfolio".
//
// Update the strings below before deploying.
const SITE = process.env.SITE_URL ?? "https://REPLACE_WITH_YOUR_DOMAIN.com";
// const SITE = "https://alexhuggler.github.io";
// const BASE = "/Huggler-portfolio";

export default defineConfig({
  site: SITE,
  // base: BASE,
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
