// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { NAV_ICONS, NAV_IDS, NAV_ITEMS } from "./finykNav";

describe("finykNav", () => {
  it("keeps nav ids, labels, and icons in sync", () => {
    expect(NAV_ITEMS).toEqual([
      { id: "overview", label: "Огляд" },
      { id: "transactions", label: "Операції" },
      { id: "budgets", label: "Планування" },
      { id: "analytics", label: "Аналітика" },
      { id: "assets", label: "Активи" },
    ]);
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
