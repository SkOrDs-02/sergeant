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
    expect(Object.keys(NAV_ICONS).sort()).toEqual([
      "analytics",
      "assets",
      "budgets",
      "overview",
      "settings",
      "transactions",
    ]);
  });
});
