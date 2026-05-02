/**
 * Soft-adaptive bento ordering for the Hub dashboard.
 *
 * Goal: lift ONE module to the top of the bento grid based on the current
 * context (active recommendation signals × time of day) without disturbing
 * the rest of the manually-saved order. The rest of the cards stay in the
 * order the user picked via DnD or `DashboardSection`.
 *
 * Off by default for `editMode` (so DnD-reorder is never fought) and
 * controlled by the `adaptiveBento` Hub pref so users can opt out.
 *
 * Pure functions only — UI integration lives in `HubDashboard.tsx`.
 */

import type { ModuleId } from "./moduleConfigs";

/**
 * Subset of `Recommendations.RecSeverity` we actually use for ranking.
 * The full alias is `StatusColor = "success" | "warning" | "danger" | "info"`,
 * but only the warning / danger tones contribute negative weight here —
 * `success` / `info` are informational and shouldn't lift cards.
 */
type RecSeverity = "warning" | "danger";

/**
 * Min total score required for a module to be "lifted". Picked so a single
 * peak time-of-day match (50) is enough on its own, but a weak time match
 * (25) is not unless paired with a signal.
 */
export const ADAPTIVE_LIFT_THRESHOLD = 40;

const SIGNAL_BASE = 60;
const SIGNAL_DANGER_BONUS = 30;
const SIGNAL_WARNING_BONUS = 15;

interface TimeMatch {
  score: number;
  reason: string;
}

/**
 * Per-module time-of-day relevance. Returns the *best* matching window for
 * the given hour, or `null` when no window is active.
 *
 * Windows are intentionally narrow: the goal is "right tool at the right
 * moment", not "modules I might like in the morning".
 */
function timeOfDayMatch(module: ModuleId, hour: number): TimeMatch | null {
  switch (module) {
    case "nutrition": {
      // Meal windows: breakfast / lunch / dinner.
      if (hour >= 7 && hour <= 9) {
        return { score: 50, reason: "час сніданку" };
      }
      if (hour >= 12 && hour <= 13) {
        return { score: 50, reason: "час обіду" };
      }
      if (hour >= 18 && hour <= 20) {
        return { score: 45, reason: "час вечері" };
      }
      return null;
    }
    case "fizruk": {
      // Most users train late afternoon → evening.
      if (hour >= 17 && hour <= 20) {
        return { score: 40, reason: "час тренування" };
      }
      if (hour >= 6 && hour <= 8) {
        return { score: 25, reason: "ранкова активність" };
      }
      return null;
    }
    case "routine": {
      // Morning planning + evening close-out.
      if (hour >= 6 && hour <= 9) {
        return { score: 30, reason: "ранкові звички" };
      }
      if (hour >= 19 && hour <= 23) {
        return { score: 45, reason: "час закрити день" };
      }
      return null;
    }
    case "finyk": {
      // Mono webhooks land overnight; review next morning. End-of-day
      // budget check covers the late-evening "did I overspend?" itch.
      if (hour >= 8 && hour <= 10) {
        return { score: 25, reason: "ранковий огляд транзакцій" };
      }
      if (hour >= 20 && hour <= 22) {
        return { score: 25, reason: "підбити день" };
      }
      return null;
    }
    default:
      return null;
  }
}

/**
 * The strongest severity wins when a module has multiple recommendations.
 * `danger` > `warning` > anything else (treated as "no extra weight").
 */
export function pickStrongestSeverity(
  severities: ReadonlyArray<RecSeverity | undefined>,
): RecSeverity | undefined {
  let best: RecSeverity | undefined;
  for (const s of severities) {
    if (s === "danger") return "danger";
    if (s === "warning") best = "warning";
  }
  return best;
}

interface SignalMatch {
  score: number;
  reason: string;
}

function signalScore(severity: RecSeverity | undefined): SignalMatch {
  let score = SIGNAL_BASE;
  let reason = "активний сигнал";
  if (severity === "danger") {
    score += SIGNAL_DANGER_BONUS;
    reason = "терміновий сигнал";
  } else if (severity === "warning") {
    score += SIGNAL_WARNING_BONUS;
    reason = "увага: сигнал";
  }
  return { score, reason };
}

export interface AdaptiveLiftInput {
  /** Current visible (already inactive-filtered) order. */
  order: ReadonlyArray<ModuleId>;
  /** Set of module ids that have at least one visible recommendation. */
  modulesWithSignal: ReadonlySet<string>;
  /** Strongest rec severity per module. Missing entry = no severity. */
  severityByModule?: Partial<Record<ModuleId, RecSeverity | undefined>>;
  /** Set of modules the user marked as active during onboarding. */
  activeModules: ReadonlySet<string>;
  /** Reference time. Tests pass a fixed Date; runtime uses `new Date()`. */
  now: Date;
}

export interface AdaptiveLift {
  /** Module to lift to position 0; `null` when no module qualifies. */
  liftedId: ModuleId | null;
  /** Short UA label explaining why this card was lifted (for the badge). */
  reason: string | null;
  /** Total score the lifted module reached. Useful for tests / telemetry. */
  score: number;
}

/**
 * Pick at most one module to surface at the top of the bento. Returns
 * `{ liftedId: null }` when nothing crosses the threshold or the highest
 * scorer is already first.
 *
 * Selection rules:
 *  - Inactive modules never lift.
 *  - The already-first card never lifts (no-op when it's the winner).
 *  - Ties are broken by the module's current position (closer to top wins).
 */
export function pickAdaptiveLift({
  order,
  modulesWithSignal,
  severityByModule = {},
  activeModules,
  now,
}: AdaptiveLiftInput): AdaptiveLift {
  if (order.length === 0) {
    return { liftedId: null, reason: null, score: 0 };
  }

  const hour = now.getHours();
  let best: {
    id: ModuleId;
    score: number;
    reason: string;
    index: number;
  } | null = null;

  for (let i = 0; i < order.length; i++) {
    const id = order[i];
    if (!activeModules.has(id)) continue;

    let score = 0;
    let reason = "";

    if (modulesWithSignal.has(id)) {
      const s = signalScore(severityByModule[id]);
      score += s.score;
      reason = s.reason;
    }

    const timeMatch = timeOfDayMatch(id, hour);
    if (timeMatch) {
      score += timeMatch.score;
      // Prefer the time-of-day reason when it's the dominant component —
      // it's more actionable ("час обіду") than "активний сигнал".
      if (!reason || timeMatch.score >= SIGNAL_BASE) {
        reason = timeMatch.reason;
      }
    }

    if (score < ADAPTIVE_LIFT_THRESHOLD) continue;

    if (
      !best ||
      score > best.score ||
      (score === best.score && i < best.index)
    ) {
      best = { id, score, reason, index: i };
    }
  }

  if (!best) return { liftedId: null, reason: null, score: 0 };
  // Already in position 0 → don't pretend we lifted anything.
  if (best.index === 0) {
    return { liftedId: null, reason: null, score: best.score };
  }

  return { liftedId: best.id, reason: best.reason, score: best.score };
}

/**
 * Move `liftedId` to position 0 in `order`, preserving the relative order
 * of the remaining ids. No-op when `liftedId` is `null` or already first.
 */
export function applyAdaptiveLift<T extends string>(
  order: ReadonlyArray<T>,
  liftedId: T | null,
): T[] {
  if (!liftedId) return [...order];
  const idx = order.indexOf(liftedId);
  if (idx <= 0) return [...order];
  const next = [...order];
  next.splice(idx, 1);
  next.unshift(liftedId);
  return next;
}
