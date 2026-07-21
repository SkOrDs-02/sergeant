import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { createApiClient } from "@sergeant/api-client";
import { ApiClientProvider } from "@sergeant/api-client/react";
import {
  defaultNutritionPrefs,
  type NutritionLog,
  type NutritionPrefs,
} from "@sergeant/nutrition-domain";
import { router } from "expo-router";

import { Dashboard } from "../Dashboard";

jest.mock("../../hooks/useNutritionLog", () => ({
  useNutritionLog: jest.fn(),
}));
jest.mock("../../hooks/useNutritionPrefs", () => ({
  useNutritionPrefs: jest.fn(),
}));
jest.mock("../../hooks/useNutritionPantries", () => ({
  useNutritionPantries: jest.fn(),
}));
jest.mock("../../hooks/useWaterTracker", () => ({
  useWaterTracker: jest.fn(),
}));

import { useNutritionLog } from "../../hooks/useNutritionLog";
import { useNutritionPantries } from "../../hooks/useNutritionPantries";
import { useNutritionPrefs } from "../../hooks/useNutritionPrefs";
import { useWaterTracker } from "../../hooks/useWaterTracker";

const mockedLog = useNutritionLog as jest.MockedFunction<
  typeof useNutritionLog
>;
const mockedPrefs = useNutritionPrefs as jest.MockedFunction<
  typeof useNutritionPrefs
>;
const mockedPantries = useNutritionPantries as jest.MockedFunction<
  typeof useNutritionPantries
>;
const mockedWater = useWaterTracker as jest.MockedFunction<
  typeof useWaterTracker
>;

const addMeal = jest.fn();
const updatePrefs = jest.fn();

interface FetchCall {
  url: string;
  body: unknown;
}

function makePrefs(overrides: Partial<NutritionPrefs> = {}): NutritionPrefs {
  return { ...defaultNutritionPrefs(), ...overrides };
}

function createTestApiClient(
  responder: (call: FetchCall) => {
    ok: boolean;
    status: number;
    body: unknown;
  },
) {
  const calls: FetchCall[] = [];
  const client = createApiClient({
    baseUrl: "http://127.0.0.1",
    fetchImpl: (async (input: unknown, init?: RequestInit) => {
      const url = typeof input === "string" ? input : String(input);
      const rawBody = init?.body;
      const body = typeof rawBody === "string" ? JSON.parse(rawBody) : null;
      const call = { url, body };
      calls.push(call);
      const response = responder(call);
      return {
        ok: response.ok,
        status: response.status,
        headers: new Headers({ "content-type": "application/json" }),
        text: async () => JSON.stringify(response.body),
      } as Response;
    }) as typeof fetch,
  });
  return { client, calls };
}

function renderDashboard(
  client = createTestApiClient(() => ({
    ok: true,
    status: 200,
    body: { plan: { meals: [], totalKcal: 0, note: "" } },
  })).client,
) {
  return render(
    <ApiClientProvider client={client}>
      <Dashboard testID="nutrition-dashboard" onMealAdded={jest.fn()} />
    </ApiClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  const log: NutritionLog = {
    "2026-05-13": {
      meals: [
        {
          id: "m1",
          name: "Сніданок",
          mealType: "breakfast",
          label: "Сніданок",
          time: "08:00",
          macros: { kcal: 300, protein_g: 20, fat_g: 10, carbs_g: 35 },
          source: "manual",
          macroSource: "manual",
          amount_g: null,
          foodId: null,
        },
      ],
    },
  };
  mockedLog.mockReturnValue({
    nutritionLog: log,
    selectedDate: "2026-05-13",
    setSelectedDate: jest.fn(),
    addMeal,
    removeMeal: jest.fn(),
    updateMeal: jest.fn(),
    refresh: jest.fn(),
  });
  mockedPrefs.mockReturnValue({
    prefs: makePrefs(),
    setPrefs: jest.fn(),
    updatePrefs,
  });
  mockedPantries.mockReturnValue({
    pantries: [],
    activePantryId: "default",
    activePantry: { id: "default", name: "Комора", text: "", items: [] },
    pantryItems: [{ name: "яйця", qty: 6, unit: "шт", notes: null }],
    setActivePantryId: jest.fn(),
    addLine: jest.fn(),
    applyParsedItems: jest.fn(),
    removeItemAt: jest.fn(),
    restoreItemAt: jest.fn(),
    addPantry: jest.fn(),
    refresh: jest.fn(),
  });
  mockedWater.mockReturnValue({
    todayMl: 500,
    add: jest.fn(),
    reset: jest.fn(),
  });
});

