/**
 * Tests for the mobile RecipeRecommender page (web parity with the
 * generator section of `apps/web/.../components/RecipesCard.tsx`).
 *
 * Covers:
 *  - press «Запропонувати» → `nutrition.recommendRecipes` called with the
 *    pantry + preferences payload → recipes render, each tagged with a
 *    stable `rcp_ai_*` id;
 *  - «Зберегти» → `upsertSavedRecipe` dispatches the recipe;
 *  - «+ У журнал» → `addMeal` called with the recipe macros;
 *  - 429 → inline quota error rendered, no crash.
 *
 * The three nutrition hooks (`useNutritionPrefs` / `useNutritionPantries` /
 * `useNutritionLog`) are mocked directly — they carry SQLite-warm-cache
 * deps irrelevant to the page logic under test.
 */
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiClientProvider, apiQueryKeys } from "@sergeant/api-client/react";
import { createApiClient } from "@sergeant/api-client";

import { ToastProvider } from "@/components/ui/Toast";
import { _getMMKVInstance } from "@/lib/storage";

import { RecipeRecommender } from "../RecipeRecommender";

jest.mock("../../hooks/useNutritionPrefs", () => ({
  useNutritionPrefs: jest.fn(),
}));
jest.mock("../../hooks/useNutritionPantries", () => ({
  useNutritionPantries: jest.fn(),
}));
jest.mock("../../hooks/useNutritionLog", () => ({
  useNutritionLog: jest.fn(),
}));
const mockUpsert = jest.fn();
jest.mock("../../lib/recipeBookStore", () => ({
  upsertSavedRecipe: (...args: unknown[]) => mockUpsert(...args),
}));

import { useNutritionPrefs } from "../../hooks/useNutritionPrefs";
import { useNutritionPantries } from "../../hooks/useNutritionPantries";
import { useNutritionLog } from "../../hooks/useNutritionLog";

const mockedPrefs = useNutritionPrefs as jest.MockedFunction<
  typeof useNutritionPrefs
>;
const mockedPantries = useNutritionPantries as jest.MockedFunction<
  typeof useNutritionPantries
>;
const mockedLog = useNutritionLog as jest.MockedFunction<
  typeof useNutritionLog
>;

const mockAddMeal = jest.fn();

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

interface FetchCall {
  url: string;
  body: unknown;
}

function createTestApiClient(
  responder: (call: FetchCall) => {
    ok: boolean;
    status: number;
    body: unknown;
  },
): { client: ReturnType<typeof createApiClient>; calls: FetchCall[] } {
  const calls: FetchCall[] = [];
  const client = createApiClient({
    baseUrl: "http://127.0.0.1",
    fetchImpl: (async (input: unknown, init?: RequestInit) => {
      const url = typeof input === "string" ? input : String(input);
      let parsedBody: unknown = null;
      const rawBody = init?.body;
      if (typeof rawBody === "string") {
        try {
          parsedBody = JSON.parse(rawBody);
        } catch {
          parsedBody = rawBody;
        }
      }
      const call = { url, body: parsedBody };
      calls.push(call);
      const r = responder(call);
      return {
        ok: r.ok,
        status: r.status,
        headers: new Headers({ "content-type": "application/json" }),
        text: async () => JSON.stringify(r.body),
      } as Response;
    }) as typeof fetch,
  });
  return { client, calls };
}

function renderPage(
  client: ReturnType<typeof createApiClient>,
): ReturnType<typeof render> {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity, gcTime: Infinity },
      mutations: { retry: false },
    },
  });
  queryClient.setQueryData(apiQueryKeys.me.current(), testUser);
  return render(
    <ApiClientProvider client={client}>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <RecipeRecommender testID="recipe-recommender" />
        </ToastProvider>
      </QueryClientProvider>
    </ApiClientProvider>,
  );
}

const SAMPLE_RESPONSE = {
  recipes: [
    {
      title: "Омлет з овочами",
      timeMinutes: 15,
      servings: 2,
      ingredients: ["3 яйця", "перець", "цибуля"],
      steps: ["Збити яйця", "Посмажити з овочами"],
      tips: ["Подавай теплим"],
      macros: { kcal: 320, protein_g: 22, fat_g: 20, carbs_g: 6 },
    },
  ],
  rawText: null,
};

