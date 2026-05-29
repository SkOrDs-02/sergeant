/**
 * Ephemeral in-memory bridge for forwarding a preset tile's `item.data`
 * into the target module's add-sheet on mobile.
 *
 * Mobile port of `apps/web/src/core/onboarding/presetPrefill.ts`. The
 * web version stashes the picked preset's data in `sessionStorage`
 * (one-shot, current-tab-only) because its modules consume the prefill
 * through their `pwaAction` effect on the way into the AddSheet. React
 * Native has no `sessionStorage`, so we back the same one-shot semantics
 * with a module-level `Map`:
 *
 * - `writePresetPrefill(moduleId, data)` stages the data (or clears the
 *   slot when `data` is null/undefined — the explicit «no prefill» path
 *   the fallback CTA uses to wipe any stale tile data).
 * - `consumePresetPrefill(moduleId)` reads-and-clears, so a prefill is
 *   delivered exactly once and never leaks into a later manual add.
 *
 * Deliberately NOT persisted (no MMKV): a stale prefill must never
 * survive an app restart and silently steer the next manual add into
 * someone else's category. Mirrors the web `sessionStorage` lifetime
 * (process-scoped, lost on kill).
 */

export type PresetPrefill = Record<string, unknown>;

const store = new Map<string, PresetPrefill>();

export function writePresetPrefill(
  moduleId: string,
  data: PresetPrefill | null | undefined,
): void {
  if (data && typeof data === "object" && !Array.isArray(data)) {
    store.set(moduleId, data);
  } else {
    store.delete(moduleId);
  }
}

export function consumePresetPrefill(moduleId: string): PresetPrefill | null {
  const data = store.get(moduleId);
  if (!data) return null;
  store.delete(moduleId);
  return data;
}
