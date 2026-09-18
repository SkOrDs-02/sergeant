import type { PaywallSurface } from "./PaywallModal";

/**
 * Реєстр Premium-гейтів: юніон id, мапа id → аналітична поверхня paywall і
 * рантайм-дзеркало юніону.
 *
 * AI-CONTEXT: винесено з `useFeatureGate.ts` 2026-09-16 як leaf-модуль без
 * жодного рантайм-імпорту (`PaywallSurface` — лише тип, стирається). Причина
 * не косметична: контрактний тест каталогів i18n
 * (`shared/i18n/index.test.ts`) мусить деривувати список гейтів, а не
 * тримати його копію, і при цьому лишитись у `node`-середовищі — імпорт
 * `useFeatureGate` притягнув би React, `usePlan` і react-query.
 *
 * Що саме розійшлось до цього: гейт `multi-currency` прибрали 2026-08-05
 * (функції, яку він захищав, у застосунку немає), а копія списку в тесті
 * ще пів місяця вимагала його ключ у `en.ts` — тобто тест сторожував борг
 * замість контракту, і осиротіла копія трималась у двох каталогах.
 */
export type PremiumFeatureId = "ai-photo-analysis" | "analytics-export-pdf";

/**
 * Maps a `PremiumFeatureId` to the existing `PaywallSurface` analytics
 * label so `paywall_viewed` continues to bucket cleanly.
 */
export const FEATURE_TO_SURFACE: Record<PremiumFeatureId, PaywallSurface> = {
  "ai-photo-analysis": "unlimited_ai_photo",
  "analytics-export-pdf": "csv_export",
};

/**
 * Рантайм-дзеркало юніону. `Record<PremiumFeatureId, …>` вище змушує TS
 * додати ключ при новому гейті, а цей експорт доносить його до тестів.
 */
export const PREMIUM_FEATURE_IDS = Object.keys(
  FEATURE_TO_SURFACE,
) as PremiumFeatureId[];
