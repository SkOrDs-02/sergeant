/**
 * Pure, DOM-free haptic contract for cross-platform (web + mobile) use.
 *
 * The contract defines the six primitives (`tap`, `success`, `warning`,
 * `error`, `cancel`, `pattern`) that every consumer calls through the
 * top-level helpers exported from this module. The actual physical
 * implementation is registered once at app bootstrap via
 * `setHapticAdapter`:
 *   - `apps/web` registers a `navigator.vibrate`-based adapter with
 *     reduced-motion + feature-detect guards.
 *   - `apps/mobile` registers an `expo-haptics`-based adapter.
 *
 * Before any adapter registers, a built-in no-op adapter is active, so
 * calling any of the helpers from SSR / unit tests / pure domain code is
 * safe.
 */

export interface HapticAdapter {
  tap(): void;
  success(): void;
  warning(): void;
  error(): void;
  cancel(): void;
  pattern(pattern: number | number[]): void;
}

const noopAdapter: HapticAdapter = {
  tap: () => {},
  success: () => {},
  warning: () => {},
  error: () => {},
  cancel: () => {},
  pattern: () => {},
};

let currentAdapter: HapticAdapter = noopAdapter;

/**
 * Registers the active haptic adapter. Call once at app startup (web:
 * `apps/web/src/main.jsx`, mobile: `apps/mobile/app/_layout.tsx`).
 * Later calls replace the previously-registered adapter, which is useful
 * for test harnesses and storybook-like showcases.
 */
export function setHapticAdapter(adapter: HapticAdapter): void {
  currentAdapter = adapter;
}

/**
 * Restores the built-in no-op adapter. Intended for unit tests; production
 * code should not need this.
 */
export function resetHapticAdapter(): void {
  currentAdapter = noopAdapter;
}

/** Light tap — primary CTAs, toggles, tab switches. */
export function hapticTap(): void {
  currentAdapter.tap();
}

/** Successful save / completion. */
export function hapticSuccess(): void {
  currentAdapter.success();
}

/** Warning / destructive confirm. */
export function hapticWarning(): void {
  currentAdapter.warning();
}

/** Error (network / validation / denied). */
export function hapticError(): void {
  currentAdapter.error();
}

/** Cancels any currently running haptic feedback. */
export function hapticCancel(): void {
  currentAdapter.cancel();
}

/**
 * Plays a custom pattern. Accepts a single duration in ms or an array of
 * `[on, off, on, off, …]` durations. Mobile implementations may treat
 * this as a no-op — see `apps/mobile/src/lib/haptic.ts`.
 */
export function hapticPattern(pattern: number | number[]): void {
  currentAdapter.pattern(pattern);
}
