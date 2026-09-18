// `@sergeant/design-tokens` is an ESM package; when required from this CJS
// config Node wraps it as `{ __esModule, default }`, so we unwrap here.
const designTokensPreset = require("@sergeant/design-tokens/tailwind-preset");

/**
 * Mobile NativeWind config — extends the shared Sergeant design-tokens preset.
 *
 * Dark-mode wiring:
 *  - The shared preset (`packages/design-tokens/tailwind-preset.js`)
 *    registers CSS-variable-backed semantic colour utilities — `bg`,
 *    `panel`, `panel-hi`, `line`, `fg`, `fg-muted`, `fg-subtle`,
 *    `border`, `border-strong`, plus status-soft tokens.
 *  - Their values come from `apps/mobile/global.css`, which defines the
 *    `:root` (light) and `.dark` (dark) palettes mirroring `apps/web`.
 *  - NativeWind's CSS-interop resolves these variables at compile time,
 *    so utilities like `bg-panel`, `text-fg`, `text-fg-muted` and
 *    `border-line` re-tint with the active scheme without bespoke
 *    `dark:` modifiers per call site.
 *  - `darkMode: "class"` mirrors the web config so both apps toggle the
 *    palette through the same `.dark` selector — see
 *    `apps/web/tailwind.config.ts`. The actual `colorScheme` toggle
 *    wiring through the app root is tracked separately (see
 *    `apps/mobile/src/core/settings/GeneralSection.tsx` header).
 *
 * @type {import('tailwindcss').Config}
 */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  // NativeWind's preset MUST come first so Sergeant design tokens layer on top
  // of its RN-specific defaults.
  presets: [
    require("nativewind/preset"),
    designTokensPreset.default ?? designTokensPreset,
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};
