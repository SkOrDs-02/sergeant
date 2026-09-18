/** @status Active */

/**
 * Nutrition → DailyPlanCard «Розрахувати з профілю» CTA. Computes
 * kcal/Б/Ж/В from `hub_biometrics_v1` via Mifflin-St Jeor + activity
 * ladder + goal adjustment. Lives next to the static preset menu; copy
 * here covers the trigger button, the goal-picker dropdown, and the
 * inline hint that fires when biometrics is incomplete and steers the
 * user back to Profile → Біометрія.
 *
 * AI-CONTEXT: винесено в окремий файл, бо `uk.ts` стоїть за
 * `max-lines: 600` (Hard Rule #18) — той самий патерн, що вже
 * застосований до `finyk`/`privacy`/`pricing` (цілий top-level ключ, не
 * спред). Спредиться як `nutritionTdee: nutritionTdeeMessages` в `uk.ts`.
 */
export const nutritionTdeeMessages = {
  triggerLabel: "Розрахувати з профілю",
  triggerHint:
    "Заповни біометрію в профілі (стать, вік, зріст, вагу, рівень активності), і я порахую твою денну норму ккал автоматично.",
  // Динамічний варіант triggerHint — рахує, чого САМЕ бракує зараз,
  // замість того самого речення про всі пʼять полів незалежно від
  // прогресу (браузер-QA 2026-09-03: людина заповнювала частину,
  // поверталась і бачила той самий текст, що й на порожньому профілі).
  missingPrefix: "У профілі бракує:",
  missingHeight: "зріст",
  missingBirthDate: "дата народження",
  missingSex: "стать",
  missingActivity: "рівень активності",
  missingWeight: "вага",
  profileLink: "Заповнити в профілі",
  goalCutting: "Схуднення (-500 ккал)",
  goalMaintenance: "Підтримка",
  goalBulking: "Набір (+300 ккал)",
  appliedToast: "Цілі підставлено з профілю",
};
