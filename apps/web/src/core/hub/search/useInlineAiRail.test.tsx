// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

import type { ApiErrorInit } from "@sergeant/api-client";

const send = vi.hoisted(() => vi.fn());

vi.mock("@shared/api", async () => {
  class ApiError extends Error {
    kind: string;
    status: number;
    serverMessage: string | undefined;
    constructor(init: ApiErrorInit) {
      super(init.message);
      this.kind = init.kind;
      this.status = init.status ?? 0;
      this.serverMessage =
        init.body && typeof init.body === "object"
          ? (init.body as { error?: string }).error
          : undefined;
    }
  }
  return {
    ApiError,
    isApiError: (e: unknown) => e instanceof ApiError,
    chatApi: { send },
  };
});

vi.mock("../../lib/hubChatContext", () => ({
  buildContextMeasured: () => "ctx",
}));

import { useInlineAiRail } from "./useInlineAiRail";
import { ApiError } from "@shared/api";

beforeEach(() => {
  send.mockReset();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("useInlineAiRail", () => {
  it("starts idle", () => {
    const { result } = renderHook(() => useInlineAiRail());
    expect(result.current.state.status).toBe("idle");
  });

  it("ignores empty questions", async () => {
    const { result } = renderHook(() => useInlineAiRail());
    await act(async () => {
      await result.current.ask("   ");
    });
    expect(result.current.state.status).toBe("idle");
    expect(send).not.toHaveBeenCalled();
  });

  it("resolves a successful answer", async () => {
    send.mockResolvedValue({ text: "Відповідь", tool_calls: [] });
    const { result } = renderHook(() => useInlineAiRail());
    await act(async () => {
      await result.current.ask("питання");
    });
    expect(result.current.state).toMatchObject({
      status: "success",
      question: "питання",
      answer: "Відповідь",
      hasToolCalls: false,
      truncated: false,
    });
  });

  it("flags tool calls with a handoff message when text is empty", async () => {
    send.mockResolvedValue({ text: "", tool_calls: [{ name: "x" }] });
    const { result } = renderHook(() => useInlineAiRail());
    await act(async () => {
      await result.current.ask("зроби щось");
    });
    expect(result.current.state).toMatchObject({
      status: "success",
      hasToolCalls: true,
    });
    if (result.current.state.status === "success") {
      expect(result.current.state.answer).toContain("повноцінний чат");
    }
  });

  it("truncates very long answers", async () => {
    send.mockResolvedValue({ text: "a".repeat(800), tool_calls: [] });
    const { result } = renderHook(() => useInlineAiRail());
    await act(async () => {
      await result.current.ask("довге");
    });
    if (result.current.state.status === "success") {
      expect(result.current.state.truncated).toBe(true);
      expect(result.current.state.answer.endsWith("…")).toBe(true);
      expect(result.current.state.answer.length).toBeLessThanOrEqual(601);
    }
  });

  it("maps http ApiError to a friendly message", async () => {
    send.mockRejectedValue(
      new ApiError({
        kind: "http",
        status: 500,
        message: "boom",
        url: "/api/chat",
        body: { error: "server detail" },
      }),
    );
    const { result } = renderHook(() => useInlineAiRail());
    await act(async () => {
      await result.current.ask("питання");
    });
    expect(result.current.state.status).toBe("error");
  });

  it("treats aborted ApiError as aborted state", async () => {
    send.mockRejectedValue(
      new ApiError({ kind: "aborted", message: "err", url: "/api/chat" }),
    );
    const { result } = renderHook(() => useInlineAiRail());
    await act(async () => {
      await result.current.ask("питання");
    });
    expect(result.current.state.status).toBe("aborted");
  });

  it("reset returns to idle", async () => {
    send.mockResolvedValue({ text: "ok", tool_calls: [] });
    const { result } = renderHook(() => useInlineAiRail());
    await act(async () => {
      await result.current.ask("питання");
    });
    act(() => result.current.reset());
    expect(result.current.state.status).toBe("idle");
  });
});
