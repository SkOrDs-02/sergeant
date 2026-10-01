/**
 * Last validated: 2026-10-01
 * Status: Active
 */
import { describe, expect, it } from "vitest";
import {
  SHOPPING_RECIPES_MAX,
  buildRecipeOptions,
  pickSelectedRecipes,
  toShoppingRecipe,
} from "./shoppingRecipes";
import type { SavedRecipe } from "./recipeBook";

const saved = (id: string, title: string, ingredients: string[] = []) =>
  ({ id, title, ingredients }) as unknown as SavedRecipe;

describe("buildRecipeOptions", () => {
  it("складає збережені й згенеровані двома списками з ключами груп і кількістю інгредієнтів", () => {
    const { saved: s, generated: g } = buildRecipeOptions(
      [saved("a", "Борщ", ["буряк", "капуста"])],
      [{ id: "x", title: "Омлет", ingredients: ["яйця"] }],
    );
    expect(s).toEqual([
      expect.objectContaining({
        key: "saved:a",
        group: "saved",
        title: "Борщ",
        ingredientCount: 2,
      }),
    ]);
    expect(g).toEqual([
      expect.objectContaining({
        group: "generated",
        title: "Омлет",
        ingredientCount: 1,
      }),
    ]);
    expect(g[0]!.key).toMatch(/^generated:x:/);
  });

  it("ключі груп не перетинаються, навіть коли id збігаються", () => {
    const { saved: s, generated: g } = buildRecipeOptions(
      [saved("1", "Борщ")],
      [{ id: "1", title: "Плов" }],
    );
    expect(s[0]!.key).not.toBe(g[0]!.key);
  });

  it("згенерований рецепт зі збереженою назвою (без урахування регістру й пробілів) не дублюється", () => {
    const { generated } = buildRecipeOptions(
      [saved("a", "Омлет з сиром")],
      [
        { id: "g1", title: "  ОМЛЕТ  з сиром " },
        { id: "g2", title: "Плов" },
      ],
    );
    expect(generated.map((o) => o.title)).toEqual(["Плов"]);
  });

  it("два згенерованих без id й однакових назв лишаються окремими варіантами", () => {
    const { generated } = buildRecipeOptions(
      [],
      [{ title: "Суп" }, { title: "Суп" }],
    );
    expect(generated).toHaveLength(2);
    expect(new Set(generated.map((o) => o.key)).size).toBe(2);
  });

  it("безназвовий рецепт отримує підпис за номером, а не порожній рядок", () => {
    const { generated } = buildRecipeOptions([], [{ ingredients: ["сіль"] }]);
    expect(generated[0]!.title).toBe("Рецепт 1");
  });

  it("нерядкові елементи в ingredients не ламають підрахунок", () => {
    const { generated } = buildRecipeOptions(
      [],
      [{ title: "Салат", ingredients: ["огірок", "", null, 5] }],
    );
    // "" відкидається, null -> "" відкидається, 5 -> "5" лишається.
    expect(generated[0]!.ingredientCount).toBe(2);
  });
});

describe("toShoppingRecipe", () => {
  it("лишає лише title та ingredients: кроки й макроси списку покупок не потрібні", () => {
    expect(
      toShoppingRecipe({
        id: "a",
        title: "Борщ",
        ingredients: ["буряк"],
        steps: ["Зварити"],
        macros: { kcal: 300 },
      }),
    ).toEqual({ title: "Борщ", ingredients: ["буряк"] });
  });

  it("вкладається в стелі схеми сервера: назва ≤200, ≤50 інгредієнтів по ≤200", () => {
    const out = toShoppingRecipe({
      title: "Т".repeat(300),
      ingredients: Array.from({ length: 80 }, () => "і".repeat(300)),
    });
    expect(out.title).toHaveLength(200);
    expect(out.ingredients).toHaveLength(50);
    expect(out.ingredients.every((i) => i.length === 200)).toBe(true);
  });

  it("без назви й інгредієнтів не падає", () => {
    expect(toShoppingRecipe({})).toEqual({ title: "Рецепт", ingredients: [] });
    expect(toShoppingRecipe(null)).toEqual({
      title: "Рецепт",
      ingredients: [],
    });
  });
});

describe("pickSelectedRecipes", () => {
  const options = buildRecipeOptions(
    [saved("a", "А"), saved("b", "Б")],
    [{ id: "g", title: "В" }],
  );
  const all = [...options.saved, ...options.generated];

  it("віддає позначені в порядку переліку, а не в порядку позначення", () => {
    const picked = pickSelectedRecipes(
      all,
      new Set([all[2]!.key, all[0]!.key]),
    );
    expect(picked.map((o) => o.title)).toEqual(["А", "В"]);
  });

  it("ігнорує ключі, яких уже немає в переліку (рецепт видалили)", () => {
    expect(pickSelectedRecipes(all, new Set(["saved:gone"]))).toEqual([]);
  });

  it("не віддає більше стелі запиту", () => {
    const many = buildRecipeOptions(
      Array.from({ length: SHOPPING_RECIPES_MAX + 5 }, (_, i) =>
        saved(`s${i}`, `Назва ${String.fromCharCode(1040 + i)}`),
      ),
      [],
    ).saved;
    const picked = pickSelectedRecipes(many, new Set(many.map((o) => o.key)));
    expect(picked).toHaveLength(SHOPPING_RECIPES_MAX);
  });
});
