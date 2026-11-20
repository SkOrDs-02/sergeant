/** @vitest-environment jsdom */
/**
 * Другий раунд інструментів «пошук → запис» на клієнті (С-2 (б), спека
 * `docs/work/specs/hubchat-second-tool-round.md`). Сервер на запит синтезу
 * після пошуку відповідає викликами запису; хук виконує їх тими самими
 * воротами, що й перший раунд, і просить синтез обох раундів без квитка.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

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

import { chatApi } from "@shared/api";
import { useChatSend } from "./useChatSend";
import { CANCELLED_BY_USER_TEXT } from "./chatSendText";
import type { HubChatSession } from "../hubChatSessions";

type ChatMessage = HubChatSession["messages"][number];

const firstTurnMock = vi.fn();
const streamMock = vi.fn();

const FIND_CALL = {
  id: "tc_find",
  name: "find_transaction",
  input: { query: "кава" },
};
const FIND_RESULT = {
  name: "find_transaction",
  ok: true,
  latencyMs: 1,
  result: "Знайдено 1 операц.: m_7c41: 2026-07-30 · 85 грн · кава",
};

const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

const SECOND_TICKET = "9d1e2f3a-4b5c-4d6e-8f70-1a2b3c4d5e6f";

function secondRound(call: { id: string; name: string; input: object }) {
  return json({
    text: null,
    tool_calls: [call],
    tool_calls_raw: [{ type: "tool_use", ...call }],
    round_trip_ticket: SECOND_TICKET,
  });
}

function mountChat() {
  let messages: ChatMessage[] = [];
  const setMessages = vi.fn((u: React.SetStateAction<ChatMessage[]>) => {
    messages = typeof u === "function" ? u(messages) : u;
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const view = renderHook(() => useChatSend({ messages: [], setMessages }), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
  return { view, lastMessage: () => messages[messages.length - 1] };
}

beforeEach(() => {
  executeActionsMock.mockReset();
  firstTurnMock.mockReset();
  streamMock.mockReset();
  vi.spyOn(chatApi, "firstTurn").mockImplementation(firstTurnMock);
  vi.spyOn(chatApi, "stream").mockImplementation(streamMock);
  firstTurnMock.mockResolvedValue({
    tool_calls: [FIND_CALL],
    tool_calls_raw: [{ type: "tool_use", ...FIND_CALL }],
    round_trip_ticket: "4b0c5d2e-1f3a-4c6b-9d8e-7a6b5c4d3e2f",
  });
});
afterEach(() => vi.restoreAllMocks());

describe("useChatSend: другий раунд «пошук → запис»", () => {
  it("виконує запис другого раунду і просить синтез обох раундів за квитком другого раунду", async () => {
    const change = {
      id: "tc_change",
      name: "change_category",
      input: { tx_id: "m_7c41", category_id: "cat_food_out" },
    };
    executeActionsMock
      .mockResolvedValueOnce([FIND_RESULT])
      .mockResolvedValueOnce([
        {
          name: "change_category",
          ok: true,
          latencyMs: 1,
          result: "Категорію змінено (id:m_7c41)",
        },
      ]);
    streamMock
      .mockResolvedValueOnce(secondRound(change))
      .mockResolvedValueOnce(json({ text: "Переніс каву в «Кафе»." }));

    const { view, lastMessage } = mountChat();
    await act(async () => {
      await view.result.current.send("Перенеси ту каву в кафе");
    });

    await waitFor(() => expect(streamMock).toHaveBeenCalledTimes(2));
    expect(executeActionsMock).toHaveBeenCalledTimes(2);
    expect(
      (executeActionsMock.mock.calls[1]![0] as Array<{ name: string }>)[0]!
        .name,
    ).toBe("change_category");

    const first = streamMock.mock.calls[0]![0] as {
      round_trip_ticket?: string;
      second_tool_round?: boolean;
    };
    expect(first.round_trip_ticket).toBe(
      "4b0c5d2e-1f3a-4c6b-9d8e-7a6b5c4d3e2f",
    );
    // Новий клієнт явно погоджується на другий раунд (сумісність зі старими).
    expect(first.second_tool_round).toBe(true);
    const final = streamMock.mock.calls[1]![0] as {
      tool_results: Array<{ tool_use_id: string }>;
      tool_calls_raw: Array<{ id: string }>;
      round_trip_ticket?: string;
    };
    expect(final.tool_results.map((r) => r.tool_use_id)).toEqual([
      "tc_find",
      "tc_change",
    ]);
    expect(final.tool_calls_raw.map((b) => b.id)).toEqual([
      "tc_find",
      "tc_change",
    ]);
    // Хід коштує одну одиницю: синтез іде за квитком другого раунду (AI-5).
    expect(final.round_trip_ticket).toBe(SECOND_TICKET);

    const msg = lastMessage();
    expect(msg?.text).toContain("Переніс каву в «Кафе».");
    // Записи обох раундів доїжджають у блок наступного ходу (С-2 (а)).
    expect(msg?.toolRefs).toContain("change_category");
  });

  it("відмова від незворотного запису: нічого не виконано, синтезу немає", async () => {
    executeActionsMock.mockResolvedValueOnce([FIND_RESULT]);
    streamMock.mockResolvedValueOnce(
      secondRound({
        id: "tc_del",
        name: "delete_transaction",
        input: { tx_id: "m_7c41" },
      }),
    );

    const { view, lastMessage } = mountChat();
    let sent: Promise<void> | undefined;
    act(() => {
      sent = view.result.current.send("Видали ту каву");
    });
    await waitFor(() =>
      expect(view.result.current.confirmDestructive.pending).not.toBeNull(),
    );
    act(() => view.result.current.confirmDestructive.reject());
    await act(async () => {
      await sent;
    });

    expect(executeActionsMock).toHaveBeenCalledTimes(1);
    expect(streamMock).toHaveBeenCalledTimes(1);
    expect(lastMessage()?.text).toContain(CANCELLED_BY_USER_TEXT);
  });

  it("синтез без другого раунду лишається одним запитом", async () => {
    executeActionsMock.mockResolvedValueOnce([FIND_RESULT]);
    streamMock.mockResolvedValueOnce(json({ text: "Знайшов каву за 85 грн." }));

    const { view, lastMessage } = mountChat();
    await act(async () => {
      await view.result.current.send("Знайди мою каву");
    });

    expect(streamMock).toHaveBeenCalledTimes(1);
    expect(executeActionsMock).toHaveBeenCalledTimes(1);
    expect(lastMessage()?.text).toContain("Знайшов каву за 85 грн.");
  });
});
