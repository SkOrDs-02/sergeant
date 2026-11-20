// @vitest-environment jsdom
/**
 * Last validated: 2026-11-19
 * Status: Active
 * Блок «Улюблені» на вкладці «Пошук» (OD-27 Х-3 б, рішення власника
 * 2026-11-19): згорнутий, нижче за «Нещодавні», перші 8 позначених продуктів
 * до набору запиту; тап веде тим самим шляхом, що хіт пошуку.
 */
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const favState = vi.hoisted(() => ({ foods: [] as unknown[] }));

vi.mock("../MyFoodsSheet", () => ({ MyFoodsSheet: () => null }));
vi.mock("../../hooks/useFavoriteFoods", () => ({
  useFavoriteFoods: () => favState.foods,
}));

import { makeFoodProduct, type FoodProduct } from "../../lib/foodDb/foodDb";
import { SearchTabPanel } from "./SearchTabPanel";

function food(id: string, name: string): FoodProduct {
  return makeFoodProduct({
    id,
    name,
    per100: { kcal: 100, protein_g: 1, fat_g: 1, carbs_g: 1 },
  });
}

type Props = ComponentProps<typeof SearchTabPanel>;

function props(overrides: Partial<Props["picker"]> = {}): Props {
  return {
    mealTemplates: [],
    setForm: vi.fn(),
    onTemplateSelected: vi.fn(),
    onEditTemplate: vi.fn(),
    quickChips: [
      {
        id: "quickchip:кава",
        label: "Кава",
        grams: 200,
        macros: { kcal: 5, protein_g: 0, fat_g: 0, carbs_g: 1 },
        source: "recent-meal",
        lastUsedAt: "2026-11-18",
      },
    ],
    onQuickAddMeal: vi.fn(),
    onQuickAdded: vi.fn(),
    pantryItems: [],
    sourcePick: {} as Props["sourcePick"],
    fromPantryItem: null,
    setFromPantryItem: vi.fn(),
    favorites: {
      foodIds: new Set(),
      recipeIds: new Set(),
      toggleFood: vi.fn(),
      toggleRecipe: vi.fn(),
    },
    picker: {
      foodQuery: "",
      setFoodQuery: vi.fn(),
      foodHits: [],
      offHits: [],
      foodBusy: false,
      offBusy: false,
      foodErr: "",
      setPickedFood: vi.fn(),
      setPickedGrams: vi.fn(),
      ...overrides,
    },
  };
}

const section = () => screen.queryByRole("button", { name: /^Улюблені/ });

beforeEach(() => {
  localStorage.clear();
  favState.foods = [];
});

describe("блок «Улюблені» на вкладці «Пошук»", () => {
  it("без позначених продуктів блоку немає зовсім", () => {
    render(<SearchTabPanel {...props()} />);
    expect(section()).toBeNull();
    expect(screen.queryByText("Улюблені")).toBeNull();
  });

  it("є з позначеними, згорнутий і нижче за «Нещодавні»", () => {
    favState.foods = [food("gen_banan", "Банан")];
    render(<SearchTabPanel {...props()} />);
    const header = section();
    expect(header).not.toBeNull();
    expect(header).toHaveAttribute("aria-expanded", "false");
    const recent = screen.getByRole("button", { name: /^Нещодавні прийоми/ });
    expect(
      recent.compareDocumentPosition(header!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("показує не більше 8 у порядку позначення і каже, де решта", () => {
    favState.foods = Array.from({ length: 10 }, (_, i) =>
      food(`f${i}`, `Продукт ${i}`),
    );
    render(<SearchTabPanel {...props()} />);
    fireEvent.click(section()!);
    const list = screen.getByRole("list", { name: "Улюблені продукти" });
    const names = within(list)
      .getAllByRole("button")
      .map((b) => b.textContent ?? "");
    expect(names).toHaveLength(8);
    expect(names[0]).toContain("Продукт 0");
    expect(names[7]).toContain("Продукт 7");
    expect(
      screen.getByText(
        "Решту улюблених знайдеш пошуком: вони там стоять першими.",
      ),
    ).toBeInTheDocument();
  });

  it("до 8 підказки про решту немає", () => {
    favState.foods = [food("gen_banan", "Банан")];
    render(<SearchTabPanel {...props()} />);
    fireEvent.click(section()!);
    expect(screen.queryByText(/Решту улюблених/)).toBeNull();
  });

  it("тап відкриває картку продукту з побутовою порцією, нічого не пише", () => {
    favState.foods = [food("gen_iaitse-kuriache", "Яйце куряче")];
    const p = props();
    render(<SearchTabPanel {...p} />);
    fireEvent.click(section()!);
    fireEvent.click(screen.getByRole("button", { name: /Яйце куряче/ }));
    expect(p.picker.setPickedFood).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "gen_iaitse-kuriache",
        portions: [expect.objectContaining({ id: "hh_egg", grams: 50 })],
      }),
    );
    expect(p.picker.setPickedGrams).toHaveBeenCalledWith("50");
    expect(p.onQuickAddMeal).not.toHaveBeenCalled();
  });

  it("з набраним запитом блок ховається", () => {
    favState.foods = [food("gen_banan", "Банан")];
    render(<SearchTabPanel {...props({ foodQuery: "бан" })} />);
    expect(section()).toBeNull();
  });
});
