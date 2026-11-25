/** @vitest-environment jsdom */
/**
 * @status Active
 * С-1 (а), рішення founder-а 2026-11-18: стрім першого ходу
 * (`docs/work/specs/hubchat-first-turn-stream.md`).
 *
 * - ранній підпис кроку, щойно модель обрала інструмент, ще до відповіді;
 * - текст зʼявляється, поки його пишуть, і вступ лишається над картками;
 * - дії на пристрої виконуються лише після кадру `final`;
 * - обрив після видимого тексту лишає написане й дає «Ще раз»;
 * - старий сервер (JSON без колбеків) іде старим шляхом.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useState, type ReactNode } from "react";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ChatStreamError, chatApi } from "@shared/api";

// vi.mock-храповик (≤ 5): лише те, без чого хук не живе в jsdom.
const { executeActionsMock } = vi.hoisted(() => ({
  executeActionsMock: vi.fn(),
}));

vi.mock("../../billing/usePlan", () => ({
  usePlan: () => ({ isPro: true, plan: "pro", isLoading: false }),
}));

vi.mock("../../lib/hubChatActions", () => ({
  executeActions: executeActionsMock,
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
import type { ChatMessage } from "../../lib/hubChatUtils";

let client: QueryClient;
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function useHarness() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  return { ...useChatSend({ messages, setMessages }), messages };
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

type FirstTurnOpts = {
  onText?: (d: string) => void;
  onTool?: (n: string) => void;
};

let firstTurnMock: ReturnType<typeof vi.spyOn>;
let streamMock: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  executeActionsMock.mockReset();
  localStorage.clear();
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  firstTurnMock = vi.spyOn(chatApi, "firstTurn");
  streamMock = vi.spyOn(chatApi, "stream");
});

afterEach(() => {
  cleanup();
  client.clear();
  vi.restoreAllMocks();
});

const assistants = (msgs: ChatMessage[]) =>
  msgs.filter((m) => m.role === "assistant");

describe("useChatSend — стрім першого ходу", () => {
  it("ранній підпис кроку до відповіді; дії лише після `final`", async () => {
    const final = deferred<unknown>();
    let opts!: FirstTurnOpts;
    firstTurnMock.mockImplementation((_p: unknown, o: FirstTurnOpts) => {
      opts = o;
      return final.promise;
    });
    executeActionsMock.mockResolvedValue([
      { name: "find_transaction", result: "1 операція", ok: true },
    ]);
    streamMock.mockResolvedValue(
      new Response(JSON.stringify({ text: "Знайшов." }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const { result } = renderHook(useHarness, { wrapper });
    let sending!: Promise<void>;
    act(() => {
      sending = result.current.send("знайди покупку в Сільпо");
    });
    await waitFor(() => expect(firstTurnMock).toHaveBeenCalled());

    act(() => opts.onTool?.("find_transaction"));
    await waitFor(() => expect(result.current.step).toBe("Шукаю операцію"));
    // Кадр кроку — не дозвіл діяти: виконавці чекають `final`.
    expect(executeActionsMock).not.toHaveBeenCalled();

    await act(async () => {
      final.resolve({
        tool_calls: [
          { id: "tc1", name: "find_transaction", input: { query: "Сільпо" } },
        ],
        tool_calls_raw: [],
      });
      await sending;
    });
    expect(executeActionsMock).toHaveBeenCalledTimes(1);
  });

  it("текст зʼявляється під час генерації і стає відповіддю", async () => {
    const final = deferred<unknown>();
    let opts!: FirstTurnOpts;
    firstTurnMock.mockImplementation((_p: unknown, o: FirstTurnOpts) => {
      opts = o;
      return final.promise;
    });

    const { result } = renderHook(useHarness, { wrapper });
    let sending!: Promise<void>;
    act(() => {
      sending = result.current.send("як справи з бюджетом");
    });
    await waitFor(() => expect(firstTurnMock).toHaveBeenCalled());

    act(() => opts.onText?.("Цього тижня "));
    await waitFor(() =>
      expect(assistants(result.current.messages)[0]?.text).toBe("Цього тижня "),
    );
    expect(result.current.loading).toBe(true);

    await act(async () => {
      final.resolve({ text: "Цього тижня все в межах." });
      await sending;
    });
    const out = assistants(result.current.messages);
    expect(out).toHaveLength(1);
    expect(out[0]?.text).toBe("Цього тижня все в межах.");
  });

  it("вступ моделі стоїть над картками в тій самій бульбашці", async () => {
    firstTurnMock.mockImplementation(async (_p: unknown, o: FirstTurnOpts) => {
      o.onText?.("Зараз знайду.");
      o.onTool?.("find_transaction");
      return {
        text: "Зараз знайду.",
        tool_calls: [
          { id: "tc1", name: "find_transaction", input: { query: "Сільпо" } },
        ],
        tool_calls_raw: [],
      };
    });
    executeActionsMock.mockResolvedValue([
      { name: "find_transaction", result: "1 операція", ok: true },
    ]);
    streamMock.mockResolvedValue(
      new Response(JSON.stringify({ text: "Знайшов одну." }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const { result } = renderHook(useHarness, { wrapper });
    await act(async () => {
      await result.current.send("знайди покупку в Сільпо");
    });
    const out = assistants(result.current.messages);
    expect(out).toHaveLength(1);
    expect(out[0]?.text.startsWith("Зараз знайду.")).toBe(true);
    expect(out[0]?.text).toContain("Знайшов одну.");
  });

  it("старий сервер (JSON): вступ без стріму теж стоїть над картками", async () => {
    firstTurnMock.mockResolvedValue({
      text: "Зараз знайду.",
      tool_calls: [
        { id: "tc1", name: "find_transaction", input: { query: "Сільпо" } },
      ],
      tool_calls_raw: [],
    });
    executeActionsMock.mockResolvedValue([
      { name: "find_transaction", result: "1 операція", ok: true },
    ]);
    streamMock.mockResolvedValue(
      new Response(JSON.stringify({ text: "Знайшов." }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const { result } = renderHook(useHarness, { wrapper });
    await act(async () => {
      await result.current.send("знайди покупку в Сільпо");
    });
    const out = assistants(result.current.messages);
    expect(out).toHaveLength(1);
    expect(out[0]?.text.startsWith("Зараз знайду.")).toBe(true);
  });

  it("обрив після видимого тексту: написане лишається, «Ще раз» несе питання", async () => {
    firstTurnMock.mockImplementation(async (_p: unknown, o: FirstTurnOpts) => {
      o.onText?.("Цього тижня ти витратив ");
      throw new ChatStreamError("Сержант тимчасово недоступний");
    });

    const { result } = renderHook(useHarness, { wrapper });
    await act(async () => {
      await result.current.send("скільки я витратив");
    });
    const out = assistants(result.current.messages);
    expect(out).toHaveLength(1);
    expect(out[0]?.text).toBe("Цього тижня ти витратив ");
    expect(out[0]?.interrupted).toBe(true);
    expect(out[0]?.retryText).toBe("скільки я витратив");
    expect(result.current.loading).toBe(false);
  });

  it("обірвану відповідь не шле в історію наступного ходу", async () => {
    firstTurnMock.mockImplementationOnce(
      async (_p: unknown, o: FirstTurnOpts) => {
        o.onText?.("Цього тижня ");
        throw new ChatStreamError("Сержант тимчасово недоступний");
      },
    );
    firstTurnMock.mockResolvedValueOnce({ text: "960 грн." });

    const { result } = renderHook(useHarness, { wrapper });
    await act(async () => {
      await result.current.send("скільки я витратив");
    });
    await act(async () => {
      await result.current.send("скільки я витратив");
    });
    const payload = firstTurnMock.mock.calls[1]![0] as {
      messages: Array<{ role: string; content: string }>;
    };
    expect(payload.messages.map((m) => m.content)).not.toContain(
      "Цього тижня ",
    );
  });
});
