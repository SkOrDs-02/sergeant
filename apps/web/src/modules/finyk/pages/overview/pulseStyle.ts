/**
 * Обчислення «пульсу» місяця — акцент-кольору, статусного текста і фону
 * для MonthPulseCard. Винесено з Overview як чиста функція, щоб:
 *  - легко тестувалось без React-контексту;
 *  - Overview не ніс розгалуженого if/else у тілі компоненту.
 *
 * Повертає об'єкт зі стабільними Tailwind-класами. Змінювати лейбли/класи —
 * тільки тут.
 */
interface ComputePulseStyleArgs {
  hasExpensePlan: boolean;
  spendPlanRatio: number;
  dayBudget: number;
}

export function computePulseStyle({
  hasExpensePlan,
  spendPlanRatio,
  dayBudget,
}: ComputePulseStyleArgs) {
  if (hasExpensePlan) {
    if (spendPlanRatio > 0.75) {
      return {
        accentLeft: "border-l-red-500",
        bg: "bg-pulse-b",
        color: "text-danger",
        statusText: "Понад 75% запланованого",
      };
    }
    if (spendPlanRatio > 0.5) {
      return {
        accentLeft: "border-l-amber-500",
        bg: "bg-pulse-w",
        color: "text-warning",
        statusText: "Понад 50% запланованого",
      };
    }
    return {
      accentLeft: "border-l-emerald-500",
      bg: "bg-pulse-ok",
      color: "text-success",
      statusText: "В межах плану",
    };
  }

  const pulseGood = dayBudget >= 200;
  const pulseWarn = dayBudget >= 0 && dayBudget < 200;
  const pulseBad = dayBudget < 0;
  return {
    accentLeft: pulseGood
      ? "border-l-emerald-500"
      : pulseWarn
        ? "border-l-amber-500"
        : "border-l-red-500",
    bg: pulseGood ? "bg-pulse-ok" : pulseWarn ? "bg-pulse-w" : "bg-pulse-b",
    color: pulseGood
      ? "text-success"
      : pulseWarn
        ? "text-warning"
        : "text-danger",
    statusText: pulseBad
      ? "Перевитрата"
      : pulseWarn
        ? "Обережно — майже вичерпано"
        : "В нормі",
  };
}
