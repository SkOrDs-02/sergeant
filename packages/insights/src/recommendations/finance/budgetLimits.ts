// Rule: попередження/перевищення бюджетних лімітів (categoryId + limit).
//
// Spent рахуємо з `canonicalMonthSpend` (резолв через `getCategory`,
// MCC + keywords + override + customCategories) — рівно як на сторінці
// Планування → Ліміти. Це гарантує, що відсоток в інсайті збігається
// з тим, що користувач бачить на картці ліміту. Якщо canonical-індекс
// порожній (ранні тести або ще-не-перебудований контекст), падаємо
// на legacy raw-keyed `categorySpend`.

import type { Rec, Rule } from "../types.js";
import type { FinanceContext } from "../financeContext.js";
import { formatNumberUk } from "@sergeant/shared";

const BUILTIN_LABELS: Record<string, string> = {
  food: "Продукти",
  cafe: "Кафе та ресторани",
  restaurant: "Кафе та ресторани",
  transport: "Транспорт",
  entertainment: "Розваги",
  health: "Здоров'я",
  shopping: "Покупки",
  utilities: "Комунальні",
  subscriptions: "Підписки",
  other: "Інше",
};

function resolveLabel(
  categoryId: string,
  customCategories: { id: string; label: string }[],
): string {
  const custom = customCategories.find((c) => c.id === categoryId);
  if (custom) return custom.label;
  return BUILTIN_LABELS[categoryId] || categoryId;
}

export const budgetLimitsRule: Rule<FinanceContext> = {
  id: "finyk.budget_limits",
  module: "finyk",
  evaluate(ctx) {
    const recs: Rec[] = [];
    for (const limit of ctx.limits) {
      const catId = limit.categoryId;
      if (!catId) continue;
      if (!limit.limit || limit.limit <= 0) continue;

      const canonicalSpent = ctx.canonicalMonthSpend.get(catId);
      const spent =
        typeof canonicalSpent === "number"
          ? canonicalSpent
          : ctx.categorySpend[catId] || 0;
      const pct = spent / limit.limit;
      const catLabel = resolveLabel(catId, ctx.customCategories);
      // Глибокий лінк на сторінку Планування з підсвіткою саме цієї
      // категорії — інсайт повинен вести до картки, про яку говорить,
      // а не на дефолтний Огляд модуля.
      const actionHash = `budgets?cat=${encodeURIComponent(catId)}`;

      if (pct >= 1.0) {
        recs.push({
          id: `budget_over_${catId}`,
          module: "finyk" as const,
          priority: 90,
          severity: "danger" as const,
          icon: "flag",
          title: `Бюджет "${catLabel}" перевищено на ${Math.round((pct - 1) * 100)}%`,
          body: `Витрачено ${formatNumberUk(Math.round(spent))} ₴ з ${formatNumberUk(Math.round(limit.limit))} ₴`,
          action: "finyk",
          actionHash,
          // Ліміт уже пробито — часто це означає, що є ще незафіксовані
          // витрати, які б затягнули картину ще гірше. Одним тапом відкриваємо
          // sheet, щоб дописати їх, поки деталі свіжі в пам'яті.
          pwaAction: "add_expense" as const,
        });
      } else if (pct >= 0.9) {
        recs.push({
          id: `budget_warn_${catId}`,
          module: "finyk" as const,
          priority: 60,
          severity: "warning" as const,
          icon: "alert-triangle",
          title: `Ліміт "${catLabel}" майже вичерпано`,
          body: `${Math.round(pct * 100)}% бюджету витрачено цього місяця`,
          action: "finyk",
          actionHash,
        });
      }
    }
    return recs;
  },
};
