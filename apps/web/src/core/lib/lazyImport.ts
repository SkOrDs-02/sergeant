import { lazy, type ComponentType, type LazyExoticComponent } from "react";
import { reloadOnceForChunkError } from "./chunkReload";

/**
 * `React.lazy()` wrappers that survive Vite preload-error suppression.
 *
 * `chunkReload.ts` listens for `vite:preloadError` (typical scenario:
 * Vercel just deployed a new bundle, the old tab tries to load a chunk
 * with a stale hash, Vercel responds with the SPA-fallback `index.html`,
 * MIME mismatch → preload-error) and calls `event.preventDefault()`
 * while scheduling `window.location.reload()`. The preventDefault tells
 * Vite's preload helper (`__vitePreload`) to resolve the dynamic
 * `import()` with `undefined` instead of throwing — so a naive
 *
 * ```ts
 * lazy(() => import("./X").then((m) => ({ default: m.X })))
 * ```
 *
 * blows up with `TypeError: undefined is not an object (evaluating
 * 'm.X')` (real Sentry noise from iOS Safari sessions hitting stale
 * Vercel chunk URLs — `e.AuthPage`, etc.). A bare
 * `lazy(() => import("./X"))` for a default export hits the same shape
 * (`m.default` of undefined).
 *
 * ## Recovery contract (two-layer)
 *
 * When the helper detects the undefined-module case (Vite preload was
 * preventDefault'd OR a Service Worker resolved the preload with empty
 * content), it does TWO things:
 *
 * 1. **Trigger `reloadOnceForChunkError()`** — same recovery path that
 *    `vite:preloadError` and `unhandledrejection` listeners use. If
 *    chunkReload's `COOLDOWN_MS` / `MAX_RELOADS` guards allow it, the
 *    page reloads onto the fresh bundle.
 *
 * 2. **Throw a `ChunkLoadError`** — React's `lazy()` surfaces the
 *    rejection to the nearest `<ErrorBoundary>`, which renders the
 *    section-fallback (with retry button) instead of a frozen Suspense
 *    skeleton. The error name matches `isChunkLoadError()` so the
 *    existing global `unhandledrejection` / `error` listeners also
 *    catch it as a chunk-load failure for telemetry purposes.
 *
 * **Why this replaces the previous `neverResolves()` strategy** — that
 * helper kept Suspense in fallback indefinitely on the assumption that
 * `chunkReload.ts` would always reload the page "in flight". Two real
 * paths violated that assumption: (a) `reloadOnceForChunkError()`
 * returns `false` after `MAX_RELOADS=3` reloads in a 5-min window or
 * during the 10-second cooldown → no reload happens, helper hangs
 * forever; (b) a Service Worker can resolve the `__vitePreload` fetch
 * with `undefined` WITHOUT a `vite:preloadError` event being fired at
 * all, so `chunkReload` never gets the chance to schedule a reload.
 * In both cases the user was permanently stuck on a frozen skeleton
 * (reported 2026-05-16: dashboard nav targets, module pages, sign-in,
 * reports tab all permanently suspended on a SW-warm session). Throwing
 * a `ChunkLoadError` keeps the original Sentry-suppression intent
 * (single named error class, easy to filter) while guaranteeing the
 * user always reaches either the new bundle or a visible error UI.
 */

// `ComponentType<any>` (rather than `<unknown>`) keeps callers' specific
// prop shapes assignable: TypeScript treats component props as
// contravariant, so `ComponentType<MyProps>` is NOT assignable to
// `ComponentType<unknown>`. We don't model props at the helper boundary
// — the LazyExoticComponent re-exports the original component type.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyComponent = ComponentType<any>;

export function lazyImport<
  M extends Record<K, AnyComponent>,
  K extends keyof M & string,
>(loader: () => Promise<M>, key: K): LazyExoticComponent<M[K]> {
  return lazy(() =>
    loader().then((m) =>
      m ? { default: m[key] } : recoverFromStaleChunk<{ default: M[K] }>(),
    ),
  );
}

/** Same idea as {@link lazyImport} but for modules with a `default` export. */
export function lazyDefault<T extends AnyComponent>(
  loader: () => Promise<{ default: T }>,
): LazyExoticComponent<T> {
  return lazy(() =>
    loader().then((m) => (m ? m : recoverFromStaleChunk<{ default: T }>())),
  );
}

/**
 * Called when `__vitePreload` resolved the dynamic import with
 * `undefined` (preload-error preventDefault'd, or a Service Worker
 * answered the preload fetch with an empty/HTML body that Vite couldn't
 * evaluate as a module). Triggers the canonical chunk-reload escape
 * hatch and then throws a `ChunkLoadError` so callers can't accidentally
 * use a "successful" undefined module.
 *
 * Returning `never` (via `throw`) lets the call-site type-check
 * `m ? {default: m[key]} : recoverFromStaleChunk<...>()` without
 * forcing an explicit `as never` cast at every helper.
 */
function recoverFromStaleChunk<T>(): T {
  // Best-effort reload. Returns `false` if the cooldown / counter
  // guards in chunkReload block it; in that case the throw below still
  // takes the user to a visible ErrorBoundary fallback (with retry)
  // instead of a frozen Suspense skeleton.
  reloadOnceForChunkError();
  // Match `isChunkLoadError()` patterns so the existing global
  // `unhandledrejection` and `error` listeners count this toward the
  // chunk-failure budget and surface it in Sentry under the same key
  // as native `Failed to fetch dynamically imported module` errors.
  const err = new Error(
    "Vite preload resolved with undefined module — likely a stale chunk after deploy or a Service Worker intercept",
  );
  err.name = "ChunkLoadError";
  throw err;
}
