import { useEffect, useMemo, useRef } from "react";
import {
  evaluateActivationV2,
  type ActivationInput,
  type ActivationResult,
} from "@sergeant/insights";
import { safeReadLS, safeWriteLS } from "@shared/lib/storage/storage";
import { trackEvent, ANALYTICS_EVENTS } from "../observability/analytics";

/**
 * Web-side activation_v2 capture (initiative 0010 Phase 5; audit
 * `docs/audits/2026-05-13-revenue-monetization-roast.md` § P1-2).
 *
 * Glue between the pure-function evaluator (`@sergeant/insights` →
 * `evaluateActivationV2`) and the canonical PostHog event
 * (`ANALYTICS_EVENTS.ACTIVATION_V2_HIT`). The evaluator decides
 * whether the user crossed the activation threshold — Mono connected
 * ≥1 AND ≥5 transactions categorized AND ≥1 budget set, all within
 * 72 h of signup — and this hook fans that out to the analytics sink
 * exactly once per browser profile.
 *
 * Idempotency is held by a localStorage flag
 * (`sergeant.activation_v2_fired`); the payload contract in
 * `packages/shared/src/lib/analyticsEvents.ts` (line 220) names that
 * flag explicitly. Re-mounts, re-renders, and re-evaluations after
 * the same condition flip therefore stay silent. Resetting the flag
 * (e.g. via devtools) re-arms the capture so dev-mode replays still
 * work.
 *
 * The hook is a no-op when `input` is `null` — the wire-up adapter
 * (`useActivationV2Boot`) yields `null` while the snapshot is still
 * being collected, so the evaluator never sees a half-built input.
 */

const FIRED_FLAG_KEY = "sergeant.activation_v2_fired";

export type { ActivationInput, ActivationResult } from "@sergeant/insights";

/**
 * Optional caller-supplied overrides. `variant` is forwarded to the
 * `ACTIVATION_V2_HIT` payload to split the funnel between the two
 * onboarding A/B arms (`goal_first` vs `vibe_picks`); absent on
 * production rollout once a winner is picked. `now` only exists for
 * tests that need to anchor `time_to_activate_hours` against a frozen
 * clock — production callers omit it and the evaluator stamps the
 * current moment.
 */
export interface UseActivationV2Options {
  variant?: "goal_first" | "vibe_picks";
}

function hasAlreadyFired(): boolean {
  return safeReadLS<boolean>(FIRED_FLAG_KEY) === true;
}

function markFired(): void {
  safeWriteLS(FIRED_FLAG_KEY, true);
}

/**
 * Evaluate activation_v2 against the supplied snapshot and fire the
 * `ACTIVATION_V2_HIT` PostHog event the first time the predicate
 * flips to `true`. Returns the raw `ActivationResult` for callers
 * that want to render activation state in UI (debug overlays,
 * onboarding hints) — production wire-up just mounts the hook for
 * its side effect.
 */
export function useActivationV2(
  input: ActivationInput | null,
  options: UseActivationV2Options = {},
): ActivationResult | null {
  const result = useMemo<ActivationResult | null>(() => {
    if (!input) return null;
    return evaluateActivationV2(input);
  }, [input]);

  // Stable ref to options so the effect only re-runs on snapshot
  // changes — variant flips are rare and we want fire-once semantics
  // even when the parent re-renders with a fresh options object.
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    if (!input || !result) return;
    if (!result.activated) return;
    if (hasAlreadyFired()) return;

    markFired();
    const payload: Record<string, unknown> = {
      time_to_activate_hours: result.hoursElapsed,
      mono_connected: true,
      transactions_categorized: input.categorizedTransactions,
      budgets_set: input.budgetsCreated,
    };
    const { variant } = optionsRef.current;
    if (variant) payload.variant = variant;
    trackEvent(ANALYTICS_EVENTS.ACTIVATION_V2_HIT, payload);
  }, [input, result]);

  return result;
}
