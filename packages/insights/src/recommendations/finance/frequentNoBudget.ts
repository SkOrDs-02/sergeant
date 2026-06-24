// Rule: персоналізована підказка — найчастіша категорія без встановленого
// ліміту. Порог ≥5 використань, щоб не шуміти у новачків. Лейбл береться з
// кастомних категорій, потім BUILTIN, потім raw id як останній fallback.

import type { Rule } from "../types.js";
import type { FinanceContext } from "../financeContext.js";

const BUILTIN: Record<string, string> = {
  food: "Продукти",
  restaurant: "Кафе та ресторани",
  transport: "Транспорт",
  entertainment: "Розваги",
  health: "Здоров'я",
  shopping: "Покупки",
  utilities: "Комунальні",
  subscriptions: "Підписки",
  other: "Інше",
};

export const frequentNoBudgetRule: Rule<FinanceContext> = {
  id: "finyk.frequent_no_budget",
  module: "finyk",
  evaluate(ctx) {
    const limitIds = new Set(
      ctx.limits.map((l) => l.categoryId).filter(Boolean) as string[],
    );
    let best: { id: string; count: number } | null = null;
    for (const [id, count] of ctx.canonicalTotalCount) {
      if (limitIds.has(id)) continue;
      if (count < 5) continue;
      if (!best || count > best.count) best = { id, count };
    }
    if (!best) return [];

    const fromCustom = ctx.customCategories.find((c) => c.id === best!.id);
    const label = fromCustom?.label || BUILTIN[best.id] || best.id;
    const thisMonthSpend = Math.round(
      ctx.canonicalMonthSpend.get(best.id) || 0,
    );
    const spendHint =
      thisMonthSpend > 0
        ? `Цього місяця вже ${thisMonthSpend.toLocaleString("uk-UA")} ₴ — постав ліміт, щоб тримати руку на пульсі.`
        : `Використано ${best.count} разів — встанови ліміт, щоб тримати все під контролем.`;

    return [
      {
        id: `finyk_frequent_no_budget_${best.id}`,
        module: "finyk" as const,
        priority: 55,
        icon: "📌",
        title: `"${label}" — твоя найчастіша категорія без ліміту`,
        body: spendHint,
        action: "finyk",
      },
    ];
  },
};
