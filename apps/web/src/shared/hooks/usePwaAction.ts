import { useEffect, useLayoutEffect, useRef } from "react";

/**
 * PWA-action dispatcher.
 *
 * The host app (src/core/App.tsx) reads `?module=<id>&action=<name>` from
 * the initial URL and passes `pwaAction` down to the active module. Each
 * module historically implemented its own `useEffect` that switched on
 * `pwaAction`, invoked a handler, and called `onPwaActionConsumed`. This
 * hook captures that pattern.
 *
 * Usage:
 *
 *     usePwaAction(pwaAction, onPwaActionConsumed, {
 *       start_workout: () => navigate("workouts"),
 *       add_habit: () => setQuickAddOpen(true),
 *     });
 *
 * Handlers may return a cleanup function (e.g. to cancel a deferred
 * file-picker click) — it is passed through as the effect cleanup.
 */

export type PwaActionHandler = () => void | (() => void);

export function usePwaAction(
  action: string | null | undefined,
  onConsumed: (() => void) | undefined,
  handlers: Record<string, PwaActionHandler>,
): void {
  // "Always-current" ref pattern: layout effect runs synchronously after
  // commit and before any effects, so the effect below always reads the
  // latest handlers map even when callers pass a new inline object each
  // render. No dep array — intentionally runs on every render.
  const handlersRef = useRef(handlers);
  useLayoutEffect(() => {
    handlersRef.current = handlers;
  });

  useEffect(() => {
    if (!action) return;
    const handler = handlersRef.current[action];
    if (!handler) return;
    const cleanup = handler();
    onConsumed?.();
    return typeof cleanup === "function" ? cleanup : undefined;
  }, [action, onConsumed]);
}
