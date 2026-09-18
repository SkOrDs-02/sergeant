/**
 * Last validated: 2026-05-14
 * Status: Active
 */
/**
 * Обчислення «пульсу» місяця — акцент-кольору, статусного текста і фону.
 * Споживач — `HeroCard` (`statusText` у підписі головного числа); картку
 * `MonthPulseCard`, для якої це писалось, прибрано спекою
 * `finyk-hero-month-strip.md`. Винесено з Overview як чиста функція, щоб:
 *  - легко тестувалось без React-контексту;
 *  - Overview не ніс розгалуженого if/else у тілі компоненту.
 *
 * Повертає обʼєкт зі стабільними Tailwind-класами. Змінювати лейбли/класи —
 * тільки тут.
 */
interface ComputePulseStyleArgs {
  hasExpensePlan: boolean;
  spendPlanRatio: number;
  /**
   * Денний бюджет, або `null` коли місячний план не заданий (див. AI-CONTEXT
   * у `useOverviewData` — без плану чесного числа не існує). При `null`
   * повертаємо нейтральний тон і статус-текст «План не заданий».
   */
  dayBudget: number | null;
}

export function computePulseStyle({
  hasExpensePlan,
  spendPlanRatio,
  dayBudget,
}: ComputePulseStyleArgs) {
  if (hasExpensePlan) {
    if (spendPlanRatio > 0.75) {
      return {
        accentLeft: "border-l-danger",
        bg: "bg-pulse-b",
        color: "text-danger",
        statusText: "Понад 75% запланованого",
      };
    }
    if (spendPlanRatio > 0.5) {
      return {
        accentLeft: "border-l-warning",
        bg: "bg-pulse-w",
        color: "text-warning",
        statusText: "Понад 50% запланованого",
      };
    }
    return {
      accentLeft: "border-l-success",
      bg: "bg-pulse-ok",
      color: "text-success",
      statusText: "В межах плану",
    };
  }

  if (dayBudget == null) {
    // Жодного кольорового wash-у: усі три `bg-pulse-*` — це вердикт
    // (зелений / бурштиновий / червоний), а без плану вердикту не існує.
    // `bg: ""` означає «без підкладки» і безпечно згортається в `cn()`.
    return {
      accentLeft: "border-l-line",
      bg: "",
      color: "text-muted",
      statusText: "План не заданий",
    };
  }

  const pulseGood = dayBudget >= 200;
  const pulseWarn = dayBudget >= 0 && dayBudget < 200;
  const pulseBad = dayBudget < 0;
  return {
    accentLeft: pulseGood
      ? "border-l-success"
      : pulseWarn
        ? "border-l-warning"
        : "border-l-danger",
    bg: pulseGood ? "bg-pulse-ok" : pulseWarn ? "bg-pulse-w" : "bg-pulse-b",
    color: pulseGood
      ? "text-success"
      : pulseWarn
        ? "text-warning"
        : "text-danger",
    statusText: pulseBad
      ? "Перевитрата"
      : pulseWarn
        ? "Обережно: майже вичерпано"
        : "В нормі",
  };
}
