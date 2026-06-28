/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Additional branch coverage for useChatSend: offline, paywall (free-tier
// daily limit), /help command, send-time HTTP error rewrite, explicit cancel,
// and the SSE success accumulation path. These complement the happy/tool-call
// cases in useChatSend.test.tsx.

const { sendMock, streamMock, executeActionsMock, consumeSseMock, speakMock } =
  vi.hoisted(() => ({
    sendMock: vi.fn(),
    streamMock: vi.fn(),
    executeActionsMock: vi.fn(),
    consumeSseMock: vi.fn(),
    speakMock: vi.fn(),
  }));

// Controllable per-test flags.
const flags = { isPro: true, online: true };

vi.mock("../../lib/hubChatUtils", async () => {
  const actual = await vi.importActual<typeof import("../../lib/hubChatUtils")>(
    "../../lib/hubChatUtils",
  );
  return { ...actual, consumeHubChatSse: consumeSseMock };
});

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
  usePlan: () => ({ isPro: flags.isPro, plan: "free", isLoading: false }),
}));

vi.mock("../../lib/hubChatContext", () => ({
  buildContextMeasured: () => "ctx",
}));

vi.mock("../../lib/hubChatActions", () => ({
  executeActions: executeActionsMock,
}));

vi.mock("../../lib/hubChatSpeech", () => ({
  VOICE_KEYWORDS: /голосом|вголос|скажи|озвуч|прочитай/i,
  speak: speakMock,
  stopSpeaking: vi.fn(),
}));

vi.mock("@shared/hooks/useOnlineStatus", () => ({
  useOnlineStatus: () => flags.online,
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

import { ApiError } from "@shared/api";
import { useChatSend } from "./useChatSend";
import type { ChatMessage } from "../../lib/hubChatUtils";

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };
}

function renderWithCapture() {
  const captured: ChatMessage[][] = [];
  const setMessages = vi.fn((updater: unknown) => {
    if (typeof updater === "function") {
      const prev = captured.at(-1) ?? [];
      captured.push((updater as (m: ChatMessage[]) => ChatMessage[])(prev));
    } else {
      captured.push(updater as ChatMessage[]);
    }
  });
  const hook = renderHook(() => useChatSend({ messages: [], setMessages }), {
    wrapper: makeWrapper(),
  });
  return { ...hook, captured, setMessages };
}

beforeEach(() => {
  sendMock.mockReset();
  streamMock.mockReset();
  executeActionsMock.mockReset();
  consumeSseMock.mockReset();
  speakMock.mockReset();
  flags.isPro = true;
  flags.online = true;
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useChatSend — guard branches", () => {
  it("/help opens the catalogue and never hits the API", async () => {
    const onOpenCatalogue = vi.fn();
    const { result } = renderHook(
      () =>
        useChatSend({ messages: [], setMessages: vi.fn(), onOpenCatalogue }),
      { wrapper: makeWrapper() },
    );
    await act(async () => {
      await result.current.send("/help");
    });
    expect(onOpenCatalogue).toHaveBeenCalledTimes(1);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("offline appends an offline notice and skips the API", async () => {
    flags.online = false;
    const { result, captured } = renderWithCapture();
    await act(async () => {
      await result.current.send("привіт");
    });
    expect(sendMock).not.toHaveBeenCalled();
    const flat = captured.flat();
    expect(flat.some((m) => m.text.includes("Немає підключення"))).toBe(true);
  });

  it("free-tier user is paywalled after the daily limit is reached", async () => {
    flags.isPro = false;
    // Seed today's counter at the free daily limit (FREE_DAILY_AI_CHAT_LIMIT = 15).
    const { getKyivDayKey } = await vi.importActual<
      typeof import("@shared/lib/time/kyivTime")
    >("@shared/lib/time/kyivTime");
    localStorage.setItem(
      "sergeant:ai-chat:daily-count:v1",
      JSON.stringify({ day: getKyivDayKey(), count: 15 }),
    );
    const { result } = renderWithCapture();
    await act(async () => {
      await result.current.send("ще одне питання");
    });
    expect(sendMock).not.toHaveBeenCalled();
    expect(result.current.paywallOpen).toBe(true);

    act(() => result.current.closePaywall());
    await waitFor(() => expect(result.current.paywallOpen).toBe(false));
  });

  it("free-tier user under the limit increments the counter and sends", async () => {
    flags.isPro = false;
    sendMock.mockResolvedValue({ text: "Привіт!" });
    const { result } = renderWithCapture();
    await act(async () => {
      await result.current.send("привіт");
    });
    expect(sendMock).toHaveBeenCalledTimes(1);
    const stored = JSON.parse(
      localStorage.getItem("sergeant:ai-chat:daily-count:v1") || "{}",
    );
    expect(stored.count).toBe(1);
  });
});

describe("useChatSend — error + cancel paths", () => {
  it("rewrites an HTTP ApiError into a friendly assistant tail", async () => {
    sendMock.mockRejectedValue(
      new ApiError({
        kind: "http",
        message: "boom",
        status: 500,
        url: "/api/chat",
      }),
    );
    const { result, captured } = renderWithCapture();
    await act(async () => {
      await result.current.send("щось");
    });
    const flat = captured.flat();
    // Some friendly assistant message is appended (not the raw "boom").
    expect(flat.some((m) => m.role === "assistant")).toBe(true);
    expect(result.current.loading).toBe(false);
  });

  it("cancelInFlight aborts the active request and renders the cancel notice", async () => {
    let abortSignal: AbortSignal | undefined;
    sendMock.mockImplementation(
      (_body: unknown, opts: { signal: AbortSignal }) => {
        abortSignal = opts.signal;
        return new Promise((_resolve, reject) => {
          opts.signal.addEventListener("abort", () => {
            reject(
              new ApiError({ kind: "aborted", message: "aborted", url: "/x" }),
            );
          });
        });
      },
    );
    const { result, captured } = renderWithCapture();
    await act(async () => {
      void result.current.send("довгий запит");
      // Let the send register its controller, then cancel.
      await Promise.resolve();
      result.current.cancelInFlight();
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(abortSignal?.aborted).toBe(true);
    const flat = captured.flat();
    expect(flat.some((m) => m.text.includes("скасовано"))).toBe(true);
  });
});

describe("useChatSend — SSE success path", () => {
  it("accumulates streamed deltas into the assistant message", async () => {
    sendMock.mockResolvedValue({
      tool_calls: [{ id: "tc1", name: "log_water", input: { amount_ml: 250 } }],
      tool_calls_raw: [{ id: "tc1" }],
    });
    executeActionsMock.mockResolvedValue([
      { name: "log_water", result: "Записав 250 мл" },
    ]);
    streamMock.mockResolvedValue(
      new Response("stream", {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      }),
    );
    consumeSseMock.mockImplementation(
      async (_res: Response, onDelta: (d: string) => void) => {
        onDelta("Гото");
        onDelta("во!");
      },
    );

    const { result, captured } = renderWithCapture();
    await act(async () => {
      await result.current.send("випив воду");
    });

    const flat = captured.flat();
    expect(flat.some((m) => m.text.includes("Готово!"))).toBe(true);
  });
});
