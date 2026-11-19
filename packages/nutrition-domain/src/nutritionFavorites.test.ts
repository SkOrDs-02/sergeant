import { describe, expect, it } from "vitest";

import {
  FAVORITES_MAX,
  normalizeFavoriteIds,
  sortFavoritesFirst,
  toggleFavoriteId,
} from "./nutritionFavorites.js";
import { normalizeNutritionPrefs } from "./nutritionPrefs.js";

describe("normalizeFavoriteIds", () => {
  it("лишає непорожні рядки без дублів і обрізає пробіли", () => {
    expect(normalizeFavoriteIds([" a ", "b", "a", "", 3, null, "c"])).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("не масив — порожньо; понад стелю обрізається", () => {
    expect(normalizeFavoriteIds("a")).toEqual([]);
    const many = Array.from({ length: FAVORITES_MAX + 5 }, (_, i) => `id${i}`);
    expect(normalizeFavoriteIds(many)).toHaveLength(FAVORITES_MAX);
  });
});

describe("toggleFavoriteId", () => {
  it("додає на початок і прибирає наявний", () => {
    expect(toggleFavoriteId(["a"], "b")).toEqual(["b", "a"]);
    expect(toggleFavoriteId(["b", "a"], "b")).toEqual(["a"]);
  });

  it("порожній id нічого не змінює; переповнення витісняє найстаріший", () => {
    expect(toggleFavoriteId(["a"], "  ")).toEqual(["a"]);
    const full = Array.from({ length: FAVORITES_MAX }, (_, i) => `id${i}`);
    const next = toggleFavoriteId(full, "new");
    expect(next).toHaveLength(FAVORITES_MAX);
    expect(next[0]).toBe("new");
    expect(next).not.toContain(`id${FAVORITES_MAX - 1}`);
  });
});

describe("sortFavoritesFirst", () => {
  it("улюблені вгору, решта порядку не змінюється", () => {
    const items = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
    expect(
      sortFavoritesFirst(items, ["c", "a"], (x) => x.id).map((x) => x.id),
    ).toEqual(["a", "c", "b", "d"]);
  });

  it("без улюблених повертає той самий масив", () => {
    const items = [{ id: "a" }];
    expect(sortFavoritesFirst(items, [], (x) => x.id)).toBe(items);
  });
});

describe("normalizeNutritionPrefs: улюблені", () => {
  it("чистить списки улюблених, якщо вони є", () => {
    const p = normalizeNutritionPrefs({
      favoriteFoodIds: ["gen_banan", "gen_banan", 5],
      favoriteRecipeIds: "x",
    });
    expect(p.favoriteFoodIds).toEqual(["gen_banan"]);
    expect(p.favoriteRecipeIds).toEqual([]);
  });

  it("старі prefs без улюблених лишаються без цих ключів", () => {
    const p = normalizeNutritionPrefs({ goal: "balanced" });
    expect("favoriteFoodIds" in p).toBe(false);
    expect("favoriteRecipeIds" in p).toBe(false);
  });
});
