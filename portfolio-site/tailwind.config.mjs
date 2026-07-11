import typography from "@tailwindcss/typography";

/**
 * Design tokens live in src/styles/global.css as CSS custom properties
 * (single source of truth; light on :root, dark on :root.dark). Tailwind
 * consumes them via rgb(var(--x) / <alpha-value>) so every color utility
 * flips with the theme automatically.
 */
const token = (name) => `rgb(var(${name}) / <alpha-value>)`;

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
        success: token("--color-success"),
        warn: token("--color-warn"),
        danger: token("--color-danger"),
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
      maxWidth: {
        prose: "768px",
        page: "1200px",
      },
      typography: {
        DEFAULT: { css: { maxWidth: "768px" } },
      },
    },
  },
  plugins: [typography],
};
