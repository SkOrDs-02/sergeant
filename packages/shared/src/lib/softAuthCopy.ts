/**
 * Copy generator for the post-FTUX SoftAuth prompt — A/B-ready.
 *
 * The pre-S3.2 copy was fear-framed: «У тебе {N} записів. Створи
 * акаунт, щоб не втратити.» The audit (`docs/launch/ftux-sprint-plan.md`
 * §5) flagged this as anti-honest — the user has *just* completed a
 * value moment, and the next thing we say is "you might lose this".
 *
 * The new primary copy is **gain-first**: it acknowledges what the
 * user already accomplished and frames the account as cross-device
 * continuity, not loss prevention. The fear-copy is kept as the
 * `fear` variant for PostHog A/B-testing — switching the assignment
 * weights (or a remote feature flag) re-routes traffic without a
 * code change.
 *
 * `assignVariant(SOFT_AUTH_COPY_EXPERIMENT)` in `abTest.ts` defaults
 * to 100% `gain` (weight `[1, 0]`); flip the weights or call
 * `overrideVariant` to start a real split.
 */

import type { ExperimentDefinition } from "./abTest";

/**
 * Experiment definition for the soft-auth copy A/B. `gain` is the
 * default mainline; `fear` is preserved for testing only.
 */
export const SOFT_AUTH_COPY_EXPERIMENT: ExperimentDefinition = {
  id: "soft_auth_copy_v1",
  variants: ["gain", "fear"] as const,
  weights: [1, 0] as const,
};

export type SoftAuthCopyVariant = "gain" | "fear";

export interface SoftAuthCopyContext {
  /** Real (non-demo) entries the user has already created. */
  entryCount: number;
  /**
   * Days the user has actively returned. `-1` means "not measured
   * yet" (HubDashboard initialises it during effect). The copy
   * generator treats `-1` as "no signal" and falls back to the
   * entry-only branch.
   */
  sessionDays: number;
}

export interface SoftAuthCopy {
  /** Bold lead, ≤ 36 chars. */
  title: string;
  /** Single paragraph subtext, ≤ 140 chars. */
  body: string;
}

/**
 * Pure copy resolver. Web and mobile call the same function so the
 * surface stays in sync — no platform-specific copy drift.
 */
export function getSoftAuthCopy(
  variant: SoftAuthCopyVariant,
  ctx: SoftAuthCopyContext,
): SoftAuthCopy {
  if (variant === "fear") return getFearCopy(ctx);
  return getGainCopy(ctx);
}

function getGainCopy({
  entryCount,
  sessionDays,
}: SoftAuthCopyContext): SoftAuthCopy {
  // Tier 1: heavy user (5+ entries across 3+ session-days). Speak in
  // accumulated value, not in counts of single records.
  if (entryCount >= 5 && sessionDays >= 3) {
    return {
      title: "Готовий брати з собою?",
      body: `Уже ${entryCount} ${pluralizeEntries(
        entryCount,
      )} за ${sessionDays} ${pluralizeDays(
        sessionDays,
      )}. Акаунт відкриває доступ з телефона та браузера.`,
    };
  }

  // Tier 2: at least one real entry — affirm the action, offer
  // cross-device continuity. No "you might lose this" framing.
  if (entryCount >= 1) {
    return {
      title: "Хочеш ці записи в телефоні?",
      body: `${entryCount} ${pluralizeEntries(
        entryCount,
      )} вже тут. Акаунт синхронізує їх між телефоном і браузером — 20 секунд.`,
    };
  }

  // Tier 3 (defensive): no entry signal yet. SoftAuth shouldn't
  // normally render in this state (it's gated post-FTUX), but if
  // upstream ever loosens the gate, give a neutral copy.
  return {
    title: "Хочеш на всіх пристроях?",
    body: "Акаунт відкриває доступ з телефона та браузера. 20 секунд.",
  };
}

function getFearCopy({ entryCount }: SoftAuthCopyContext): SoftAuthCopy {
  // Preserved for the `fear` A/B arm. This is the pre-S3.2 production
  // copy, kept intact so the experiment compares like-for-like.
  if (entryCount > 0) {
    return {
      title: "Зберегти на всіх пристроях?",
      body: `У тебе ${entryCount} ${pluralizeEntries(
        entryCount,
      )}. Створи акаунт, щоб не втратити.`,
    };
  }
  return {
    title: "Зберегти на всіх пристроях?",
    body: "Акаунт синхронізує твої дані між телефоном і браузером. 20 секунд.",
  };
}

/**
 * Ukrainian noun pluralisation: 1 → singular, 2-4 (except 12-14) →
 * paucal, else → plural-genitive. Keeps copy grammatical for any
 * `entryCount` without `{count, plural, ...}` ICU dependencies.
 */
function pluralizeEntries(n: number): string {
  return pluralizeForms(n, ["запис", "записи", "записів"]);
}

function pluralizeDays(n: number): string {
  return pluralizeForms(n, ["день", "дні", "днів"]);
}

function pluralizeForms(n: number, forms: [string, string, string]): string {
  const abs = Math.abs(n);
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
  return forms[2];
}
