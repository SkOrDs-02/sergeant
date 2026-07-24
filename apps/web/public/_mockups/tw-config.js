/* Preview-only Tailwind Play CDN config for mockup HTML files. Not shipped. */
tailwind.config = {
  theme: {
    extend: {
      colors: {
        ink: "#1c1917",
        brand: {
          50: "#ecfdf5",
          100: "#d1fae5",
          200: "#a7f3d0",
          300: "#6ee7b7",
          400: "#34d399",
          500: "#10b981",
          600: "#059669",
          700: "#047857",
          800: "#065f46",
          900: "#064e3b",
        },
        cream: {
          50: "#fefdfb",
          100: "#fdf9f3",
          200: "#f5ead8",
          300: "#ebe4da",
          400: "#d0c8bc",
        },
        paper: {
          100: "#faf7f1",
          200: "#f5ead8",
          300: "#ebe4da",
        },
      },
      fontFamily: {
        sans: ["Manrope", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
        serif: ["Lora", "serif"],
      },
      keyframes: {
        blink: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.25" },
        },
      },
      animation: {
        blink: "blink 1.6s ease-in-out infinite",
      },
    },
  },
};
