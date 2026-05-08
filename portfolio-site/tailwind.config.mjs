/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{astro,html,js,jsx,md,mdx,ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        bg: "#0a0a0a",
        fg: "#ededed",
        muted: "#a1a1aa",
        accent: "#2563eb",
        border: "#1f1f23",
        "bg-light": "#fafafa",
        "fg-light": "#0a0a0a",
        "muted-light": "#52525b",
        "border-light": "#e4e4e7",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "Menlo", "monospace"],
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
  plugins: [],
};
