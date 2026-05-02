import type { ToastApi } from "@shared/hooks/useToast";
import { hapticTap } from "./haptic";
import { safeReadLS, safeRemoveLS, safeWriteLS } from "./storage";

/**
 * Cross-module nudges — small, dismissible toast prompts that suggest a
 * follow-up action in another module after the user does something in
 * the current module. See `docs/design/CROSS-MODULE-PROMPTS.md` for the
 * full pattern + decision table.
 *
 * Examples:
 *  - User saves a "🍔 Кафе та ресторани" expense in Finyk
 *    → suggest "Додай прийом їжі?" toast linking to Nutrition.
 *  - User finishes a workout in Fizruk
 *    → suggest "Додати білок після тренування?" linking to Nutrition.
 *
 * Hard rules:
 *  - **Opt-out is one tap.** Same toast that surfaces the prompt also
 *    has the dismiss / "далі сам" path.
 *  - **Auto-suppress after fatigue.** If the user dismisses the same
 *    `id` ≥ `MAX_DISMISSALS` times within `FATIGUE_WINDOW_MS`, stop
 *    showing it for that window. We don't want Sergeant to nag.
 *  - **Snooze on accept.** When the user accepts, suppress the same
 *    prompt for `ACCEPT_SNOOZE_MS` so the next save doesn't re-pop the
 *    toast they're literally responding to.
 *  - **Never block flow.** This is a toast (3.5–5 s), never a modal,
 *    never a sheet. The original action has already succeeded; the
 *    prompt is a *suggestion*.
 */

/** localStorage key prefix; one record per prompt id. */
const STORAGE_PREFIX = "sergeant:cross-prompt:";
/** Dismiss this many times within the window → suppress. */
export const MAX_DISMISSALS = 3;
/** Window (ms) over which dismissals count toward fatigue. */
export const FATIGUE_WINDOW_MS = 14 * 24 * 60 * 60 * 1000; // 14 days
/** After acceptance, don't re-show this prompt for this long. */
export const ACCEPT_SNOOZE_MS = 12 * 60 * 60 * 1000; // 12 hours
/** Default toast duration for cross-module prompts. */
export const DEFAULT_PROMPT_DURATION_MS = 6000;

/**
 * Stable identifier for a prompt class. Add new ids here so the type
 * system catches typos at every call-site.
 */
export type CrossModulePromptId =
  | "finyk-restaurant-to-meal"
  | "finyk-food-to-meal"
  | "fizruk-finish-to-meal";

interface PromptRecord {
  /** Timestamps (ms) of the last few dismiss events, oldest → newest. */
  dismissedAt: number[];
  /** Timestamp (ms) of the last acceptance, or 0 if none. */
  lastAcceptedAt: number;
}

const EMPTY_RECORD: PromptRecord = { dismissedAt: [], lastAcceptedAt: 0 };

function readRecord(id: CrossModulePromptId): PromptRecord {
  const parsed = safeReadLS<Partial<PromptRecord>>(STORAGE_PREFIX + id, null);
  if (!parsed || typeof parsed !== "object") return { ...EMPTY_RECORD };
  const dismissedAt = Array.isArray(parsed.dismissedAt)
    ? parsed.dismissedAt.filter((n): n is number => typeof n === "number")
    : [];
  const lastAcceptedAt =
    typeof parsed.lastAcceptedAt === "number" ? parsed.lastAcceptedAt : 0;
  return { dismissedAt, lastAcceptedAt };
}

function writeRecord(id: CrossModulePromptId, record: PromptRecord): void {
  safeWriteLS(STORAGE_PREFIX + id, record);
}

/**
 * Returns true when this prompt should NOT be shown right now (either
 * fatigue-suppressed or recently accepted). Pure read — no mutation.
 */
export function isCrossModulePromptSuppressed(
  id: CrossModulePromptId,
  now: number = Date.now(),
): boolean {
  const rec = readRecord(id);
  if (rec.lastAcceptedAt && now - rec.lastAcceptedAt < ACCEPT_SNOOZE_MS) {
    return true;
  }
  const recentDismissals = rec.dismissedAt.filter(
    (t) => now - t < FATIGUE_WINDOW_MS,
  );
  return recentDismissals.length >= MAX_DISMISSALS;
}

/**
 * Record an acceptance. Snoozes the prompt for `ACCEPT_SNOOZE_MS`.
 * Resets the dismissal counter so the user starts "fresh" after they
 * engaged with it.
 */
export function recordCrossModulePromptAccepted(
  id: CrossModulePromptId,
  now: number = Date.now(),
): void {
  writeRecord(id, { dismissedAt: [], lastAcceptedAt: now });
}

/**
 * Record a dismissal. Trims the history to entries within the fatigue
 * window so suppression is rolling (not lifetime).
 */
export function recordCrossModulePromptDismissed(
  id: CrossModulePromptId,
  now: number = Date.now(),
): void {
  const rec = readRecord(id);
  const recent = rec.dismissedAt.filter((t) => now - t < FATIGUE_WINDOW_MS);
  recent.push(now);
  writeRecord(id, {
    dismissedAt: recent.slice(-MAX_DISMISSALS),
    lastAcceptedAt: rec.lastAcceptedAt,
  });
}

/** Test-only: clear a single prompt's record. */
export function resetCrossModulePromptForTesting(
  id: CrossModulePromptId,
): void {
  safeRemoveLS(STORAGE_PREFIX + id);
}

export interface CrossModulePromptOptions {
  /** Stable id used for fatigue tracking. */
  id: CrossModulePromptId;
  /** Toast body (e.g. "Додай прийом їжі?"). */
  msg: string;
  /** CTA label on the toast (e.g. "Додати"). */
  acceptLabel: string;
  /** Called when user accepts. Open the target module here. */
  onAccept: () => void;
  /** Override toast duration; default `DEFAULT_PROMPT_DURATION_MS`. */
  duration?: number;
}

/**
 * Show a cross-module nudge as an `info` toast with a single CTA.
 *
 * Returns `true` if the toast was shown, `false` if suppressed by
 * fatigue / acceptance snooze. Callers should ignore the return value
 * — the boolean exists only for tests / metrics.
 *
 * The toast auto-dismiss path (timeout) counts as a dismissal: not
 * showing interest after 6 s is feedback. The explicit-X path is the
 * same — we treat both as "user said no". This is intentional, since
 * Sergeant has no third state ("don't ask now but maybe later").
 */
export function tryShowCrossModulePrompt(
  toast: ToastApi,
  opts: CrossModulePromptOptions,
): boolean {
  if (isCrossModulePromptSuppressed(opts.id)) return false;

  let accepted = false;
  const id = toast.show(
    opts.msg,
    "info",
    opts.duration ?? DEFAULT_PROMPT_DURATION_MS,
    {
      label: opts.acceptLabel,
      onClick: () => {
        accepted = true;
        hapticTap();
        recordCrossModulePromptAccepted(opts.id);
        toast.dismiss(id);
        opts.onAccept();
      },
    },
  );

  // Schedule a "did the user act?" check just after the toast's
  // natural dismissal. If they neither tapped accept nor were still
  // engaged, we count it as a soft dismissal so the fatigue counter
  // moves. We add a small buffer so we run after `dismiss()` fires.
  const checkAfter = (opts.duration ?? DEFAULT_PROMPT_DURATION_MS) + 250;
  window.setTimeout(() => {
    if (!accepted) recordCrossModulePromptDismissed(opts.id);
  }, checkAfter);

  return true;
}
