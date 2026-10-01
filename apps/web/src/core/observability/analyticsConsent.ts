/**
 * Last validated: 2026-09-29
 * Status: Active
 *
 * In-memory cache of the current user's `analytics` consent preference
 * (`UserPreferences.analytics`, `/api/me/preferences`), so call-sites that
 * fire analytics events synchronously from a UI event handler (e.g.
 * `InsightCard`'s dismiss button) can gate on it without an async round
 * trip on every click.
 *
 * AI-CONTEXT: це ЄДИНЕ джерело правди згоди на продуктову аналітику
 * (рішення власника 2026-09-29, аудит external-critique § 1.3). Його читають:
 *
 *   - `trackEvent` (`analytics.ts`) — PostHog-транспорт не отримує подій до
 *     явної згоди; локальний ring-buffer лишається (нікуди не йде);
 *   - `posthog.ts` — `opt_out_capturing_by_default: true` + `opt_in_capturing`
 *     / `opt_out_capturing` через `subscribeAnalyticsConsent`;
 *   - `InsightCard` — `advice_*` події (історичний call-site).
 *
 * Писачі: крок згоди в онбордингу (`OnboardingConsentStep`, з 2026-10-01 —
 * основний шлях для нових людей) і запасний банер для тих, хто вже минув
 * онбординг (`AnalyticsConsentBanner`) — обидва через
 * `useAnalyticsConsentChoice`; тумблер у Налаштування → Приватність
 * (`PrivacySection`) — усі через `setAnalyticsConsent` (явний вибір;
 * зберігається на пристрої як «рішення», тож банер не повертається), і
 * гідрація з сервера (`hydrateAnalyticsConsent`) — не є вибором на цьому
 * пристрої, тому банер не гасить, окрім `granted`.
 *
 * (2026-09-29: початкове значення кешу — локальне рішення пристрою
 * `granted`, інакше `false`; правило нижче лишається чинним.)
 *
 * Default `false` — DENY UNTIL HYDRATED (CodeRabbit PR #627). This used to
 * default `true` (mirroring `UserPreferencesSchema.analytics`'s implicit
 * opt-out model), but that created a race on reload: this in-memory cache
 * resets to the default on every page load, and `PrivacySection` — the
 * only prior hydration point — only fetches `/api/me/preferences` once
 * the user opens Settings → Privacy. Any `InsightCard` mounted before that
 * (or in a session where Settings is never opened) fired `advice_shown` /
 * `advice_dismissed` under an implicit "yes" the server may not agree
 * with (server-side `analytics` column defaults `FALSE` — migration 111).
 * Denying by default until an authenticated boot actually reads the
 * server value closes that window; the false-negative cost (a few
 * dropped events between boot and hydration) is much cheaper than an
 * unconsented emit.
 *
 * Two writers keep this in sync with the server value:
 *
 *   - `useAnalyticsConsentBoot` (`./useAnalyticsConsentBoot.ts`) — mounted
 *     app-wide next to `useProfileWriteThroughBoot`, hydrates once per
 *     authenticated `userId` as early as possible after boot.
 *   - `PrivacySection` — calls it again after both `getPreferences()`
 *     (mount, if the user opens Settings) and `updatePreferences()`
 *     (toggle, optimistically — see that component for the revert-on-
 *     failure contract) resolve, so the cache never lags a page that's
 *     already open.
 */

import { logger } from "@shared/lib";
import { safeReadLS, safeWriteLS } from "@shared/lib/storage/storage";

const DECISION_KEY = "sergeant.analytics_consent_decision.v1";

export type AnalyticsDecision = "granted" | "denied";

function readDecision(): AnalyticsDecision | null {
  // Обʼєкт, а не голий рядок: `safeWriteLS` пише рядки як є (без JSON), а
  // `safeReadLS` їх парсить як JSON — голе `granted` не прочиталось би.
  const raw = safeReadLS<{ v?: unknown }>(DECISION_KEY);
  const value = raw && typeof raw === "object" ? raw.v : null;
  return value === "granted" || value === "denied" ? value : null;
}

let decision: AnalyticsDecision | null = readDecision();
// Скільки знає кеш: `true` лише після явного «granted» на пристрої або
// після того, як сервер підтвердив `analytics: true`.
let cachedAnalyticsConsent = decision === "granted";
// Чи завершилась (успішно чи ні) серверна гідрація для поточної сесії.
// Банер не показується залогіненому, поки її нема: інакше людина, що вже
// погодилась на іншому пристрої, бачила б банер на мить.
let serverHydrated = false;

const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      /* слухач не має ламати запис згоди */
    }
  }
}

function persistDecision(next: AnalyticsDecision | null): void {
  decision = next;
  if (next === null) return;
  // Збій сховища (квота, приватний режим) не має губити рішення: воно
  // лишається в памʼяті на цю сесію, підписники все одно отримують notify().
  try {
    if (!safeWriteLS(DECISION_KEY, { v: next })) {
      logger.warn("[analyticsConsent] не вдалося зберегти рішення на пристрої");
    }
  } catch (err) {
    logger.warn(
      "[analyticsConsent] не вдалося зберегти рішення на пристрої",
      err,
    );
  }
}

/** `true` when analytics events are currently allowed to fire. */
export function getAnalyticsConsent(): boolean {
  return cachedAnalyticsConsent;
}

/** Рішення, прийняте на цьому пристрої; `null` — людина ще не відповідала. */
export function getAnalyticsDecision(): AnalyticsDecision | null {
  return decision;
}

export function isAnalyticsServerHydrated(): boolean {
  return serverHydrated;
}

/**
 * ЯВНИЙ вибір людини (банер або тумблер): оновлює кеш, запамʼятовує
 * рішення на пристрої й сповіщає підписників (PostHog opt-in/out).
 */
export function setAnalyticsConsent(value: boolean): void {
  cachedAnalyticsConsent = value;
  persistDecision(value ? "granted" : "denied");
  notify();
}

/**
 * Значення, прочитане з сервера (`/api/me/preferences`). Сервер має пріоритет
 * над кешем (безпечніший бік: відмова перемагає). `true` гасить банер;
 * `false` — лише якщо рішення вже було (інакше «false» — це просто
 * серверний дефолт, а не відповідь людини).
 */
export function hydrateAnalyticsConsent(value: boolean): void {
  cachedAnalyticsConsent = value;
  if (value) persistDecision("granted");
  else if (decision !== null) persistDecision("denied");
  serverHydrated = true;
  notify();
}

/** Гідрація не вдалась / гість: далі покладаємось на локальне рішення. */
export function markAnalyticsServerHydrated(hydrated: boolean): void {
  if (serverHydrated === hydrated) return;
  serverHydrated = hydrated;
  notify();
}

/** Підписка на будь-яку зміну згоди/рішення. Повертає відписку. */
export function subscribeAnalyticsConsent(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test-only reset. Not for production call-sites. */
export function __resetAnalyticsConsentForTests(): void {
  cachedAnalyticsConsent = false;
  decision = null;
  serverHydrated = false;
  listeners.clear();
}
