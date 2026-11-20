// @vitest-environment jsdom
/**
 * Last validated: 2026-11-19
 * Status: Active
 * Улюблені (OD-27 Х-3 б): позначка на продукті й рецепті пише prefs
 * (`favoriteFoodIds`, `favoriteRecipeIds`), а видача ставить улюблені вгору.
 */
import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
} from "@testing-library/react";
import { useEffect, useState } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  defaultNutritionPrefs,
  type NutritionPrefs,
} from "@sergeant/nutrition-domain";

vi.mock("@shared/hooks/useCoarsePointer", () => ({
  useCoarsePointer: () => false,
}));

import {
  useFavoritesFirst,
  useNutritionFavorites,
} from "../../hooks/useNutritionFavorites";
import { PickedFoodCard } from "./PickedFoodCard";
import { RecipeLogSheet } from "./RecipeLogSheet";
import type { SavedRecipe } from "../../lib/recipeBook";

const latestPrefsRef = { current: null as null | NutritionPrefs };

function CardHarness({ initial = defaultNutritionPrefs() }) {
  const [prefs, setPrefs] = useState<NutritionPrefs>(initial);
  useEffect(() => {
    latestPrefsRef.current = prefs;
  });
  const favorites = useNutritionFavorites(prefs, setPrefs);
  const [grams, setGrams] = useState("100");
  return (
    <PickedFoodCard
      setForm={vi.fn()}
      pickedFood={{ id: "gen_banan", name: "Банан", per100: { kcal: 89 } }}
      pickedGrams={grams}
      setPickedGrams={setGrams}
      onChangeProduct={vi.fn()}
      favorites={favorites}
    />
  );
}

describe("позначка улюбленого продукту", () => {
  it("тап додає продукт у prefs і перемикає стан, другий тап прибирає", () => {
    render(<CardHarness />);
    const add = screen.getByRole("button", {
      name: "Додати в улюблені: Банан",
    });
    expect(add).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(add);
    expect(latestPrefsRef.current?.favoriteFoodIds).toEqual(["gen_banan"]);
    const remove = screen.getByRole("button", {
      name: "Прибрати з улюблених: Банан",
    });
    expect(remove).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(remove);
    expect(latestPrefsRef.current?.favoriteFoodIds).toEqual([]);
  });

  it("без `favorites` серця немає (редагування, інші входи)", () => {
    render(
      <PickedFoodCard
        setForm={vi.fn()}
        pickedFood={{ id: "gen_banan", name: "Банан" }}
        pickedGrams="100"
        setPickedGrams={vi.fn()}
        onChangeProduct={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: /улюблен/ })).toBeNull();
  });
});

describe("позначка улюбленого рецепта", () => {
  it("рецепт у кроці «скільки зʼїв» позначається і пише prefs", () => {
    const recipe = { id: "r1", title: "Омлет", macros: { kcal: 300 } };
    function Harness() {
      const [prefs, setPrefs] = useState(defaultNutritionPrefs());
      useEffect(() => {
        latestPrefsRef.current = prefs;
      });
      const favorites = useNutritionFavorites(prefs, setPrefs);
      return (
        <RecipeLogSheet
          recipe={recipe as unknown as SavedRecipe}
          mealType="breakfast"
          onClose={vi.fn()}
          onLog={vi.fn()}
          favorites={favorites}
        />
      );
    }
    render(<Harness />);
    fireEvent.click(
      screen.getByRole("button", { name: "Додати в улюблені: Омлет" }),
    );
    expect(latestPrefsRef.current?.favoriteRecipeIds).toEqual(["r1"]);
  });
});

describe("useFavoritesFirst", () => {
  it("улюблені вгору, без улюблених той самий масив", () => {
    const items = [{ id: "a" }, { id: "b" }];
    const { result, rerender } = renderHook(
      ({ ids }: { ids: ReadonlySet<string> | undefined }) =>
        useFavoritesFirst(items, ids),
      { initialProps: { ids: undefined as ReadonlySet<string> | undefined } },
    );
    expect(result.current).toBe(items);
    act(() => rerender({ ids: new Set(["b"]) }));
    expect(result.current.map((x) => x.id)).toEqual(["b", "a"]);
  });
});
