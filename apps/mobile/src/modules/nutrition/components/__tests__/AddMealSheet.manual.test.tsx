import { act, fireEvent, render } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createApiClient } from "@sergeant/api-client";
import { ApiClientProvider, apiQueryKeys } from "@sergeant/api-client/react";
import { router } from "expo-router";
import type { ComponentProps } from "react";

import { emitNutritionScanPrefill } from "../../lib/nutritionScanBridge";
import { AddMealSheet, type MealSavePayload } from "../AddMealSheet";

jest.mock("../../lib/pickImageJpegForNutritionApi", () => ({
  pickResizeAndReadBase64Jpeg: jest.fn(),
  captureResizeAndReadBase64Jpeg: jest.fn(),
}));

const testUser = {
  user: {
    id: "test-user",
    email: "test@example.com",
    name: "Test User",
    image: null,
    emailVerified: true,
    createdAt: "2026-04-21T00:00:00.000Z",
  },
};

function renderSheet(
  props: {
    onSave?: (meal: MealSavePayload) => void;
    initialMeal?: ComponentProps<typeof AddMealSheet>["initialMeal"];
    open?: boolean;
  } = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  queryClient.setQueryData(apiQueryKeys.me.current(), testUser);
  const client = createApiClient({
    baseUrl: "http://127.0.0.1",
    fetchImpl: jest.fn() as unknown as typeof fetch,
  });

  return render(
    <ApiClientProvider client={client}>
      <QueryClientProvider client={queryClient}>
        <AddMealSheet
          open={props.open ?? true}
          onClose={jest.fn()}
          onSave={props.onSave ?? jest.fn()}
          initialMeal={props.initialMeal}
        />
      </QueryClientProvider>
    </ApiClientProvider>,
  );
}

describe("AddMealSheet manual flow", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("opens barcode scanner with the add-meal return target", () => {
    const { getByTestId } = renderSheet();

    fireEvent.press(getByTestId("add-meal-open-barcode-scan"));

    expect(router.push).toHaveBeenCalledWith({
      pathname: "/(tabs)/nutrition/scan",
      params: { returnTo: "addMeal" },
    });
  });

  it("validates required name and saves a manual meal payload", async () => {
    const onSave = jest.fn();
    const { getByTestId, getByLabelText, findByTestId, queryByTestId } =
      renderSheet({ onSave });

    fireEvent.press(getByTestId("add-meal-source-manual"));
    fireEvent.press(getByTestId("add-meal-save"));

    expect((await findByTestId("add-meal-fill-err")).props.children).toBe(
      "Введіть назву страви.",
    );

    fireEvent.changeText(getByTestId("add-meal-name"), " Сирники ");
    fireEvent.changeText(getByLabelText("Ккал"), "420");
    fireEvent.changeText(getByLabelText("Білки г"), "24");
    fireEvent.changeText(getByLabelText("Жири г"), "16");
    fireEvent.changeText(getByLabelText("Вуглев. г"), "42");
    fireEvent.press(getByLabelText("Обід"));
    fireEvent.press(getByTestId("add-meal-save"));

    expect(queryByTestId("add-meal-fill-err")).toBeNull();
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        mealType: "lunch",
        label: "Обід",
        name: "Сирники",
        source: "manual",
        macroSource: "manual",
        macros: {
          kcal: 420,
          protein_g: 24,
          fat_g: 16,
          carbs_g: 42,
        },
      }),
    );
  });

  it("rejects negative or non-finite macro values", async () => {
    const onSave = jest.fn();
    const { getByTestId, getByLabelText, findByTestId } = renderSheet({
      onSave,
    });

    fireEvent.press(getByTestId("add-meal-source-manual"));
    fireEvent.changeText(getByTestId("add-meal-name"), "Каша");
    fireEvent.changeText(getByLabelText("Ккал"), "-1");
    fireEvent.press(getByTestId("add-meal-save"));

    expect((await findByTestId("add-meal-fill-err")).props.children).toBe(
      "Некоректне значення КБЖВ.",
    );
    expect(onSave).not.toHaveBeenCalled();
  });

  it("prefills scanned product data while the sheet is open", async () => {
    const { findByDisplayValue, findByTestId } = renderSheet();

    await act(async () => {
      emitNutritionScanPrefill({
        barcode: "4820000000000",
        partial: true,
        name: "Йогурт",
        kcal: "120",
        protein_g: "5",
        fat_g: "3",
        carbs_g: "18",
        err: "",
      });
    });

    expect(await findByDisplayValue("Йогурт")).toBeTruthy();
    expect(await findByDisplayValue("120")).toBeTruthy();
    expect((await findByTestId("add-meal-fill-err")).props.children).toMatch(
      /часткові дані/i,
    );
  });

  it("opens an existing meal directly on the fill step and preserves its id", () => {
    const onSave = jest.fn();
    const initialMeal = {
      id: "meal_existing",
      name: "Омлет",
      mealType: "dinner" as const,
      time: "19:30",
      macros: { kcal: 330, protein_g: 22, fat_g: 20, carbs_g: 5 },
    };
    const { getByDisplayValue, getByTestId, queryByTestId, rerender } =
      renderSheet({
        onSave,
        initialMeal,
        open: false,
      });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    queryClient.setQueryData(apiQueryKeys.me.current(), testUser);
    const client = createApiClient({
      baseUrl: "http://127.0.0.1",
      fetchImpl: jest.fn() as unknown as typeof fetch,
    });

    rerender(
      <ApiClientProvider client={client}>
        <QueryClientProvider client={queryClient}>
          <AddMealSheet
            open
            onClose={jest.fn()}
            onSave={onSave}
            initialMeal={initialMeal}
          />
        </QueryClientProvider>
      </ApiClientProvider>,
    );

    expect(queryByTestId("add-meal-source-manual")).toBeNull();
    expect(getByDisplayValue("Омлет")).toBeTruthy();
    expect(getByDisplayValue("330")).toBeTruthy();

    fireEvent.press(getByTestId("add-meal-save"));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "meal_existing",
        mealType: "dinner",
        label: "Вечеря",
        name: "Омлет",
      }),
    );
  });
});
