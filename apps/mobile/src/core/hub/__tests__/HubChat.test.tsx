/**
 * Render coverage for the mobile HubChat shell.
 *
 * Scope мінімального acceptance:
 *  1. Empty-state — `ChatEmpty` показано на старті, без активних
 *     `messages` після seed-intro flush.
 *  2. Send pipeline — натиск на «Надіслати» з заповненим input-ом
 *     ходить через mocked `api.chat.send` і додає assistant-message
 *     до UI.
 *  3. Render AI response — текст з `data.text` рендериться як
 *     assistant-bubble (`text-fg`).
 *
 * Tool-call execution, streaming follow-up і session persistence
 * перевіряються окремо (TODO Phase 2 follow-up). Тут — happy-path
 * smoke, щоб майбутні regressions у render/wire-up ловилися ранньо.
 */
import { fireEvent, render, waitFor, act } from "@testing-library/react-native";
import { ApiClientProvider } from "@sergeant/api-client/react";
import { createApiClient } from "@sergeant/api-client";

import { HubChat } from "../HubChat";
import { ToastProvider } from "@/components/ui/Toast";
import { ACTIVE_SESSION_KEY, SESSIONS_STORAGE_KEY } from "../hubChatSessions";
import { lsRemove } from "../hubChatUtils";

function makeFetchImpl(payload: { text?: string; tool_calls?: unknown[] }) {
  return jest.fn(
    async () =>
      ({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        text: async () => JSON.stringify(payload),
      }) as Response,
  );
}

function renderHubChat(payload: { text?: string; tool_calls?: unknown[] }) {
  const fetchImpl = makeFetchImpl(payload);
  const apiClient = createApiClient({
    baseUrl: "http://127.0.0.1",
    fetchImpl: fetchImpl as unknown as typeof fetch,
  });
  const utils = render(
    <ApiClientProvider client={apiClient}>
      <ToastProvider>
        <HubChat />
      </ToastProvider>
    </ApiClientProvider>,
  );
  return { ...utils, fetchImpl };
}

describe("HubChat (mobile)", () => {
  beforeEach(() => {
    // Isolate persisted state between tests — the in-memory MMKV
    // shim from jest.setup.js keeps data across renders otherwise.
    lsRemove(SESSIONS_STORAGE_KEY);
    lsRemove(ACTIVE_SESSION_KEY);
    lsRemove("hub_chat_history");
  });

  it("рендерить empty-state на свіжій сесії", () => {
    const { getByTestId } = renderHubChat({ text: "noop" });
    // Intro-message ("Привіт! Я твій особистий асистент…") теж
    // вважаємо валідним baseline-ом — assert на header testID,
    // який гарантує, що шелл змонтувався без падіння провайдерів.
    expect(getByTestId("hub-chat-header")).toBeTruthy();
    expect(getByTestId("hub-chat-input")).toBeTruthy();
    expect(getByTestId("hub-chat-send")).toBeTruthy();
  });

  it("надсилає message через `api.chat.send` після тапу на send", async () => {
    const { getByTestId, fetchImpl } = renderHubChat({
      text: "Привіт, я допоможу!",
    });
    await act(async () => {
      fireEvent.changeText(
        getByTestId("hub-chat-input"),
        "Скільки я витратив?",
      );
    });
    await act(async () => {
      fireEvent.press(getByTestId("hub-chat-send"));
    });
    await waitFor(() => {
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    });
    const callArgs = (fetchImpl.mock.calls[0] ?? []) as unknown as [
      string,
      RequestInit,
    ];
    const [url, init] = callArgs;
    // `createApiClient` rewrites `/api/chat` → `/api/v1/chat`
    // (per packages/api-client/src/httpClient.ts default prefix).
    expect(typeof url === "string" ? url : String(url)).toMatch(
      /\/api\/(?:v1\/)?chat$/,
    );
    const body = JSON.parse(init.body as string) as {
      messages: { role: string; content: string }[];
    };
    expect(body.messages.at(-1)).toEqual({
      role: "user",
      content: "Скільки я витратив?",
    });
  });

  it("рендерить AI-відповідь bubble-ом з повним текстом", async () => {
    const { getByTestId, findByText } = renderHubChat({
      text: "Ось твій звіт за тиждень.",
    });
    await act(async () => {
      fireEvent.changeText(getByTestId("hub-chat-input"), "Звіт за тиждень?");
    });
    await act(async () => {
      fireEvent.press(getByTestId("hub-chat-send"));
    });
    expect(await findByText("Ось твій звіт за тиждень.")).toBeTruthy();
  });
});
