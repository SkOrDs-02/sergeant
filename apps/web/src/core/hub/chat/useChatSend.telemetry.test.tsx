/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ANALYTICS_EVENTS } from "@sergeant/shared";

// Воронка HubChat (`posthog-founder-pulse.md` §9):
//   opened ≥ message_sent ≥ response_received + error
//
// Тест стереже саме інваріант, а не факт виклику `trackEvent`: до бети це
// єдиний спосіб дізнатись, чи коуч узагалі працює, і мовчазний регрес тут
// коштує всіх 30 тестерів — рівно та історія, що вже сталась із
// `feedback_submitted`.

const { sendMock, streamMock, executeActionsMock, consumeSseMock, trackMock } =
  vi.hoisted(() => ({
    sendMock: vi.fn(),
    streamMock: vi.fn(),
    executeActionsMock: vi.fn(),
    consumeSseMock: vi.fn(),
    trackMock: vi.fn(),
  }));

vi.mock("../../observability/analytics", () => ({
  trackEvent: (...args: unknown[]) => trackMock(...args),
}));

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
  usePlan: () => ({ isPro: true, plan: "pro", isLoading: false }),
}));

vi.mock("../../lib/hubChatContext", () => ({
  buildContextMeasured: () => "ctx",
}));

vi.mock("../../lib/hubChatActions", () => ({
  executeActions: executeActionsMock,
}));

vi.mock("../../lib/hubChatSpeech", () => ({
  VOICE_KEYWORDS: /голосом/i,
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

import { ApiError } from "@shared/api";
import { useChatSend } from "./useChatSend";

function renderSend() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return renderHook(() => useChatSend({ messages: [], setMessages: vi.fn() }), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
}

function eventsNamed(name: string) {
  return trackMock.mock.calls.filter(([n]) => n === name);
}

beforeEach(() => {
  sendMock.mockReset();
  streamMock.mockReset();
  executeActionsMock.mockReset();
  consumeSseMock.mockReset();
  trackMock.mockReset();
  localStorage.clear();
});

describe("useChatSend — телеметрія воронки HubChat", () => {
  it("текстова відповідь: message_sent → response_received{had_tools:false}", async () => {
    sendMock.mockResolvedValue({ text: "Баланс — 1000 грн." });
    const { result } = renderSend();

    await act(async () => {
      await result.current.send("скільки в мене грошей");
    });

    const sent = eventsNamed(ANALYTICS_EVENTS.HUBCHAT_MESSAGE_SENT);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.[1]).toMatchObject({
      length: "скільки в мене грошей".length,
      fromVoice: false,
    });

    await waitFor(() =>
      expect(
        eventsNamed(ANALYTICS_EVENTS.HUBCHAT_RESPONSE_RECEIVED),
      ).toHaveLength(1),
    );
    const received = eventsNamed(ANALYTICS_EVENTS.HUBCHAT_RESPONSE_RECEIVED)[0];
    expect(received?.[1]).toMatchObject({
      had_tools: false,
      length: "Баланс — 1000 грн.".length,
    });
    expect(
      (received?.[1] as { latency_ms: number }).latency_ms,
    ).toBeGreaterThanOrEqual(0);
    expect(eventsNamed(ANALYTICS_EVENTS.HUBCHAT_ERROR)).toHaveLength(0);
  });

  it("HTTP-збій: message_sent → error{kind:'http', status} і НЕ response_received", async () => {
    sendMock.mockRejectedValue(
      new ApiError({
        kind: "http",
        message: "boom",
        status: 500,
        url: "/api/chat",
      }),
    );
    const { result } = renderSend();

    await act(async () => {
      await result.current.send("привіт");
    });

    expect(eventsNamed(ANALYTICS_EVENTS.HUBCHAT_MESSAGE_SENT)).toHaveLength(1);
    const errors = eventsNamed(ANALYTICS_EVENTS.HUBCHAT_ERROR);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.[1]).toMatchObject({ kind: "http", status: 500 });
    expect(
      eventsNamed(ANALYTICS_EVENTS.HUBCHAT_RESPONSE_RECEIVED),
    ).toHaveLength(0);
  });

  it("/help не витрачає AI-запит, тож message_sent не летить", async () => {
    const { result } = renderSend();

    await act(async () => {
      await result.current.send("/help");
    });

    expect(eventsNamed(ANALYTICS_EVENTS.HUBCHAT_MESSAGE_SENT)).toHaveLength(0);
    expect(sendMock).not.toHaveBeenCalled();
  });
});
