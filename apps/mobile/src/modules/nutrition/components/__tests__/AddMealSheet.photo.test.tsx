/**
 * Photo-аналіз error-handling tests для мобільного `AddMealSheet`
 * (web parity з `usePhotoAnalysis` + `nutritionErrors.ts`).
 *
 * Покриває статус-специфічні повідомлення з `formatPhotoApiError`:
 *  - 402/429 → «Перевищено AI-квоту»;
 *  - network (kind='network') → «Немає звʼязку»;
 *  - 413 → «Занадто велике фото»;
 *  - валідна 200-відповідь → форма заповнюється, перехід на крок «fill».
 *
 * Picker замокано напряму (`pickResizeAndReadBase64Jpeg`) — native expo
 * залежності (camera/gallery/permissions) не потрібні для перевірки
 * мережевого error-флоу. API-клієнт інжектиться через той самий
 * fetch-responder патерн, що й у `Shopping.generate.test.tsx`.
 */
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiClientProvider, apiQueryKeys } from "@sergeant/api-client/react";
import { createApiClient } from "@sergeant/api-client";

import type { PickImageJpegResult } from "../../lib/pickImageJpegForNutritionApi";
import { AddMealSheet } from "../AddMealSheet";

jest.mock("../../lib/pickImageJpegForNutritionApi", () => ({
  pickResizeAndReadBase64Jpeg: jest.fn(),
  captureResizeAndReadBase64Jpeg: jest.fn(),
}));

import {
  pickResizeAndReadBase64Jpeg,
  captureResizeAndReadBase64Jpeg,
} from "../../lib/pickImageJpegForNutritionApi";

const mockedPick = pickResizeAndReadBase64Jpeg as jest.MockedFunction<
  typeof pickResizeAndReadBase64Jpeg
>;
const mockedCapture = captureResizeAndReadBase64Jpeg as jest.MockedFunction<
  typeof captureResizeAndReadBase64Jpeg
>;

const OK_PICK: PickImageJpegResult = {
  status: "ok",
  base64: "QkFTRTY0",
  mimeType: "image/jpeg",
};

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
    networkError?: boolean;
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
      if (r.networkError) {
        throw new TypeError("Network request failed");
      }
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

function renderSheet(
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
        <AddMealSheet open onClose={jest.fn()} onSave={jest.fn()} />
      </QueryClientProvider>
    </ApiClientProvider>,
  );
}

beforeEach(() => {
  mockedPick.mockReset();
  mockedCapture.mockReset();
  mockedPick.mockResolvedValue(OK_PICK);
  mockedCapture.mockResolvedValue(OK_PICK);
});

describe("AddMealSheet photo analyze error handling", () => {
  it("shows the AI-quota message on 402", async () => {
    const { client } = createTestApiClient(() => ({
      ok: false,
      status: 402,
      body: { error: "Payment Required" },
    }));

    const { getByTestId, findByTestId } = renderSheet(client);

    await act(async () => {
      fireEvent.press(getByTestId("add-meal-open-photo-library"));
    });

    const err = await findByTestId("add-meal-source-err");
    expect(err.props.children).toMatch(/AI-квоту/i);
  });

  it("shows the AI-quota message on 429", async () => {
    const { client } = createTestApiClient(() => ({
      ok: false,
      status: 429,
      body: { error: "Too Many Requests" },
    }));

    const { getByTestId, findByTestId } = renderSheet(client);

    await act(async () => {
      fireEvent.press(getByTestId("add-meal-open-photo-library"));
    });

    const err = await findByTestId("add-meal-source-err");
    expect(err.props.children).toMatch(/AI-квоту/i);
  });

  it("shows the offline message on a network failure", async () => {
    const { client } = createTestApiClient(() => ({
      ok: false,
      status: 0,
      body: null,
      networkError: true,
    }));

    const { getByTestId, findByTestId } = renderSheet(client);

    await act(async () => {
      fireEvent.press(getByTestId("add-meal-open-photo-library"));
    });

    const err = await findByTestId("add-meal-source-err");
    expect(err.props.children).toMatch(/звʼязку/i);
  });

  it("shows the too-large message on 413", async () => {
    const { client } = createTestApiClient(() => ({
      ok: false,
      status: 413,
      body: { error: "Payload Too Large" },
    }));

    const { getByTestId, findByTestId } = renderSheet(client);

    await act(async () => {
      fireEvent.press(getByTestId("add-meal-open-photo-library"));
    });

    const err = await findByTestId("add-meal-source-err");
    expect(err.props.children).toMatch(/велике фото/i);
  });

  it("applies a valid 200 result and advances to the fill step", async () => {
    const { client, calls } = createTestApiClient(() => ({
      ok: true,
      status: 200,
      body: {
        result: {
          dishName: "Грецький салат",
          confidence: 0.9,
          portion: { label: "тарілка", gramsApprox: 220 },
          ingredients: [{ name: "Огірок", notes: null }],
          macros: { kcal: 320, protein_g: 8, fat_g: 24, carbs_g: 18 },
          questions: [],
        },
        rawText: null,
      },
    }));

    const { getByTestId, findByDisplayValue } = renderSheet(client);

    await act(async () => {
      fireEvent.press(getByTestId("add-meal-open-photo-library"));
    });

    expect(await findByDisplayValue("Грецький салат")).toBeTruthy();
    expect(getByTestId("add-meal-save")).toBeTruthy();

    const analyzeCall = calls.find((c) =>
      c.url.includes("nutrition/analyze-photo"),
    );
    expect(analyzeCall).toBeDefined();
    const body = analyzeCall!.body as {
      image_base64?: string;
      mime_type?: string;
      locale?: string;
    };
    expect(body.image_base64).toBe("QkFTRTY0");
    expect(body.mime_type).toBe("image/jpeg");
    expect(body.locale).toBe("uk-UA");
  });
});
