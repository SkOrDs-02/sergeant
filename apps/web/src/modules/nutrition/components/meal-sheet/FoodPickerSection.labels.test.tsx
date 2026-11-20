// @vitest-environment jsdom
/**
 * Last validated: 2026-11-17
 * Status: Active
 *
 * Підпис джерела рядка пошуку мусить казати, звідки число: вбудована
 * базова їжа — не «Мій продукт», а базова їжа з сервера (`gen_…`) — не
 * «USDA» (сервер підписує її `source: "usda"`, бо енум контракту ширшим
 * не став). Справжній `FoodHitRow`, без моків.
 */
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { FoodSearchProduct } from "@shared/api";
import type { FoodProduct } from "../../lib/foodDb/foodDb";
import { FoodPickerSection } from "./FoodPickerSection";

const per100 = { kcal: 15, protein_g: 1, fat_g: 0, carbs_g: 3 };

function local(id: string, name: string, origin?: "user" | "seed") {
  return {
    id,
    name,
    brand: "",
    norm: name.toLowerCase(),
    defaultGrams: 100,
    per100,
    portions: [],
    ...(origin ? { origin } : {}),
    updatedAt: 1,
  } as FoodProduct;
}

function remote(id: string, name: string, source: "off" | "usda") {
  return {
    id,
    name,
    brand: null,
    source,
    per100,
    defaultGrams: 100,
  } as FoodSearchProduct;
}

function badgeOf(name: string): string | null {
  const row = screen.getByRole("button", { name: new RegExp(name) });
  return within(row).queryByTestId("food-source-badge")?.textContent ?? null;
}

describe("FoodPickerSection — підпис джерела", () => {
  it("розрізняє свій продукт, базову їжу і зовнішні бази", () => {
    render(
      <FoodPickerSection
        foodQuery="огірок"
        setFoodQuery={vi.fn()}
        foodHits={[
          local("food_1", "Огірок мамин", "user"),
          local("gen_kabachok", "Кабачок", "seed"),
        ]}
        offHits={[
          remote("gen_patyson", "Патисон", "usda"),
          remote("usda_11205", "Cucumber raw", "usda"),
          remote("off_482", "Огірки мариновані", "off"),
        ]}
        foodBusy={false}
        offBusy={false}
        foodErr=""
        setPickedFood={vi.fn()}
        setPickedGrams={vi.fn()}
      />,
    );
    expect(badgeOf("Огірок мамин")).toBe("Мій продукт");
    expect(badgeOf("Кабачок")).toBe("Базовий продукт");
    expect(badgeOf("Патисон")).toBe("Базовий продукт");
    expect(badgeOf("Cucumber raw")).toBe("USDA");
    expect(badgeOf("Огірки мариновані")).toBe("Open Food Facts");
  });
});
