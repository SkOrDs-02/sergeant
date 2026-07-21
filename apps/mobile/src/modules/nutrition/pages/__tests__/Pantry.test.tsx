import { act, fireEvent, render } from "@testing-library/react-native";
import { createApiClient } from "@sergeant/api-client";
import { ApiClientProvider } from "@sergeant/api-client/react";

import { ToastProvider } from "@/components/ui/Toast";

import { PantryPage } from "../Pantry";

jest.mock("../../hooks/useNutritionPantries", () => ({
  useNutritionPantries: jest.fn(),
}));

const mockShowUndoToast = jest.fn();
jest.mock("@/lib/showUndoToast", () => ({
  showUndoToast: (...args: unknown[]) => mockShowUndoToast(...args),
}));

import { useNutritionPantries } from "../../hooks/useNutritionPantries";

const mockedPantries = useNutritionPantries as jest.MockedFunction<
  typeof useNutritionPantries
>;

const pantryActions = {
  setActivePantryId: jest.fn(),
  addLine: jest.fn(),
  applyParsedItems: jest.fn(),
  removeItemAt: jest.fn(),
  restoreItemAt: jest.fn(),
  addPantry: jest.fn(),
  refresh: jest.fn(),
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

function mockPantryState() {
  mockedPantries.mockReturnValue({
    pantries: [
      {
        id: "home",
        name: "Дім",
        text: "",
        items: [
          { name: "молоко", qty: 2, unit: "л", notes: null },
          { name: "яйця", qty: 10, unit: "шт", notes: null },
        ],
      },
      { id: "office", name: "Офіс", text: "", items: [] },
    ],
    activePantryId: "home",
    activePantry: {
      id: "home",
      name: "Дім",
      text: "",
      items: [
        { name: "молоко", qty: 2, unit: "л", notes: null },
        { name: "яйця", qty: 10, unit: "шт", notes: null },
      ],
    },
    pantryItems: [
      { name: "молоко", qty: 2, unit: "л", notes: null },
      { name: "яйця", qty: 10, unit: "шт", notes: null },
    ],
    ...pantryActions,
  });
}

function renderPage(
  client = createTestApiClient(() => ({
    ok: true,
    status: 200,
    body: { items: [] },
  })).client,
) {
  return render(
    <ApiClientProvider client={client}>
      <ToastProvider>
        <PantryPage testID="pantry-page" />
      </ToastProvider>
    </ApiClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPantryState();
});

describe("PantryPage", () => {
  it("renders grouped pantry items and switches active pantry", () => {
    const { getByText } = renderPage();

    expect(getByText("молоко")).toBeTruthy();
    expect(getByText("2 л")).toBeTruthy();
    expect(getByText("яйця")).toBeTruthy();

    fireEvent.press(getByText("Офіс"));
    expect(pantryActions.setActivePantryId).toHaveBeenCalledWith("office");
  });

  it("adds a loose pantry line and clears the draft", () => {
    const { getByPlaceholderText, getByText } = renderPage();
    const input = getByPlaceholderText("Продукт або список…");

    fireEvent.changeText(input, "2 кг картоплі");
    fireEvent.press(getByText("Додати"));

    expect(pantryActions.addLine).toHaveBeenCalledWith("2 кг картоплі");
    expect(input.props.value).toBe("");
  });

  it("parses bulk pantry text through the API and applies returned items", async () => {
    const parsedItems = [{ name: "гречка", qty: 1, unit: "кг", notes: null }];
    const { client, calls } = createTestApiClient(() => ({
      ok: true,
      status: 200,
      body: { items: parsedItems },
    }));
    const { getByTestId } = renderPage(client);

    fireEvent.changeText(getByTestId("pantry-ai-bulk"), "гречка 1 кг");
    await act(async () => {
      fireEvent.press(getByTestId("pantry-ai-btn"));
    });

    expect(calls[0]?.url).toContain("nutrition/parse-pantry");
    expect(calls[0]?.body).toEqual({
      text: "гречка 1 кг",
      locale: "uk-UA",
    });
    expect(pantryActions.applyParsedItems).toHaveBeenCalledWith(parsedItems);
    expect(getByTestId("pantry-ai-bulk").props.value).toBe("");
  });

  it("shows API errors for AI parsing", async () => {
    const { getByTestId, findByTestId, rerender } = renderPage();
    const { client } = createTestApiClient(() => ({
      ok: false,
      status: 500,
      body: { error: "Server exploded" },
    }));
    rerender(
      <ApiClientProvider client={client}>
        <ToastProvider>
          <PantryPage testID="pantry-page" />
        </ToastProvider>
      </ApiClientProvider>,
    );
    fireEvent.changeText(getByTestId("pantry-ai-bulk"), "рис");
    await act(async () => {
      fireEvent.press(getByTestId("pantry-ai-btn"));
    });

    expect((await findByTestId("pantry-ai-err")).props.children).toMatch(
      /Server exploded|Помилка/i,
    );
  });

  it("removes items with an undo toast and creates a new pantry", () => {
    const { getByLabelText, getByPlaceholderText, getByText } = renderPage();

    fireEvent.press(getByLabelText("Видалити молоко"));
    expect(pantryActions.removeItemAt).toHaveBeenCalledWith(0);
    expect(mockShowUndoToast).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        msg: "Видалено «молоко»",
        onUndo: expect.any(Function),
      }),
    );

    const undo = mockShowUndoToast.mock.calls[0]![1] as { onUndo: () => void };
    undo.onUndo();
    expect(pantryActions.restoreItemAt).toHaveBeenCalledWith(0, {
      name: "молоко",
      qty: 2,
      unit: "л",
      notes: null,
    });

    fireEvent.changeText(getByPlaceholderText("Назва (напр. Офіс)"), "Дача");
    fireEvent.press(getByText("Створити"));
    expect(pantryActions.addPantry).toHaveBeenCalledWith("Дача");
  });
});
