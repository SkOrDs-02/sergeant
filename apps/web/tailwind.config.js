import designTokensPreset from "@sergeant/design-tokens/tailwind-preset";

/** @type {import('tailwindcss').Config} */
export default {
  presets: [designTokensPreset],
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // «Чорнило» theme-aware module accents (spec § 5) — WEB-ONLY
        // override of the preset's fixed-hex `{module}` DEFAULT. The bare
        // `text-finyk` / `bg-finyk` / `border-finyk` accent now resolves to
        // the strong AA tier in light and the luminescent tier-400 in dark,
        // via `--c-{module}-accent` (apps/web/src/styles/theme.css). Shaded
        // (`-300` / `-soft` / `-strong` …) and JS `moduleColors.*.primary`
        // stay fixed. Mobile keeps the preset's fixed hex — apps/mobile is
        // out of scope for the «Чорнило» spec (its accent pass is separate).
        finyk: { DEFAULT: "rgb(var(--c-finyk-accent) / <alpha-value>)" },
        fizruk: { DEFAULT: "rgb(var(--c-fizruk-accent) / <alpha-value>)" },
        routine: { DEFAULT: "rgb(var(--c-routine-accent) / <alpha-value>)" },
        nutrition: { DEFAULT: "rgb(var(--c-nutrition-accent) / <alpha-value>)" },
      },
    },
  },
  plugins: [],
};
