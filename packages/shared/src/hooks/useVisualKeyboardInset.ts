/**
 * Pure, DOM-free contract for the visual-keyboard inset hook used by
 * bottom sheets to lift themselves above the on-screen keyboard.
 *
 * Mirrors the R7 haptic (`../lib/haptic.ts`) and R8 file-download
 * (`../lib/fileDownload.ts`) adapter patterns: consumers call
 * `useVisualKeyboardInset(active)` from any React render and receive
 * the current inset in CSS pixels. The platform adapter is registered
 * once at app bootstrap via `setVisualKeyboardInsetAdapter`:
 *   - `apps/web` registers a `window.visualViewport`-based hook that
 *     listens to `resize` + `scroll` and returns the gap between the
 *     layout viewport height and the visual viewport bottom.
 *   - `apps/mobile` registers a `Keyboard.addListener`-based hook that
 *     tracks `keyboardDidShow` / `keyboardDidHide` and returns the
 *     reported keyboard height.
 *
 * Until an adapter registers, a built-in no-op that always returns 0
 * is active — this keeps SSR, unit tests, and pure domain code safe.
 *
 * `active` lets the caller disable the inset calculation (e.g. when
 * the sheet is closed) so platform adapters can skip wiring up native
 * listeners they do not need.
 */

export type VisualKeyboardInsetAdapter = (active: boolean) => number;

const noopAdapter: VisualKeyboardInsetAdapter = () => 0;

let currentAdapter: VisualKeyboardInsetAdapter = noopAdapter;

/**
 * Registers the active visual-keyboard-inset adapter. Call once at app
 * startup (web: `apps/web/src/main.jsx`, mobile:
 * `apps/mobile/app/_layout.tsx`). Later calls replace the
 * previously-registered adapter, which is useful for test harnesses.
 */
export function setVisualKeyboardInsetAdapter(
  adapter: VisualKeyboardInsetAdapter,
): void {
  currentAdapter = adapter;
}

/**
 * Restores the built-in no-op adapter. Intended for unit tests;
 * production code should not need this.
 */
export function resetVisualKeyboardInsetAdapter(): void {
  currentAdapter = noopAdapter;
}

/**
 * Returns the current visual-keyboard inset in CSS pixels (web) or
 * device-independent pixels (mobile). When `active` is `false` the
 * adapter is free to short-circuit to 0 and skip wiring up listeners.
 *
 * Must be called from a React function component's render phase — the
 * registered platform adapter is itself a hook.
 */
export function useVisualKeyboardInset(active: boolean): number {
  return currentAdapter(active);
}
