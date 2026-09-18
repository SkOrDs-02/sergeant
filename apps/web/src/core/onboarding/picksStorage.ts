import {
  safeReadStringLS,
  safeWriteLS,
  safeRemoveLS,
} from "@shared/lib/storage/storage";
import { ALL_MODULES } from "./vibePicks";
import type { OnboardingDefaultPicksVariant } from "@sergeant/shared";

// ---------------------------------------------------------------------------
// Persisted state — picks-only (v2)
// ---------------------------------------------------------------------------
//
// The earlier wizard persisted `{ step, picks, goals }` (4-step flow). The
// one-screen rebuild only needs the user's module picks: goal-questions
// moved to per-module first-run sheets and the permissions interstitial
// became a just-in-time prompt inside the modules that need them.
//
// We bump the storage key to `v2` so a stale `v1` blob from a partially
// completed legacy onboarding never resurrects the old multi-step state.
export const ONBOARDING_PICKS_STATE_KEY = "sergeant.onboarding.wizardState.v2";

interface PersistedPicksState {
  picks: string[];
}

/**
 * Read the user's persisted module picks from localStorage. The
 * empty-state default depends on the {@link defaultPicksVariant}:
 *
 *  - `"none"` (S6.1 opt-in arm): missing / malformed / empty payload
 *    returns `[]`. The wizard then disables its primary CTA until
 *    the user picks ≥1 module — no silent ALL_MODULES fallback.
 *
 *  - `"all"` (legacy control arm): missing / malformed / empty payload
 *    returns `[...ALL_MODULES]`. Pre-S6.1 behaviour.
 *
 * Valid persisted picks are returned filtered against the known
 * module list regardless of variant; only the empty-state branch
 * differs.
 */
export function loadPersistedPicks(
  defaultPicksVariant: OnboardingDefaultPicksVariant,
): string[] {
  const emptyDefault = (): string[] =>
    defaultPicksVariant === "none" ? [] : [...ALL_MODULES];
  const raw = safeReadStringLS(ONBOARDING_PICKS_STATE_KEY);
  if (!raw) return emptyDefault();
  try {
    const data = JSON.parse(raw) as PersistedPicksState;
    if (
      !data ||
      typeof data !== "object" ||
      !Array.isArray(data.picks) ||
      data.picks.length === 0
    ) {
      return emptyDefault();
    }
    const allowed: ReadonlySet<string> = new Set(ALL_MODULES);
    return data.picks.filter(
      (p): p is string => typeof p === "string" && allowed.has(p),
    );
  } catch {
    return emptyDefault();
  }
}

export function persistPicks(picks: string[]): void {
  const payload: PersistedPicksState = { picks };
  safeWriteLS(ONBOARDING_PICKS_STATE_KEY, payload);
}

export function clearPersistedPicks(): void {
  safeRemoveLS(ONBOARDING_PICKS_STATE_KEY);
}
