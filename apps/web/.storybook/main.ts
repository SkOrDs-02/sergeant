import type { StorybookConfig } from "@storybook/react-vite";

/**
 * Storybook 10 configuration for @sergeant/web.
 *
 * - Framework: @storybook/react-vite (matches the production Vite 8 build).
 * - Stories live next to components as `*.stories.tsx`. The matching glob
 *   intentionally restricts to `apps/web/src` so consumers don't have to
 *   migrate other packages first.
 * - Tailwind v4 styles are loaded in `preview.tsx` via the same CSS entry as
 *   the app (`src/index.css`). Storybook reuses the Vite plugin pipeline, so
 *   the `@tailwindcss/vite` plugin runs automatically.
 *
 * See `docs/diagnostics/2026-05-03-web-deep-dive/02-frontend-quality.md` —
 * roadmap item #16 (Storybook foundation).
 */
const config: StorybookConfig = {
  stories: ["../src/**/*.mdx", "../src/**/*.stories.@(ts|tsx)"],
  addons: ["@storybook/addon-docs"],
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
  typescript: {
    check: false,
  },
  // Storybook reuses `apps/web/vite.config.js`, which registers
  // `vite-plugin-pwa`. The PWA workbox precache рветься на Storybook-
  // manager bundle (`sb-manager/globals-runtime.js` ~3.18 MB,
  // більше за дефолтний 2 MiB workbox limit). У storybook-режимі
  // service-worker не потрібен — викидаємо плагін.
  viteFinal: async (config) => {
    // Storybook reuses `apps/web/vite.config.js`, який реєструє
    // `vite-plugin-pwa`. Plugin може приходити як plain object, як
    // вкладений масив (з `pwa()` фабрики) або як promise — все це треба
    // нормалізувати у плоский список і викинути PWA-плагіни.
    const stripPwa = (input: unknown): unknown[] => {
      if (Array.isArray(input)) {
        return input.flatMap((x) => stripPwa(x));
      }
      if (!input) return [input];
      const name = (input as { name?: string }).name ?? "";
      if (name.startsWith("vite-plugin-pwa")) return [];
      return [input];
    };
    if (config.plugins) {
      config.plugins = stripPwa(config.plugins) as typeof config.plugins;
    }
    return config;
  },
};

export default config;
