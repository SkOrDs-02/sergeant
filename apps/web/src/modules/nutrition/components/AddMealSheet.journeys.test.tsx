// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ComponentProps } from "react";
import type { Meal } from "@sergeant/nutrition-domain";
import type { NutritionPhotoItem, NutritionPhotoResult } from "@shared/api";
import { AddMealSheet } from "./AddMealSheet";
import { Sheet } from "@shared/components/ui/Sheet";
import { nutritionKeys } from "@shared/lib/api/queryKeys";

const { product, search } = vi.hoisted(() => {
  const product = {
    id: "journey-product",
    name: "Йогурт",
    brand: "",
    norm: "йогурт",
    defaultGrams: 100,
    per100: { kcal: 100, protein_g: 5, fat_g: 2, carbs_g: 10 },
    portions: [],
    updatedAt: 1,
  };
  return {
    product,
    search: {
      foodHits: [product],
      offHits: [],
      foodBusy: false,
      offBusy: false,
      searchSettled: true,
      foodErr: "",
      setFoodErr: vi.fn(),
    },
  };
});

// Keep the actual source chooser, linked food controls and MacrosEditor.
// Only the external catalogue/photo/voice boundaries are replaced.
vi.mock("../lib/foodDb/foodDb", async (original) => ({
  ...(await original<typeof import("../lib/foodDb/foodDb")>()),
  ensureSeedFoods: vi.fn(async () => {}),
  getFoodById: vi.fn(async () => product),
  lookupFoodByBarcode: vi.fn(async () => null),
}));
vi.mock("./meal-sheet/useFoodSearch", () => ({ useFoodSearch: () => search }));
vi.mock("./BarcodeScanner", () => ({
  BarcodeScanner: ({ onDetected }: { onDetected: (code: string) => void }) => (
    <Sheet open onClose={() => {}} title="Сканер" zIndex={140}>
      <button onClick={() => onDetected("4820000000000")}>
        Зчитати невідомий штрихкод
      </button>
    </Sheet>
  ),
}));
vi.mock("@shared/components/ui/VoiceMicButton", () => ({
  VoiceMicButton: ({
    onResult,
    label,
  }: {
    onResult: (text: string) => void;
    label: string;
  }) => (
    <button
      type="button"
      aria-label={label}
      onClick={() => onResult("омлет 500 ккал")}
    >
      mic
    </button>
  ),
}));
vi.mock("./meal-sheet/PhotoStep", () => ({
  PhotoStep: ({
    onApply,
  }: {
    onApply: (result: NutritionPhotoResult, file: null) => void;
  }) => {
    const [items, setItems] = useState<NutritionPhotoItem[]>([
      {
        name: "Борщ",
        macros: { kcal: 220, protein_g: 14, fat_g: 8, carbs_g: 20 },
        gramsApprox: 300,
        confidence: 0.9,
      },
      {
        name: "Хліб",
        macros: { kcal: 60, protein_g: 4, fat_g: 1, carbs_g: 12 },
        gramsApprox: 30,
        confidence: 0.9,
      },
    ]);
    return (
      <div>
        <button onClick={() => setItems((previous) => previous.slice(0, 1))}>
          Прибрати хліб з фото
        </button>
        <button
          onClick={() =>
            onApply(
              {
                dishName: "Обід",
                items,
                macros: { kcal: 280, protein_g: 18, fat_g: 9, carbs_g: 32 },
              } as NutritionPhotoResult,
              null,
            )
          }
        >
          Застосувати фото
        </button>
      </div>
    );
  },
}));

const original: Meal = {
  id: "existing-meal",
  name: "Обід",
  time: "12:00",
  mealType: "lunch",
  label: "Обід",
  macros: { kcal: 150.5, protein_g: 7.5, fat_g: 3, carbs_g: 15 },
  source: "manual",
  macroSource: "productDb",
  foodId: product.id,
  amount_g: 150.5,
};

