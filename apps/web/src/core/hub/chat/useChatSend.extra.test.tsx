/** @vitest-environment jsdom */
/**
 * @status Active
 * Additional branch coverage for useChatSend.ts — complements the happy-path
 * and branch tests in useChatSend.test.tsx / useChatSend.branches.test.tsx.
 *
 * Targeted paths:
 * - Tool handler results with an `undo` function → `showUndoToast` called
 * - Follow-up stream returns a non-200 HTTP response → friendly error appended
 * - Follow-up stream returns non-SSE JSON with a malformed body → error appended
 * - `shouldSpeak` in the tool-call path with an empty followUpText falls back
 *   to `actionsText`
 * - `setInput` and `loading` state transitions around the send lifecycle
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const {
  sendMock,
  streamMock,
  executeActionsMock,
  consumeSseMock,
  speakMock,
  showUndoToastMock,
} = vi.hoisted(() => ({
  sendMock: vi.fn(),
  streamMock: vi.fn(),
  executeActionsMock: vi.fn(),
  consumeSseMock: vi.fn(),
  speakMock: vi.fn(),
  showUndoToastMock: vi.fn(),
}));

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
  usePlan: () => ({
    isPro: flags.isPro,
    plan: flags.isPro ? "pro" : "free",
    isLoading: false,
  }),
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

vi.mock("@shared/lib/ui/undoToast", () => ({
  showUndoToast: showUndoToastMock,
}));

import { useChatSend } from "./useChatSend";
import type { ChatMessage } from "../../lib/hubChatUtils";

// ─── Test utilities ──────────────────────────────────────────────────────────

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

// ─── Setup / teardown ────────────────────────────────────────────────────────

beforeEach(() => {
  sendMock.mockReset();
  streamMock.mockReset();
  executeActionsMock.mockReset();
  consumeSseMock.mockReset();
  speakMock.mockReset();
  showUndoToastMock.mockReset();
  flags.isPro = true;
  flags.online = true;
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Undo toast ──────────────────────────────────────────────────────────────

describe("useChatSend — undo toast for tool actions", () => {
  it("calls showUndoToast for each handler result that exposes an undo function", async () => {
    const undoFn = vi.fn();
    sendMock.mockResolvedValue({
      tool_calls: [
        { id: "tc1", name: "create_transaction", input: { amount: 100 } },
      ],
      tool_calls_raw: [{ id: "tc1" }],
    });
    executeActionsMock.mockResolvedValue([
      { name: "create_transaction", result: "Транзакцію додано", undo: undoFn },
    ]);
    streamMock.mockResolvedValue(
      new Response(JSON.stringify({ text: "Готово!" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const { result } = renderHook(
      () => useChatSend({ messages: [], setMessages: vi.fn() }),
      { wrapper: makeWrapper() },
    );

    await act(async () => {
      await result.current.send("додай транзакцію 100 грн");
    });

    expect(showUndoToastMock).toHaveBeenCalledTimes(1);
    // Verify the undo callback is wired correctly.
    const callArgs = showUndoToastMock.mock.calls[0]!;
    expect(typeof callArgs[1].onUndo).toBe("function");
  });

  it("does NOT call showUndoToast for read-only handlers that have no undo", async () => {
    sendMock.mockResolvedValue({
      tool_calls: [
        { id: "tc1", name: "find_transaction", input: { query: "кава" } },
      ],
      tool_calls_raw: [{ id: "tc1" }],
    });
    executeActionsMock.mockResolvedValue([
      { name: "find_transaction", result: "Знайдено 3 транзакції" },
      // no `undo` field
    ]);
    streamMock.mockResolvedValue(
      new Response(JSON.stringify({ text: "Ось результати." }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const { result } = renderHook(
      () => useChatSend({ messages: [], setMessages: vi.fn() }),
      { wrapper: makeWrapper() },
    );

    await act(async () => {
      await result.current.send("знайди транзакцію кава");
    });

    expect(showUndoToastMock).not.toHaveBeenCalled();
  });
});

// ─── Follow-up stream error paths ────────────────────────────────────────────

describe("useChatSend — follow-up stream error paths", () => {
  it("appends a friendly error when the follow-up stream returns HTTP 500", async () => {
    sendMock.mockResolvedValue({
      tool_calls: [{ id: "tc1", name: "log_water", input: { amount_ml: 250 } }],
      tool_calls_raw: [{ id: "tc1" }],
    });
    executeActionsMock.mockResolvedValue([
      { name: "log_water", result: "Записав 250 мл" },
    ]);
    streamMock.mockResolvedValue(
      new Response(JSON.stringify({ error: "internal server error" }), {
        status: 500,
        headers: { "content-type": "application/json" },
      }),
    );

    const { result, captured } = renderWithCapture();
    await act(async () => {
      await result.current.send("випив воду");
    });

    const flat = captured.flat();
    const assistantMsg = flat.find((m) => m.role === "assistant");
    expect(assistantMsg).toBeDefined();
    // After a 500, the follow-up catch path appends a friendly error to
    // the tool-call turn (text starts with the actionsText prefix).
    expect(assistantMsg!.text.length).toBeGreaterThan(0);
    expect(result.current.loading).toBe(false);
  });

  it("handles a non-JSON follow-up stream body gracefully", async () => {
    sendMock.mockResolvedValue({
      tool_calls: [{ id: "tc1", name: "log_water", input: { amount_ml: 100 } }],
      tool_calls_raw: [{ id: "tc1" }],
    });
    executeActionsMock.mockResolvedValue([
      { name: "log_water", result: "Записав 100 мл" },
    ]);
    // Non-JSON body with 200 status — parse failure must not throw unhandled.
    streamMock.mockResolvedValue(
      new Response("not-json", {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const { result, captured } = renderWithCapture();
    await act(async () => {
      await result.current.send("випив воду");
    });

    // Should render some assistant message — no unhandled exception.
    const flat = captured.flat();
    expect(flat.some((m) => m.role === "assistant")).toBe(true);
    expect(result.current.loading).toBe(false);
  });
});

// ─── TTS in tool-call path ────────────────────────────────────────────────────

describe("useChatSend — TTS in tool-call path", () => {
  it("speaks actionsText when followUpText is empty and fromVoice=true", async () => {
    sendMock.mockResolvedValue({
      tool_calls: [{ id: "tc1", name: "log_water", input: { amount_ml: 200 } }],
      tool_calls_raw: [{ id: "tc1" }],
    });
    executeActionsMock.mockResolvedValue([
      { name: "log_water", result: "Записав 200 мл" },
    ]);
    // Non-SSE response with empty text → followUpText stays "".
    streamMock.mockResolvedValue(
      new Response(JSON.stringify({ text: "" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const { result } = renderHook(
      () => useChatSend({ messages: [], setMessages: vi.fn() }),
      { wrapper: makeWrapper() },
    );

    await act(async () => {
      await result.current.send("голосом запиши воду", true /* fromVoice */);
    });

    // followUpText="" so speakTarget falls back to actionsText ("✅ Записав 200 мл").
    expect(speakMock).toHaveBeenCalledTimes(1);
    const spokenText = speakMock.mock.calls[0]![0] as string;
    expect(spokenText).toContain("Записав 200 мл");
  });
});

// ─── Loading state transitions ────────────────────────────────────────────────

describe("useChatSend — loading state", () => {
  it("loading is false after a successful send completes", async () => {
    sendMock.mockResolvedValue({ text: "Привіт!" });

    const { result } = renderWithCapture();

    await act(async () => {
      await result.current.send("привіт");
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it("loading is false after a send error", async () => {
    sendMock.mockRejectedValue(new Error("network error"));

    const { result } = renderWithCapture();
    await act(async () => {
      await result.current.send("що-небудь");
    });

    expect(result.current.loading).toBe(false);
  });
});
