import type { messages as ukMessages, MessageGroupShape } from "./uk";

// Структурне дзеркало uk-групи `nutritionTdee`: кожен листовий ключ
// обовʼязковий, stub неможливий (див. shallow-merge контракт у `index.ts`).
// Винесено в окремий файл разом з uk-стороною (Hard Rule #18) — той самий
// патерн, що вже застосований до `pricing` (`en.pricing.ts`).
export const nutritionTdeeEn: MessageGroupShape<
  (typeof ukMessages)["nutritionTdee"]
> = {
  triggerLabel: "Calculate from profile",
  triggerHint:
    "Fill in your biometrics in your profile (sex, age, height, weight, activity level) and we'll calculate your daily calorie target automatically.",
  missingPrefix: "Your profile is missing:",
  missingHeight: "height",
  missingBirthDate: "birth date",
  missingSex: "sex",
  missingActivity: "activity level",
  missingWeight: "weight",
  profileLink: "Fill in profile",
  goalCutting: "Cut weight (−500 kcal)",
  goalMaintenance: "Maintenance",
  goalBulking: "Bulk (+300 kcal)",
  appliedToast: "Targets applied from profile",
};
