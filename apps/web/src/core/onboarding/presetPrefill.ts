// Ephemeral session-scoped bridge for forwarding a preset tile's
// `item.data` into the target module's AddSheet.
//
// The FTUX preset sheet navigates with `openHubModuleWithAction(moduleId,
// action)` — the `HUB_OPEN_MODULE_EVENT` payload has no room for
// arbitrary per-item data without changing every consumer of that event.
// Instead we stash the picked preset's data here, and each module's
// existing `pwaAction` effect consumes it on the way into the AddSheet.
//
// `sessionStorage` (not `localStorage`) is intentional: the prefill is a
// one-shot, current-tab-only handoff. A stale prefill must never survive
// a reload or leak across tabs — it would silently steer the next manual
// FAB tap into someone else's category.

const KEY_PREFIX = "hub_preset_prefill_v1:";

export type PresetPrefill = Record<string, unknown>;

export function writePresetPrefill(
  moduleId: string,
  data: PresetPrefill | null | undefined,
): void {
  try {
    if (data && typeof data === "object") {
      sessionStorage.setItem(KEY_PREFIX + moduleId, JSON.stringify(data));
    } else {
      sessionStorage.removeItem(KEY_PREFIX + moduleId);
    }
  } catch {
    /* noop — SSR / quota / disabled */
  }
}

export function consumePresetPrefill(moduleId: string): PresetPrefill | null {
  try {
    const raw = sessionStorage.getItem(KEY_PREFIX + moduleId);
    if (!raw) return null;
    sessionStorage.removeItem(KEY_PREFIX + moduleId);
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as PresetPrefill;
    }
    return null;
  } catch {
    return null;
  }
}
