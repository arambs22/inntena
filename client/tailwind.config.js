/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "var(--color-bg)",
        surface: "var(--color-surface)",
        text: "var(--color-text)",
        "text-muted": "var(--color-text-muted)",
        primary: {
          DEFAULT: "var(--color-primary)",
          solid: "var(--color-primary-solid)",
          "solid-hover": "var(--color-primary-solid-hover)",
          tint: "var(--color-primary-tint)",
          line: "var(--color-primary-line)",
        },
        "on-primary": "var(--color-on-primary)",
        scene: "var(--color-scene)",
        "scene-star": "var(--color-scene-star)",
        border: "var(--color-border)",
        rise: "var(--color-rise)",
      },
      fontFamily: {
        display: ['"Zilla Slab"', "serif"],
        sans: ["Karla", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ['"IBM Plex Mono"', "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};
