/**
 * Tests for the mobile Shopping screen AI-generation flow (web parity
 * with `apps/web/.../components/ShoppingListCard.tsx`).
 *
 * Covers:
 *  - empty saved-recipes list ⇒ "Згенерувати" CTA disabled;
 *  - with ≥1 saved recipe ⇒ press CTA → `nutrition.shoppingList` called
 *    with `recipes` + `pantryItems` payload → list renders;
 *  - idempotency: рерун із тим же respond не дублює позиції;
 *  - API error ⇒ inline error rendered, no crash.
 *
 * `useSavedRecipesList`/`useNutritionPantries` хуки змокані напряму —
 * вони мають SQLite-warm-cache залежності, не потрібні для перевірки
 * UI-логіки сторінки.
 */
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiClientProvider, apiQueryKeys } from "@sergeant/api-client/react";
import { createApiClient } from "@sergeant/api-client";

import { ToastProvider } from "@/components/ui/Toast";
import { _getMMKVInstance } from "@/lib/storage";

import { Shopping } from "../Shopping";

jest.mock("../../hooks/useSavedRecipesList", () => ({
  useSavedRecipesList: jest.fn(),
}));

jest.mock("../../hooks/useNutritionPantries", () => ({
  useNutritionPantries: jest.fn(),
}));

import { useSavedRecipesList } from "../../hooks/useSavedRecipesList";
import { useNutritionPantries } from "../../hooks/useNutritionPantries";

type MockedSavedRecipes = jest.MockedFunction<typeof useSavedRecipesList>;
type MockedPantries = jest.MockedFunction<typeof useNutritionPantries>;

const mockedRecipes = useSavedRecipesList as MockedSavedRecipes;
const mockedPantries = useNutritionPantries as MockedPantries;

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

function renderShopping(
  client: ReturnType<typeof createApiClient>,
): ReturnType<typeof render> {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity, gcTime: Infinity },
    },
  });
  queryClient.setQueryData(apiQueryKeys.me.current(), testUser);
  return render(
    <ApiClientProvider client={client}>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <Shopping testID="nutrition-shopping" />
        </ToastProvider>
      </QueryClientProvider>
    </ApiClientProvider>,
  );
}

const SAMPLE_RECIPE = {
  id: "rcp_1",
  title: "Овочеве рагу",
  timeMinutes: 40,
  servings: 2,
  ingredients: ["300 г кабачка", "1 цибуля", "2 моркви"],
  steps: ["Нарізати овочі", "Тушкувати 30 хв"],
  tips: [],
  macros: {
    kcal: 220,
    protein_g: 6,
    fat_g: 8,
    carbs_g: 30,
  },
  createdAt: 1700000000000,
  updatedAt: 1700000000000,
};

const SAMPLE_CATEGORIES = [
  {
    name: "Овочі",
    items: [
      { name: "Кабачок", quantity: "300 г", note: "" },
      { name: "Цибуля", quantity: "1 шт", note: "" },
      { name: "Морква", quantity: "2 шт", note: "" },
    ],
  },
  {
    name: "Олії та жири",
    items: [{ name: "Олія соняшникова", quantity: "50 мл", note: "" }],
  },
];

beforeEach(() => {
  _getMMKVInstance().clearAll();
  mockedRecipes.mockReset();
  mockedPantries.mockReset();
  mockedPantries.mockReturnValue({
    pantries: [],
    activePantryId: "default",
    activePantry: {
      id: "default",
      name: "Комора",
      items: [{ name: "Сіль", qty: 1, unit: "пачка", notes: null }],
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
});

describe("Shopping AI generation", () => {
  it("disables the generate CTA when there are no saved recipes", () => {
    mockedRecipes.mockReturnValue({ recipes: [] });
    const { client } = createTestApiClient(() => ({
      ok: true,
      status: 200,
      body: { categories: [], rawText: null },
    }));

    const { getByTestId, getByText } = renderShopping(client);

    expect(
      getByTestId("shopping-generate").props.accessibilityState.disabled,
    ).toBe(true);
    expect(
      getByText("Спочатку додай рецепт у Меню → Збережені рецепти."),
    ).toBeTruthy();
  });

  it("calls nutrition.shoppingList with recipes + pantry and renders the returned list", async () => {
    mockedRecipes.mockReturnValue({ recipes: [SAMPLE_RECIPE] });
    const { client, calls } = createTestApiClient(() => ({
      ok: true,
      status: 200,
      body: { categories: SAMPLE_CATEGORIES, rawText: null },
    }));

    const { getByTestId, getByText, findByText } = renderShopping(client);

    await act(async () => {
      fireEvent.press(getByTestId("shopping-generate"));
    });

    await waitFor(
      () => {
        if (calls.length === 0) {
          throw new Error("no calls yet");
        }
      },
      { timeout: 5000 },
    );

    const shoppingCall = calls.find((c) =>
      c.url.includes("nutrition/shopping-list"),
    );
    expect(shoppingCall).toBeDefined();
    const body = shoppingCall!.body as {
      recipes?: unknown[];
      pantryItems?: unknown[];
      locale?: string;
    };
    expect(Array.isArray(body.recipes)).toBe(true);
    expect(body.recipes).toHaveLength(1);
    expect(Array.isArray(body.pantryItems)).toBe(true);
    expect(body.pantryItems).toHaveLength(1);
    expect(body.locale).toBe("uk-UA");

    expect(await findByText("Кабачок · 300 г")).toBeTruthy();
    expect(getByText("Цибуля · 1 шт")).toBeTruthy();
    expect(getByText("Олія соняшникова · 50 мл")).toBeTruthy();
    // Counter reflects new items (4 total).
    expect(getByTestId("shopping-count").props.children).toEqual(
      expect.arrayContaining([4, " поз. · відмічено ", 0]),
    );
  });

  it("does not duplicate items when generation is re-run", async () => {
    mockedRecipes.mockReturnValue({ recipes: [SAMPLE_RECIPE] });
    const { client } = createTestApiClient(() => ({
      ok: true,
      status: 200,
      body: { categories: SAMPLE_CATEGORIES, rawText: null },
    }));

    const { getByTestId, findAllByText } = renderShopping(client);

    await act(async () => {
      fireEvent.press(getByTestId("shopping-generate"));
    });
    await findAllByText("Кабачок · 300 г");

    await act(async () => {
      fireEvent.press(getByTestId("shopping-generate"));
    });

    const cabbageRows = await findAllByText("Кабачок · 300 г");
    // Single rendered row, not doubled.
    expect(cabbageRows).toHaveLength(1);
    expect(getByTestId("shopping-count").props.children).toEqual(
      expect.arrayContaining([4, " поз. · відмічено ", 0]),
    );
  });

  it("shows an inline error when the AI quota is exhausted", async () => {
    mockedRecipes.mockReturnValue({ recipes: [SAMPLE_RECIPE] });
    const { client } = createTestApiClient(() => ({
      ok: false,
      status: 429,
      body: { error: "Too Many Requests" },
    }));

    const { getByTestId, findByTestId } = renderShopping(client);

    await act(async () => {
      fireEvent.press(getByTestId("shopping-generate"));
    });

    const errNode = await findByTestId("shopping-generate-error");
    expect(errNode.props.children).toMatch(/AI-квоту/i);
  });
});