describe("Dashboard", () => {
  it("renders summary cards and navigates through nutrition CTAs", () => {
    const { getByTestId, getByText, getByLabelText } = renderDashboard();

    expect(getByTestId("nutrition-today-card")).toBeTruthy();
    expect(getByText("0 прийомів їжі")).toBeTruthy();
    expect(getByTestId("nutrition-week-card")).toBeTruthy();
    expect(getByTestId("nutrition-water-card")).toBeTruthy();

    fireEvent.press(getByLabelText("Відкрити комору"));
    fireEvent.press(getByLabelText("AI-рецепти зі складу"));
    fireEvent.press(getByLabelText("Збережені рецепти"));

    expect(router.push).toHaveBeenCalledWith("/(tabs)/nutrition/pantry");
    expect(router.push).toHaveBeenCalledWith(
      "/(tabs)/nutrition/recipe/recommend",
    );
    expect(router.push).toHaveBeenCalledWith("/(tabs)/nutrition/saved-recipes");
  });

  it("fetches a day plan, adds a planned meal to the log, and regenerates one meal", async () => {
    mockedPrefs.mockReturnValue({
      prefs: makePrefs({
        dailyTargetKcal: 2000,
        dailyTargetProtein_g: 120,
        dailyTargetFat_g: 60,
        dailyTargetCarbs_g: 240,
      }),
      setPrefs: jest.fn(),
      updatePrefs,
    });
    const { client, calls } = createTestApiClient((call) => ({
      ok: true,
      status: 200,
      body: {
        plan: {
          totalKcal:
            call.body && "regenerateMealType" in (call.body as object)
              ? 450
              : 900,
          note: "Свіжий план",
          meals: [
            {
              type:
                call.body && "regenerateMealType" in (call.body as object)
                  ? "breakfast"
                  : "lunch",
              label: "Обід",
              name:
                call.body && "regenerateMealType" in (call.body as object)
                  ? "Оновлена вівсянка"
                  : "Боул з куркою",
              kcal: 450,
              protein_g: 35,
              fat_g: 12,
              carbs_g: 50,
            },
          ],
        },
      },
    }));

    const { getByTestId, findByText } = renderDashboard(client);

    await act(async () => {
      fireEvent.press(getByTestId("daily-plan-fetch-button"));
    });

    expect(await findByText("Боул з куркою")).toBeTruthy();
    expect(calls[0]?.body).toEqual(
      expect.objectContaining({
        pantry: [{ name: "яйця", qty: 6, unit: "шт", notes: null }],
        targets: {
          kcal: 2000,
          protein_g: 120,
          fat_g: 60,
          carbs_g: 240,
        },
        locale: "uk-UA",
      }),
    );

    fireEvent.press(getByTestId("daily-plan-meal-0-add"));
    expect(addMeal).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        mealType: "lunch",
        label: "Обід",
        name: "Боул з куркою",
        macroSource: "recipeAI",
        macros: {
          kcal: 450,
          protein_g: 35,
          fat_g: 12,
          carbs_g: 50,
        },
      }),
    );

    await act(async () => {
      fireEvent.press(getByTestId("daily-plan-meal-0-regen"));
    });

    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1]?.body).toEqual(
      expect.objectContaining({ regenerateMealType: "lunch" }),
    );
  });

  it("shows an inline day-plan error when the API rejects", async () => {
    const { client } = createTestApiClient(() => ({
      ok: false,
      status: 429,
      body: { error: "Too Many Requests" },
    }));
    const { getByTestId, findByTestId } = renderDashboard(client);

    await act(async () => {
      fireEvent.press(getByTestId("daily-plan-fetch-button"));
    });

    expect(
      (await findByTestId("nutrition-daily-plan-error")).props.children,
    ).toMatch(/AI-квоту/i);
  });
});
