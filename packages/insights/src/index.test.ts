// Smoke-тест public-surface пакета `@sergeant/insights`.
//
// Споживачі (`apps/web` через `core/lib/recommendationEngine.ts`,
// майбутній `apps/mobile`) тягнуть саме звідси:
//   import { Recommendations, normalize, scoreAndSort } from "@sergeant/insights";
//
// Тест ловить зворотні-сумісні зміни exports map (рідкісний, але дорогий
// regression — `package.json` exports або barrel-файли мовчки не пропускають
// символ, і споживчий бандл валиться у production).
import { describe, it, expect } from "vitest";
import * as Insights from "./index.js";

describe("@sergeant/insights public exports", () => {
  it("re-export-ить search namespace", () => {
    expect(Insights.normalize).toBeTypeOf("function");
    expect(Insights.tokenize).toBeTypeOf("function");
    expect(Insights.scoreMatch).toBeTypeOf("function");
    expect(Insights.scoreAndSort).toBeTypeOf("function");
  });

  it("експортує Recommendations namespace із FINANCE_RULES і runRules", () => {
    expect(Insights.Recommendations).toBeDefined();
    expect(Array.isArray(Insights.Recommendations.FINANCE_RULES)).toBe(true);
    expect(Insights.Recommendations.runRules).toBeTypeOf("function");
  });

  it("Recommendations re-export-ить per-rule symbols", () => {
    expect(Insights.Recommendations.budgetLimitsRule).toBeDefined();
    expect(Insights.Recommendations.spendingVelocityRule).toBeDefined();
    expect(Insights.Recommendations.frequentNoBudgetRule).toBeDefined();
    expect(Insights.Recommendations.goalProgressRule).toBeDefined();
    expect(Insights.Recommendations.noTxRecentRule).toBeDefined();
    expect(Insights.Recommendations.dailyVsWeeklyPaceRule).toBeDefined();
  });
});
