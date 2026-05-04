import { describe, it, expect } from "vitest";
import { calcForecast } from "./forecastEngine.js";

describe("finyk/forecastEngine", () => {
  it("calcForecast computes spent and forecast for a simple category", () => {
    const today = new Date(2026, 0, 10); // local time
    const txs = [
      {
        id: "t1",
        time: Math.floor(new Date(2026, 0, 2, 12).getTime() / 1000),
        amount: -10000,
        description: "A",
      },
      {
        id: "t2",
        time: Math.floor(new Date(2026, 0, 3, 12).getTime() / 1000),
        amount: -20000,
        description: "B",
      },
    ];
    const categoryLimits = [{ categoryId: "food", limit: 200 }];
    const txCategories = { t1: "food", t2: "food" };
    const out = calcForecast(txs, categoryLimits, today, txCategories, {}, []);
    expect(out).toHaveLength(1);
    expect(out[0]!.categoryId).toBe("food");
    expect(out[0]!.spent).toBe(300);
    expect(out[0]!.dailyData).toHaveLength(31);
  });
});
