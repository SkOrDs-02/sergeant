// Rule: попередження/перевищення бюджетних лімітів (categoryId + limit).
//
// Стан ліміту береться з `ctx.limitUsage` (`calcLimitUsages` у finyk-domain):
// те саме вікно періоду, ті самі кошики категорій і той самий відсоток, що
// на картці ліміту в Плануванні та в хаб-картці перевищення. Своєї
// арифметики тут немає навмисно: дві формули для одного числа і дали
// «використано 162 %» поруч із «перевищень немає» (Р5 спеки аналітики v2).

import type { Rec, Rule } from "../types.js";
import type { FinanceContext } from "../financeContext.js";
import { formatNumberUk } from "@sergeant/shared";
import { MCC_CATEGORIES } from "@sergeant/finyk-domain/constants";

function resolveLabel(
  categoryId: string,
  customCategories: { id: string; label: string }[],
): string {
  const custom = customCategories.find((c) => c.id === categoryId);
  if (custom) return custom.label;
  const canonical = MCC_CATEGORIES.find((c) => c.id === categoryId);
  return canonical?.label || categoryId;
}

export const budgetLimitsRule: Rule<FinanceContext> = {
  id: "finyk.budget_limits",
  module: "finyk",
  evaluate(ctx) {
    const recs: Rec[] = [];
    for (const usage of ctx.limitUsage) {
      const { budget, categoryIds: catIds, key: catKey } = usage;
      const catId = catIds[0];
      if (!catId) continue;

      const catLabel =
        budget.label?.trim() ||
        catIds.map((id) => resolveLabel(id, ctx.customCategories)).join(" + ");
      // Глибокий лінк на сторінку Планування з підсвіткою картки, про яку
      // говорить інсайт: комбо-картка зареєстрована під кожною своєю
      // категорією, тож першої вистачає.
      const actionHash = `budgets?cat=${encodeURIComponent(catId)}`;

      if (usage.overLimit) {
        recs.push({
          // Ключ рекомендації — весь набір, щоб два ліміти зі спільною
          // першою категорією не злипались в один rec.
          id: `budget_over_${catKey}`,
          module: "finyk" as const,
          priority: 90,
          severity: "danger" as const,
          icon: "flag",
          title: `Бюджет «${catLabel}» перевищено на ${Math.round(usage.pctRaw - 100)}%`,
          body: `Витрачено ${formatNumberUk(Math.round(usage.spent))} ₴ з ${formatNumberUk(Math.round(usage.limit))} ₴`,
          action: "finyk",
          actionHash,
          // Ліміт уже пробито — часто це означає, що є ще незафіксовані
          // витрати, які б затягнули картину ще гірше. Одним тапом відкриваємо
          // sheet, щоб дописати їх, поки деталі свіжі в памʼяті.
          pwaAction: "add_expense" as const,
        });
      } else if (usage.pctRaw >= 90) {
        recs.push({
          id: `budget_warn_${catKey}`,
          module: "finyk" as const,
          priority: 60,
          severity: "warning" as const,
          icon: "alert-triangle",
          title: `Ліміт «${catLabel}» майже вичерпано`,
          body: `${Math.round(usage.pctRaw)}% бюджету витрачено цього місяця`,
          action: "finyk",
          actionHash,
        });
      }
    }
    return recs;
  },
};