beforeEach(() => {
  _getMMKVInstance().clearAll();
  mockedPrefs.mockReset();
  mockedPantries.mockReset();
  mockedLog.mockReset();
  mockUpsert.mockReset();
  mockAddMeal.mockReset();

  mockedPrefs.mockReturnValue({
    prefs: {
      goal: "balanced",
      servings: 2,
      timeMinutes: 25,
      exclude: "",
    } as never,
    setPrefs: jest.fn(),
    updatePrefs: jest.fn(),
  });
  mockedPantries.mockReturnValue({
    pantries: [],
    activePantryId: "default",
    activePantry: {
      id: "default",
      name: "Комора",
      items: [{ name: "яйця", qty: 6, unit: "шт", notes: null }],
      text: "",
    },
    setActivePantryId: jest.fn(),
    addLine: jest.fn(),
    applyParsedItems: jest.fn(),
    removeItemAt: jest.fn(),
    restoreItemAt: jest.fn(),
    addPantry: jest.fn(),
    refresh: jest.fn(),
  });
  mockedLog.mockReturnValue({
    nutritionLog: {},
    selectedDate: "2026-05-29",
    setSelectedDate: jest.fn(),
    addMeal: mockAddMeal,
    removeMeal: jest.fn(),
    updateMeal: jest.fn(),
    refresh: jest.fn(),
  });
});

describe("RecipeRecommender", () => {
  it("calls recommendRecipes with pantry + preferences and renders recipes", async () => {
    const { client, calls } = createTestApiClient(() => ({
      ok: true,
      status: 200,
      body: SAMPLE_RESPONSE,
    }));
    const { getByTestId, findByText } = renderPage(client);

    await act(async () => {
      fireEvent.press(getByTestId("recipe-recommend"));
    });

    await waitFor(() => {
      if (calls.length === 0) throw new Error("no calls yet");
    });

    const call = calls.find((c) =>
      c.url.includes("nutrition/recommend-recipes"),
    );
    expect(call).toBeDefined();
    const body = call!.body as {
      pantry?: unknown[];
      preferences?: { goal?: string; locale?: string };
    };
    expect(Array.isArray(body.pantry)).toBe(true);
    expect(body.pantry).toHaveLength(1);
    expect(body.preferences?.goal).toBe("balanced");
    expect(body.preferences?.locale).toBe("uk-UA");

    expect(await findByText("Омлет з овочами")).toBeTruthy();
  });

  it("saves a recipe via upsertSavedRecipe with a stable id", async () => {
    const { client } = createTestApiClient(() => ({
      ok: true,
      status: 200,
      body: SAMPLE_RESPONSE,
    }));
    const { getByTestId, getByText, findByText } = renderPage(client);

    await act(async () => {
      fireEvent.press(getByTestId("recipe-recommend"));
    });
    await findByText("Омлет з овочами");

    await act(async () => {
      fireEvent.press(getByText("Зберегти"));
    });
    expect(mockUpsert).toHaveBeenCalledTimes(1);
    const saved = mockUpsert.mock.calls[0]![0] as { id: string; title: string };
    expect(saved.id).toMatch(/^rcp_ai_/);
    expect(saved.title).toBe("Омлет з овочами");
  });

  it("adds a recipe to the log with its macros", async () => {
    const { client } = createTestApiClient(() => ({
      ok: true,
      status: 200,
      body: SAMPLE_RESPONSE,
    }));
    const { getByTestId, getByText, findByText } = renderPage(client);

    await act(async () => {
      fireEvent.press(getByTestId("recipe-recommend"));
    });
    await findByText("Омлет з овочами");

    await act(async () => {
      fireEvent.press(getByText("+ У журнал"));
    });
    expect(mockAddMeal).toHaveBeenCalledTimes(1);
    const [, meal] = mockAddMeal.mock.calls[0]!;
    expect(meal.name).toBe("Омлет з овочами");
    expect(meal.macros.kcal).toBe(320);
    expect(meal.macroSource).toBe("recipeAI");
  });

  it("shows an inline quota error on 429", async () => {
    const { client } = createTestApiClient(() => ({
      ok: false,
      status: 429,
      body: { error: "Too Many Requests" },
    }));
    const { getByTestId, findByTestId } = renderPage(client);

    await act(async () => {
      fireEvent.press(getByTestId("recipe-recommend"));
    });

    const errNode = await findByTestId("recipe-recommend-error");
    expect(errNode.props.children).toMatch(/AI-квоту/i);
  });
});
