/// <reference types="vite/client" />

/**
 * Vite client env declarations.
 *
 * Standard `vite/client` types declare `ImportMetaEnv` with `string |
 * undefined` for all `VITE_*` keys (open-set). We narrow our
 * project-specific keys here so that callers can rely on actual types
 * (e.g. `string` for keys that `vite.config.js#define` injects
 * unconditionally).
 *
 * Keep in sync with `apps/web/vite.config.js#define` block.
 */
interface ImportMetaEnv {
  /**
   * Build-id (git short SHA / Date.now() fallback) injected at build
   * time via `vite.config.js#define["import.meta.env.VITE_BUILD_ID"]`.
   * Used by:
   *   - `apps/web/src/sw/version.ts` (cache-name suffix).
   *   - `apps/web/src/shared/lib/api/queryClientPersister.ts` (RQ
   *     persist `buster` — invalidates IDB snapshot on new deploy,
   *     Hard Rule #3 protection).
   *
   * In Vitest unit tests (no Vite-pipeline) this is `undefined`;
   * call sites coalesce to `"dev"`. Migrated from ambient
   * `__SW_BUILD_ID__` / `__APP_BUILD_ID__` globals in PR-28
   * (stack-pulse 2026-05 / L1).
   */
  readonly VITE_BUILD_ID?: string;

  /**
   * Build target — `"web"` (Vercel deploy) or `"capacitor"`
   * (`apps/mobile-shell` build). Drives DCE branches in `main.tsx`
   * (skip SW registration in Capacitor) and webpush hooks. Set via
   * `VITE_TARGET=capacitor` env var; injected unconditionally as a
   * literal by `vite.config.js#define`.
   */
  readonly VITE_TARGET?: "web" | "capacitor";
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
