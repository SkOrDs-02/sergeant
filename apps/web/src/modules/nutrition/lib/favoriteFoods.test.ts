/**
 * Last validated: 2026-11-19
 * Status: Active
 * Розвʼязання позначених продуктів для блоку «Улюблені»: локальна база,
 * інакше корпус для `gen_`, інакше пропуск; порядок позначення.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("./foodDb/foodDb", async (orig) => {
  const real = await orig<typeof import("./foodDb/foodDb")>();
  return {
    ...real,
    getFoodById: vi.fn(async (id: string) =>
      id === "food_own"
        ? real.makeFoodProduct({
            id,
            name: "Мій сирник",
            per100: { kcal: 220 },
          })
        : null,
    ),
  };
});

import { resolveFavoriteFoods } from "./favoriteFoods";

describe("resolveFavoriteFoods", () => {
  it("бере локальний продукт, базовий із корпусу, зовнішній пропускає", async () => {
    const list = await resolveFavoriteFoods([
      "gen_banan",
      "off_123",
      "food_own",
    ]);
    expect(list.map((f) => [f.id, f.name])).toEqual([
      ["gen_banan", "Банан"],
      ["food_own", "Мій сирник"],
    ]);
  });

  it("порожній список — порожньо", async () => {
    expect(await resolveFavoriteFoods([])).toEqual([]);
  });
});
