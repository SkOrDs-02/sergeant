/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ─── Collaborator mocks ───────────────────────────────────────────────────────
// useChatSend orchestrates the send pipeline: chat API → tool-call firewall →
// executeActions → SSE follow-up. We mock the network + the executor so the
// test exercises the hook's own branching (plain reply vs validated tool call
// vs rejected tool call) without a real server or LocalStorage mutation.

const { sendMock, streamMock, executeActionsMock, consumeSseMock } = vi.hoisted(
  () => ({
    sendMock: vi.fn(),
    streamMock: vi.fn(),
    executeActionsMock: vi.fn(),
    consumeSseMock: vi.fn(),
  }),
);

vi.mock("../../lib/hubChatUtils", async () => {
  const actual = await vi.importActual<typeof import("../../lib/hubChatUtils")>(
    "../../lib/hubChatUtils",
  );
  return {
    ...actual,
    // Default to the real consumer; individual tests override per-case.
    consumeHubChatSse: consumeSseMock,
  };
});

vi.mock("@shared/api", async () => {
  const actual =
    await vi.importActual<typeof import("@shared/api")>("@shared/api");
  return {
    ...actual,
    chatApi: { send: sendMock, stream: streamMock },
  };
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
  VOICE_KEYWORDS: /голосом|вголос|скажи|озвуч|прочитай/i,
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

function renderSend(messages: ChatMessage[] = []) {
  return renderHook(() => useChatSend({ messages, setMessages: vi.fn() }), {
    wrapper: makeWrapper(),
  });
}

beforeEach(() => {
  sendMock.mockReset();
  streamMock.mockReset();
  executeActionsMock.mockReset();
  consumeSseMock.mockReset();
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useChatSend (audit 03 F22 — SSE + tool-calls)", () => {
  it("renders a plain assistant reply when the server returns no tool_calls", async () => {
    const captured: ChatMessage[][] = [];
    const setMessages = vi.fn((updater: unknown) => {
      if (typeof updater === "function") {
        const prev = captured.at(-1) ?? [];
        captured.push((updater as (m: ChatMessage[]) => ChatMessage[])(prev));
      }
    });
    sendMock.mockResolvedValue({ text: "Твій баланс — 1000 грн." });

    const { result } = renderHook(
      () => useChatSend({ messages: [], setMessages }),
      { wrapper: makeWrapper() },
    );

    await act(async () => {
      await result.current.send("який мій баланс");
    });

    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(executeActionsMock).not.toHaveBeenCalled();
    const flat = captured.flat();
    expect(flat.some((m) => m.text === "Твій баланс — 1000 грн.")).toBe(true);
  });

  it("runs a validated tool call through executeActions then streams the follow-up", async () => {
    const setMessages = vi.fn();
    sendMock.mockResolvedValue({
      tool_calls: [{ id: "tc1", name: "log_water", input: { amount_ml: 250 } }],
      tool_calls_raw: [{ id: "tc1" }],
    });
    executeActionsMock.mockResolvedValue([
      { name: "log_water", result: "Записав 250 мл води" },
    ]);
    // Follow-up stream — non-SSE JSON branch keeps the test transport-free.
    streamMock.mockResolvedValue(
      new Response(JSON.stringify({ text: "Готово!" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const { result } = renderHook(
      () => useChatSend({ messages: [], setMessages }),
      { wrapper: makeWrapper() },
    );

    await act(async () => {
      await result.current.send("випив 250 мл води");
    });

    await waitFor(() => expect(executeActionsMock).toHaveBeenCalledTimes(1));
    const dispatched = executeActionsMock.mock.calls[0]![0] as Array<{
      name: string;
    }>;
    expect(dispatched[0]!.name).toBe("log_water");
    expect(streamMock).toHaveBeenCalledTimes(1);
  });

  it("rejects a malformed tool call (unknown name) and never mutates", async () => {
    const setMessages = vi.fn();
    sendMock.mockResolvedValue({
      text: "fallback text",
      tool_calls: [
        { id: "tc1", name: "definitely_not_a_real_tool", input: {} },
      ],
    });

    const { result } = renderHook(
      () => useChatSend({ messages: [], setMessages }),
      { wrapper: makeWrapper() },
    );

    await act(async () => {
      await result.current.send("зроби щось небезпечне");
    });

    // Firewall (toolCallSchema.parseToolCalls) rejects the unknown name —
    // executeActions must NOT run, the turn falls back to plain text.
    expect(executeActionsMock).not.toHaveBeenCalled();
    expect(streamMock).not.toHaveBeenCalled();
  });

  it("rejects a tool call with a structurally-broken envelope (missing id)", async () => {
    const setMessages = vi.fn();
    sendMock.mockResolvedValue({
      text: "fallback",
      // Missing `id` → envelope firewall fails before the name allow-list.
      tool_calls: [{ name: "log_water", input: { amount_ml: 100 } }],
    });

    const { result } = renderHook(
      () => useChatSend({ messages: [], setMessages }),
      { wrapper: makeWrapper() },
    );

    await act(async () => {
      await result.current.send("випив воду");
    });

    expect(executeActionsMock).not.toHaveBeenCalled();
  });

  it("ignores a send while a previous one is still loading", async () => {
    const setMessages = vi.fn();
    // First send never resolves → loading stays true.
    sendMock.mockReturnValueOnce(new Promise(() => {}));

    const { result } = renderHook(
      () => useChatSend({ messages: [], setMessages }),
      { wrapper: makeWrapper() },
    );

    await act(async () => {
      void result.current.send("перший");
    });
    await act(async () => {
      await result.current.send("другий");
    });

    // The guard on `loading` means the second send is dropped — send fired once.
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it("does not call the API for an empty message", async () => {
    const { result } = renderSend();
    await act(async () => {
      await result.current.send("   ");
    });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("caps the accumulated SSE stream (F15) and surfaces the friendly tail", async () => {
    const captured: ChatMessage[][] = [];
    const setMessages = vi.fn((updater: unknown) => {
      if (typeof updater === "function") {
        const prev = captured.at(-1) ?? [];
        captured.push((updater as (m: ChatMessage[]) => ChatMessage[])(prev));
      }
    });
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
    // Emit a single oversized delta — the in-loop cap must abort and throw.
    consumeSseMock.mockImplementation(
      async (_res: Response, onDelta: (d: string) => void) => {
        onDelta("x".repeat(256 * 1024 + 1));
      },
    );

    const { result } = renderHook(
      () => useChatSend({ messages: [], setMessages }),
      { wrapper: makeWrapper() },
    );

    await act(async () => {
      await result.current.send("випив воду");
    });

    // The catch-around-the-stream renders the friendly "занадто довга" tail
    // on the assistant turn rather than dumping the multi-MB body.
    const flat = captured.flat();
    expect(flat.some((m) => m.text.includes("Відповідь занадто довга"))).toBe(
      true,
    );
  });
});
