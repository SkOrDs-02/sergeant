import { lazy, type ComponentType, type LazyExoticComponent } from "react";

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
 * (`m.default` of undefined). The error is harmless
 * (`window.location.reload()` is already in flight), but it crashes
 * Suspense's loader and reports to Sentry every time a deploy lands
 * while users have the app open.
 *
 * Both helpers detect the undefined-module case and return a
 * never-resolving promise, so Suspense keeps showing the existing
 * fallback while navigation completes — no Sentry spam, no flash of
 * a broken screen.
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
      m ? { default: m[key] } : neverResolves<{ default: M[K] }>(),
    ),
  );
}

/** Same idea as {@link lazyImport} but for modules with a `default` export. */
export function lazyDefault<T extends AnyComponent>(
  loader: () => Promise<{ default: T }>,
): LazyExoticComponent<T> {
  return lazy(() =>
    loader().then((m) => (m ? m : neverResolves<{ default: T }>())),
  );
}

// Vite preload helper resolved with `undefined` because `chunkReload.ts`
// preventDefault'd the `vite:preloadError` and triggered
// `window.location.reload()`. Hang Suspense until navigation completes —
// neither rendering a broken tree nor reporting a phantom error to Sentry.
// The promise type is a phantom — at runtime this never settles, so the
// `T` is just there to flow through `.then`'s resolved-value generic.
function neverResolves<T>(): Promise<T> {
  return new Promise<T>(() => {});
}