function renderJourney(
  props: Partial<ComponentProps<typeof AddMealSheet>> = {},
) {
  const onSave = vi.fn();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  // Cached not-found result keeps the actual barcode query path deterministic.
  client.setQueryData(nutritionKeys.barcode("4820000000000"), null);
  const view = render(
    <QueryClientProvider client={client}>
      <AddMealSheet open onClose={vi.fn()} onSave={onSave} {...props} />
    </QueryClientProvider>,
  );
  return { ...view, onSave };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AddMealSheet — complete edit and photo journeys", () => {
  it("labels the existing-meal editor as editing throughout product replacement", async () => {
    renderJourney({ initialMeal: original });
    await screen.findByRole("button", { name: "Обрати інший продукт" });
    expect(
      screen.getByRole("dialog", { name: "Редагувати прийом їжі" }),
    ).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", { name: "Обрати інший продукт" }),
    );
    expect(
      screen.getByRole("dialog", { name: "Редагувати прийом їжі" }),
    ).toBeVisible();
  });

  it("keeps an unknown barcode replacement within single-meal paths", async () => {
    renderJourney({ initialMeal: original });
    await screen.findByRole("button", { name: "Обрати інший продукт" });
    fireEvent.click(
      screen.getByRole("button", { name: "Обрати інший продукт" }),
    );
    const chooser = screen.getByRole("navigation", {
      name: "Спосіб додавання їжі",
    });
    fireEvent.click(within(chooser).getByRole("button", { name: "Штрихкод" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Зчитати невідомий штрихкод" }),
    );
    await screen.findByText("Продукт не знайдено");
    expect(
      screen.queryByRole("button", { name: "Сфотографувати страву" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ввести вручну" }));
    expect(screen.getByRole("button", { name: /За всю порцію/ })).toBeVisible();
  });

  it("retains the photo fallback for unknown barcodes of a new meal", async () => {
    renderJourney({ initialSourceTab: "scan" });
    fireEvent.click(
      await screen.findByRole("button", { name: "Зчитати невідомий штрихкод" }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Сфотографувати страву" }),
    );
    expect(
      screen.getByRole("button", { name: "Застосувати фото" }),
    ).toBeVisible();
  });

  it("allows replacing an existing linked product and saves one existing row", async () => {
    const { onSave } = renderJourney({ initialMeal: original });
    await screen.findByRole("button", { name: "Обрати інший продукт" });
    fireEvent.click(
      screen.getByRole("button", { name: "Обрати інший продукт" }),
    );
    const chooser = screen.getByRole("navigation", {
      name: "Спосіб додавання їжі",
    });
    expect(
      within(chooser).queryByRole("button", { name: "Фото страви" }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      within(chooser).getByRole("button", { name: "Пошук продукту" }),
    );
    fireEvent.click(screen.getByRole("button", { name: /Йогурт/ }));
    fireEvent.click(screen.getByRole("button", { name: "Зберегти зміни" }));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0]![0]).toMatchObject({
      id: original.id,
      foodId: product.id,
      macroSource: "productDb",
    });
  });

  it("preserves fractional grams and existing macros on an untouched edit", async () => {
    const { onSave } = renderJourney({ initialMeal: original });
    await screen.findByRole("button", { name: "Обрати інший продукт" });
    fireEvent.click(screen.getByRole("button", { name: "Зберегти зміни" }));
    expect(onSave.mock.calls[0]![0]).toMatchObject({
      amount_g: 150.5,
      macros: original.macros,
    });
  });

  it.each(["photoAI", "recipeAI", "recipe"] as const)(
    "retains %s provenance when only the name changes",
    (macroSource) => {
      const meal = {
        ...original,
        foodId: null,
        source: "photo" as const,
        macroSource,
        demo: true as const,
      };
      const { onSave } = renderJourney({ initialMeal: meal });
      fireEvent.change(screen.getByRole("textbox", { name: "Назва страви" }), {
        target: { value: "Інша назва" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Зберегти зміни" }));
      expect(onSave.mock.calls[0]![0]).toMatchObject({
        id: meal.id,
        name: "Інша назва",
        source: "photo",
        macroSource,
        demo: true,
      });
    },
  );

  it("explicitly unlinks the original product after confirming a manual macro edit", async () => {
    const { onSave } = renderJourney({ initialMeal: original });
    await screen.findByRole("button", { name: "Обрати інший продукт" });
    fireEvent.change(screen.getByRole("textbox", { name: "Ккал" }), {
      target: { value: "500" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Редагувати вручну" }));
    fireEvent.click(screen.getByRole("button", { name: "Зберегти зміни" }));
    expect(onSave.mock.calls[0]![0]).toMatchObject({
      id: original.id,
      foodId: null,
      macroSource: "manual",
      macros: { kcal: 500 },
    });
  });

  it("keeps canceling a replacement draft from mutating the saved meal", async () => {
    const onClose = vi.fn();
    const { onSave } = renderJourney({ initialMeal: original, onClose });
    await screen.findByRole("button", { name: "Обрати інший продукт" });
    fireEvent.click(
      screen.getByRole("button", { name: "Обрати інший продукт" }),
    );
    const chooser = screen.getByRole("navigation", {
      name: "Спосіб додавання їжі",
    });
    fireEvent.click(
      within(chooser).getByRole("button", { name: "Ввести вручну" }),
    );
    fireEvent.click(screen.getByRole("button", { name: /За всю порцію/ }));
    fireEvent.click(screen.getByRole("button", { name: "Скасувати" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
    expect(original.foodId).toBe(product.id);
  });

  it("marks spoken macro edits of an AI meal as manual", () => {
    const { onSave } = renderJourney({
      initialMeal: {
        ...original,
        foodId: null,
        source: "photo",
        macroSource: "photoAI",
      },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Голосовий ввід страви" }),
    );
    expect(screen.getByRole("textbox", { name: "Ккал" })).toHaveValue("500");
    fireEvent.click(screen.getByRole("button", { name: "Зберегти зміни" }));
    expect(onSave.mock.calls[0]![0]).toMatchObject({
      id: original.id,
      foodId: null,
      macroSource: "manual",
      macros: { kcal: 500 },
    });
  });

  it("offers whole-meal voice entry only after explicitly unlinking a product", async () => {
    const { onSave } = renderJourney({ initialMeal: original });
    await screen.findByRole("button", { name: "Обрати інший продукт" });
    expect(
      screen.queryByRole("button", { name: "Голосовий ввід страви" }),
    ).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Ккал" }), {
      target: { value: "400" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Редагувати вручну" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Голосовий ввід страви" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Зберегти зміни" }));
    expect(onSave.mock.calls[0]![0]).toMatchObject({
      id: original.id,
      foodId: null,
      macroSource: "manual",
      macros: { kcal: 500 },
    });
  });

  it("shows photo items as read-only and returns to the retained item editor", async () => {
    const { onSave } = renderJourney({ initialStep: "photo" });
    fireEvent.click(screen.getByRole("button", { name: "Застосувати фото" }));
    expect(
      screen.queryByRole("textbox", { name: "Ккал" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("textbox", { name: "Назва страви" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Борщ")).toBeVisible();
    expect(screen.getByText("Хліб")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Змінити позиції" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Прибрати хліб з фото" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Застосувати фото" }));
    expect(screen.queryByText("Хліб")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Додати прийом" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0]![0]).toMatchObject({
      name: "Борщ",
      macros: { kcal: 220 },
      source: "photo",
      macroSource: "photoAI",
    });
  });
});
