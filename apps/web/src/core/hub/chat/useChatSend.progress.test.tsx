/** @vitest-environment jsdom */
/**
 * @status Active
 * С-1 (б), рішення власника 2026-11-18 (OD-30): крок у бульбашці очікування.
 * `step` чесний: `null`, поки модель не відповіла на перший хід і поки
 * йде синтез; підпис інструмента лише на час реального виконання.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const { sendMock, streamMock, executeActionsMock } = vi.hoisted(() => ({
  sendMock: vi.fn(),
  streamMock: vi.fn(),
  executeActionsMock: vi.fn(),
}));

vi.mock("@shared/api", async () => {
  const actual =
    await vi.importActual<typeof import("@shared/api")>("@shared/api");
  return { ...actual, chatApi: { send: sendMock, stream: streamMock } };
});

vi.mock("../useFinykHubPreview", () => ({
  useFinykHubPreview: () => ({
    data: { hasMonoData: false },
    dataUpdatedAt: 0,
  }),
}));

vi.mock("../../billing/usePlan", () => ({
  usePlan: () => ({ isPro: true, plan: "pro", isLoading: false }),
}));

vi.mock("../../lib/hubChatContext", () => ({
  buildContextMeasured: () => "ctx",
}));

vi.mock("../../lib/hubChatActions", () => ({
  executeActions: executeActionsMock,
}));

vi.mock("../../lib/hubChatSpeech", () => ({
  VOICE_KEYWORDS: /озвуч/i,
  speak: vi.fn(),
  stopSpeaking: vi.fn(),
}));

vi.mock("@shared/hooks/useOnlineStatus", () => ({
  useOnlineStatus: () => true,
}));

vi.mock("@shared/hooks/useToast", () => ({
  useToast: () => ({
    show: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    dismiss: vi.fn(),
  }),
}));

import { useChatSend } from "./useChatSend";

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const jsonResponse = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

beforeEach(() => {
  sendMock.mockReset();
  streamMock.mockReset();
  executeActionsMock.mockReset();
  localStorage.clear();
});

describe("useChatSend — крок у бульбашці очікування", () => {
  it("перший хід: step null; виконання інструмента: його підпис; синтез: знову null", async () => {
    const first = deferred<unknown>();
    const exec = deferred<unknown>();
    const synth = deferred<Response>();
    sendMock.mockReturnValue(first.promise);
    executeActionsMock.mockReturnValue(exec.promise);
    streamMock.mockReturnValue(synth.promise);

    const { result } = renderHook(
      () => useChatSend({ messages: [], setMessages: vi.fn() }),
      { wrapper },
    );
    expect(result.current.step).toBeNull();

    let sending!: Promise<void>;
    act(() => {
      sending = result.current.send("скільки на каву цього тижня");
    });
    await waitFor(() => expect(result.current.loading).toBe(true));
    expect(result.current.step).toBeNull();

    await act(async () => {
      first.resolve({
        tool_calls: [
          { id: "tc1", name: "find_transaction", input: { query: "кава" } },
        ],
        tool_calls_raw: [{ id: "tc1" }],
      });
    });
    await waitFor(() => expect(result.current.step).toBe("Шукаю операцію"));

    await act(async () => {
      exec.resolve([
        { name: "find_transaction", result: "3 операції", ok: true },
      ]);
    });
    await waitFor(() => expect(streamMock).toHaveBeenCalled());
    expect(result.current.step).toBeNull();
    expect(result.current.loading).toBe(true);

    await act(async () => {
      synth.resolve(jsonResponse({ text: "120 ₴" }));
      await sending;
    });
    expect(result.current.loading).toBe(false);
    expect(result.current.step).toBeNull();
  });

  it("текстова відповідь без інструментів не показує жодного кроку", async () => {
    sendMock.mockResolvedValue({ text: "Привіт" });
    const seen: Array<string | null> = [];
    const { result } = renderHook(
      () => {
        const r = useChatSend({ messages: [], setMessages: vi.fn() });
        seen.push(r.step);
        return r;
      },
      { wrapper },
    );
    await act(async () => {
      await result.current.send("привіт");
    });
    expect(seen.every((s) => s === null)).toBe(true);
    expect(executeActionsMock).not.toHaveBeenCalled();
  });

  it("виконавець упав: крок знімається, хід завершується помилкою", async () => {
    sendMock.mockResolvedValue({
      tool_calls: [{ id: "tc1", name: "log_meal", input: { name: "суп" } }],
      tool_calls_raw: [{ id: "tc1" }],
    });
    executeActionsMock.mockRejectedValue(new Error("boom"));
    const { result } = renderHook(
      () => useChatSend({ messages: [], setMessages: vi.fn() }),
      { wrapper },
    );
    await act(async () => {
      await result.current.send("запиши суп");
    });
    expect(result.current.loading).toBe(false);
    expect(result.current.step).toBeNull();
    expect(streamMock).not.toHaveBeenCalled();
  });
});
