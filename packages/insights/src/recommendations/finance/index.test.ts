// Тести для barrel-файла finance-правил. Гарантують, що `FINANCE_RULES`
// містить рівно ті 6 правил, які ми очікуємо у HubChat-движку, і що
// re-export-и не зник_л_и (helpers інших файлів покладаються на named-exports
// типу `budgetLimitsRule`, `spendingVelocityRule` etc.).
//
// Контекст: коли додаємо нове правило, оновлюємо обидва: масив i named-export.
// Цей тест — gate проти забутого додавання у `FINANCE_RULES` (мовчазний
// regression: правило є, але не виконується engine-ом).
import { describe, it, expect } from "vitest";
import {
  FINANCE_RULES,
  budgetLimitsRule,
  spendingVelocityRule,
  frequentNoBudgetRule,
  goalProgressRule,
  noTxRecentRule,
  dailyVsWeeklyPaceRule,
} from "./index.js";

describe("FINANCE_RULES barrel", () => {
  it("містить рівно 6 правил у каталозі", () => {
    expect(FINANCE_RULES).toHaveLength(6);
  });

  it("кожен елемент експортовано окремо як named export", () => {
    const exported = [
      budgetLimitsRule,
      spendingVelocityRule,
      frequentNoBudgetRule,
      goalProgressRule,
      noTxRecentRule,
      dailyVsWeeklyPaceRule,
    ];
    for (const rule of FINANCE_RULES) {
      expect(exported).toContain(rule);
    }
  });

  it("усі правила мають унікальні `id` (інакше registry лог дублюватиметься)", () => {
    const ids = FINANCE_RULES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("усі правила належать модулю `finyk`", () => {
    for (const rule of FINANCE_RULES) {
      expect(rule.module).toBe("finyk");
    }
  });

  it("`evaluate` — це функція на кожному правилі", () => {
    for (const rule of FINANCE_RULES) {
      expect(rule.evaluate).toBeTypeOf("function");
    }
  });
});
