/// <reference lib="WebWorker" />
/**
 * SW build version + cache-name registry.
 *
 * Виокремлено з sw.ts (initiative 0001 Phase 2 — module decomposition).
 * Динамічна частина (`__SW_BUILD_ID__`) інжектується через
 * `vite.config.js#define`; локально fallback на `"dev"`, інакше
 * runtime-значення `undefined` ламає шаблонні літерали з версією.
 */

declare const __SW_BUILD_ID__: string;

export const SW_VERSION =
  (typeof __SW_BUILD_ID__ !== "undefined" && __SW_BUILD_ID__) || "dev";

export const CACHE_NAMES = {
  navigations: `navigations-v${SW_VERSION}`,
  api: `api-cache-v${SW_VERSION}`,
} as const;
