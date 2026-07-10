/**
 * @status Active
 * @owner @Skords-01
 */

/**
 * Вік акаунта у цілих добах — спільний хелпер NPS-тригера
 * (`useNpsSurveyTrigger`) і PostHog-трейта `account_age_days`
 * (`identifyTraits.ts`). Окремий pure-модуль без імпортів, щоб
 * `identifyTraits` (яку тягне `AuthContext`) не залежала від
 * hook-файла, який сам імпортує `AuthContext` — інакше цикл.
 *
 * UTC-мілісекунди без Kyiv-нормалізації — той самий підхід, що
 * `signup_date`: для «≥ 7 днів використання» доба-точність достатня,
 * межі календарного дня тут нічого не змінюють.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Цілі доби від `createdAt` до `now`. `null` — коли дата відсутня,
 * невалідна (legacy-акаунти, зіпсований payload) або «з майбутнього»
 * (clock skew); викликачі трактують `null` як «не eligible».
 */
export function accountAgeDays(
  createdAt: string | null | undefined,
  now: Date = new Date(),
): number | null {
  if (!createdAt) return null;
  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) return null;
  const elapsed = now.getTime() - created.getTime();
  if (elapsed < 0) return null;
  return Math.floor(elapsed / MS_PER_DAY);
}
