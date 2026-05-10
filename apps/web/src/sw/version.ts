/// <reference lib="WebWorker" />
/**
 * SW build version + cache-name registry.
 *
 * Виокремлено з sw.ts (initiative 0001 Phase 2 — module decomposition).
 * Build-id інжектиться у клієнтський бандл через
 * `vite.config.js#define["import.meta.env.VITE_BUILD_ID"]` (стандартний
 * Vite pattern; раніше це був ambient global `__SW_BUILD_ID__`,
 * перейменований на `VITE_BUILD_ID` у PR-28 / stack-pulse 2026-05 L1).
 *
 * Локально fallback на `"dev"` потрібен для двох сценаріїв:
 * 1. Vitest unit-tests без проходу через Vite-pipeline — там
 *    `import.meta.env.VITE_BUILD_ID` не підставляється і лишається
 *    `undefined`.
 * 2. Service Worker-ів, що завантажились до того, як `define` пройшов
 *    через `loadEnv` (теоретично — SW build-time завжди йде через
 *    Vite, але fallback дешевий і безпечніший за runtime-undefined у
 *    шаблонних літералах кеш-імен).
 */

export const SW_VERSION = import.meta.env.VITE_BUILD_ID || "dev";

export const CACHE_NAMES = {
  navigations: `navigations-v${SW_VERSION}`,
  api: `api-cache-v${SW_VERSION}`,
} as const;
