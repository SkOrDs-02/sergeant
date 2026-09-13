// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { NAV_ICONS, NAV_IDS, NAV_ITEMS } from "./finykNav";

describe("finykNav", () => {
  it("keeps nav ids, labels, and icons in sync", () => {
    expect(NAV_ITEMS).toEqual([
      { id: "overview", label: "Огляд" },
      { id: "transactions", label: "Операції" },
      { id: "budgets", label: "Планування", visibleLabel: "План" },
      { id: "analytics", label: "Аналітика", visibleLabel: "Аналіз" },
      { id: "assets", label: "Активи" },
    ]);
  });

  // `label` — доступна назва, `visibleLabel` — лише те, що видно. Тест пінить
  // саме РОЗХОДЖЕННЯ: зведення двох полів в одне зробило б таб «План»
  // невідрізненним у скрінрідері, а тести навбара шукають його по повній
  // назві. Обрізка ж гейтиться рендером — `tests/mobile/nav-label-fit.spec.ts`.
  it("keeps the accessible label full wherever the visible one is shortened", () => {
    const shortened = NAV_ITEMS.filter((item) => item.visibleLabel);
    expect(shortened.length).toBeGreaterThan(0);
    for (const item of shortened) {
      expect(item.visibleLabel).not.toBe(item.label);
      expect(item.label.length).toBeGreaterThan(
        (item.visibleLabel ?? "").length,
      );
    }
    expect(NAV_IDS).toEqual(NAV_ITEMS.map((item) => item.id));
    // `settings` прибрано з `NAV_ICONS` (аудит 2026-09-13, PR-F1): цей
    // ключ ніколи не мав відповідного пункту в `NAV_ITEMS` — «Налаштування»
    // Фініка відкриваються через `onOpenSettings` (Hub), не через таб
    // модуля, тож іконка була мертвим записом.
    expect(Object.keys(NAV_ICONS).sort()).toEqual([
      "analytics",
      "assets",
      "budgets",
      "overview",
      "transactions",
    ]);
  });
});
