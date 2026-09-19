import { getBudgetMonthKey, getTodayKey, getWeekStart } from "./useTabBadges";

// Jest у mobile запускається з `TZ=Europe/Kyiv` (package.json → "test"), тож
// «пристрій» тут = Київ, а UTC-зріз дає інший день у вікні 00:00–03:00.

describe("useTabBadges — день-ключі за ADR-0078", () => {
  it("getTodayKey: 01:30 за пристроєм — це сьогодні, а не вчора по UTC", () => {
    const at = new Date("2026-09-15T22:30:00Z"); // 16.09 01:30 Europe/Kyiv
    expect(getTodayKey(at)).toBe("2026-09-16");
    // Старий вираз — саме та помилка, від якої стоїть цей тест.
    expect(at.toISOString().slice(0, 10)).toBe("2026-09-15");
  });

  it("getWeekStart: понеділок за пристроєм, неділя ще належить до поточного тижня", () => {
    expect(getWeekStart(new Date("2026-09-15T22:30:00Z"))).toBe("2026-09-14");
    // Нд 20.09 01:30 Києва — по UTC ще сб 19.09, і старий код зсував тиждень.
    expect(getWeekStart(new Date("2026-09-19T22:30:00Z"))).toBe("2026-09-14");
  });

  it("getBudgetMonthKey: фінансовий період — за Києвом", () => {
    expect(getBudgetMonthKey(new Date("2026-09-30T22:30:00Z"))).toBe("2026-10");
  });
});
