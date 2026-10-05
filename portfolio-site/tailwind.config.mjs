import typography from "@tailwindcss/typography";

/**
 * Design tokens live in src/styles/global.css as CSS custom properties
 * (single source of truth; light on :root, dark on :root.dark). Tailwind
 * consumes them via rgb(var(--x) / <alpha-value>) so every color utility
 * flips with the theme automatically — including prose, which is mapped to
 * the same tokens below instead of relying on dark:prose-invert.
 */
const token = (name) => `rgb(var(${name}) / <alpha-value>)`;
const solid = (name) => `rgb(var(${name}))`;

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{astro,html,js,jsx,md,mdx,ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        bg: token("--color-bg"),
        surface: token("--color-surface"),
        "surface-2": token("--color-surface-2"),
        border: token("--color-border"),
        "border-strong": token("--color-border-strong"),
        fg: token("--color-fg"),
        muted: token("--color-muted"),
        accent: token("--color-accent"),
        "accent-fg": token("--color-accent-fg"),
        "accent-2": token("--color-accent-2"),
        "accent-2-fg": token("--color-accent-2-fg"),
        success: token("--color-success"),
        warn: token("--color-warn"),
        danger: token("--color-danger"),
        bronze: token("--tier-bronze"),
        silver: token("--tier-silver"),
        gold: token("--tier-gold"),
      },
      fontFamily: {
        sans: ["Inter Variable", "Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        display: [
          "Space Grotesk Variable",
          "Space Grotesk",
          "Inter Variable",
          "ui-sans-serif",
          "sans-serif",
        ],
        mono: [
          "JetBrains Mono Variable",
          "JetBrains Mono",
          "ui-monospace",
          "Menlo",
          "monospace",
        ],
      },
      fontSize: {
        "step--1": "var(--step--1)",
        "step-0": "var(--step-0)",
        "step-1": "var(--step-1)",
        "step-2": "var(--step-2)",
        "step-3": "var(--step-3)",
        "step-4": "var(--step-4)",
        "step-5": "var(--step-5)",
      },
      boxShadow: {
        1: "var(--shadow-1), var(--highlight)",
        2: "var(--shadow-2), var(--highlight)",
        3: "var(--shadow-3), var(--highlight)",
      },
      transitionTimingFunction: {
        "out-expo": "var(--ease-out)",
      },
      maxWidth: {
        prose: "768px",
        page: "1200px",
        wide: "1320px",
      },
      typography: {
        DEFAULT: {
          css: {
            maxWidth: "72ch",
            "--tw-prose-body": solid("--color-muted"),
            "--tw-prose-headings": solid("--color-fg"),
            "--tw-prose-lead": solid("--color-muted"),
            "--tw-prose-links": solid("--color-accent-fg"),
            "--tw-prose-bold": solid("--color-fg"),
            "--tw-prose-counters": solid("--color-muted"),
            "--tw-prose-bullets": solid("--color-border-strong"),
            "--tw-prose-hr": solid("--color-border"),
            "--tw-prose-quotes": solid("--color-fg"),
            "--tw-prose-quote-borders": solid("--color-border-strong"),
            "--tw-prose-captions": solid("--color-muted"),
            "--tw-prose-code": solid("--color-fg"),
            "--tw-prose-pre-code": solid("--color-fg"),
            "--tw-prose-pre-bg": solid("--color-surface-2"),
            "--tw-prose-th-borders": solid("--color-border-strong"),
            "--tw-prose-td-borders": solid("--color-border"),
            "code::before": { content: "none" },
            "code::after": { content: "none" },
            code: {
              fontWeight: "500",
              backgroundColor: solid("--color-surface-2"),
              border: `1px solid ${solid("--color-border")}`,
              borderRadius: "0.3rem",
              padding: "0.1rem 0.3rem",
            },
          },
        },
      },
    },
  },
  plugins: [typography],
};
