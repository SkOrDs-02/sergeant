/** @vitest-environment jsdom */
/**
 * data-44 (аудит 2026-10-01): відповідь, що ще летить, дописувалась у ту
 * бесіду, яка активна НА МОМЕНТ відповіді, тож після «Нова» чи вибору іншої
 * бесіди вона осідала в чужій, а оригінальна лишалась без відповіді.
 *
 * Тут реальні `useChatSessions` + `useChatSend` у звʼязці (як у `HubChat`),
 * мокається лише мережа й виконавець tool-ів.
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
import { useChatSessions } from "./useChatSessions";
import { SESSIONS_STORAGE_KEY, type HubChatSession } from "../hubChatSessions";

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/** Те саме звʼязування, що й у `HubChat.tsx`. */
function useBoth() {
  const s = useChatSessions();
  const c = useChatSend({
    messages: s.messages,
    setMessages: s.setMessages,
    activeId: s.activeId,
    updateSessionMessages: s.updateSessionMessages,
  });
  return { s, c };
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function texts(msgs: ReadonlyArray<{ text: string }>): string[] {
  return msgs.map((m) => m.text);
}

function sessionById(
  sessions: HubChatSession[],
  id: string,
): HubChatSession | undefined {
  return sessions.find((x) => x.id === id);
}

function storedSession(id: string): HubChatSession | undefined {
  const all = JSON.parse(
    localStorage.getItem(SESSIONS_STORAGE_KEY) || "[]",
  ) as HubChatSession[];
  return all.find((x) => x.id === id);
}

// Мережа: шпигуємо за методами самого `chatApi`, без `vi.mock` модуля.
const sendMock = vi.fn();
const streamMock = vi.fn();

beforeEach(() => {
  sendMock.mockReset();
  streamMock.mockReset();
  vi.spyOn(chatApi, "send").mockImplementation(sendMock);
  vi.spyOn(chatApi, "stream").mockImplementation(streamMock);
  executeActionsMock.mockReset();
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useChatSend × useChatSessions: хід привʼязаний до своєї бесіди (data-44)", () => {
  it("контроль: без перемикання відповідь лягає в активну бесіду", async () => {
    sendMock.mockResolvedValue({ text: "ВІДПОВІДЬ" });
    const { result } = renderHook(useBoth, { wrapper });

    await act(async () => {
      await result.current.c.send("питання");
    });

    expect(texts(result.current.s.messages)).toEqual(["питання", "ВІДПОВІДЬ"]);
  });

  it("«Нова» під час відповіді: відповідь у старій бесіді, нова порожня", async () => {
    const reply = deferred<{ text: string }>();
    sendMock.mockReturnValue(reply.promise);
    const { result } = renderHook(useBoth, { wrapper });
    const oldId = result.current.s.activeId;

    let sending!: Promise<void>;
    act(() => {
      sending = result.current.c.send("питання старої бесіди");
    });
    await waitFor(() => expect(result.current.c.loading).toBe(true));

    act(() => result.current.s.handleCreateSession());
    const newId = result.current.s.activeId;
    expect(newId).not.toBe(oldId);

    await act(async () => {
      reply.resolve({ text: "ВІДПОВІДЬ СТАРОЇ" });
      await sending;
    });

    // Активна (нова) бесіда не отримала сироту.
    expect(result.current.s.activeId).toBe(newId);
    expect(texts(result.current.s.messages)).toEqual([]);
    // Стара — має і питання, і відповідь, у памʼяті й у сховищі.
    const old = sessionById(result.current.s.sessions, oldId)!;
    expect(texts(old.messages)).toEqual([
      "питання старої бесіди",
      "ВІДПОВІДЬ СТАРОЇ",
    ]);
    expect(texts(storedSession(oldId)!.messages)).toEqual([
      "питання старої бесіди",
      "ВІДПОВІДЬ СТАРОЇ",
    ]);
    expect(
      texts(sessionById(result.current.s.sessions, newId)!.messages),
    ).toEqual([]);
  });

  it("вибір іншої бесіди з історії під час відповіді: відповідь у вихідній", async () => {
    const reply = deferred<{ text: string }>();
    sendMock.mockReturnValue(reply.promise);
    const { result } = renderHook(useBoth, { wrapper });
    const idA = result.current.s.activeId;

    // Друга бесіда з власним вмістом, повертаємось у A і шлемо там.
    act(() => result.current.s.handleCreateSession());
    const idB = result.current.s.activeId;
    act(() =>
      result.current.s.setMessages([
        { id: "b1", role: "user", text: "про Б" },
        { id: "b2", role: "assistant", text: "відповідь Б" },
      ]),
    );
    act(() => result.current.s.handleSelectSession(idA));
    expect(result.current.s.activeId).toBe(idA);

    let sending!: Promise<void>;
    act(() => {
      sending = result.current.c.send("питання А");
    });
    await waitFor(() => expect(result.current.c.loading).toBe(true));

    act(() => result.current.s.handleSelectSession(idB));
    expect(result.current.s.activeId).toBe(idB);

    await act(async () => {
      reply.resolve({ text: "ВІДПОВІДЬ А" });
      await sending;
    });

    expect(texts(result.current.s.messages)).toEqual(["про Б", "відповідь Б"]);
    expect(
      texts(sessionById(result.current.s.sessions, idA)!.messages),
    ).toEqual(["питання А", "ВІДПОВІДЬ А"]);

    // Повернення в A показує відповідь на місці.
    act(() => result.current.s.handleSelectSession(idA));
    expect(texts(result.current.s.messages)).toEqual([
      "питання А",
      "ВІДПОВІДЬ А",
    ]);
  });

  it("повернення в бесіду під час відповіді: апдейти знову йдуть у живий стан", async () => {
    const reply = deferred<{ text: string }>();
    sendMock.mockReturnValue(reply.promise);
    const { result } = renderHook(useBoth, { wrapper });
    const idA = result.current.s.activeId;

    let sending!: Promise<void>;
    act(() => {
      sending = result.current.c.send("питання А");
    });
    await waitFor(() => expect(result.current.c.loading).toBe(true));
    act(() => result.current.s.handleCreateSession());
    act(() => result.current.s.handleSelectSession(idA));

    await act(async () => {
      reply.resolve({ text: "ВІДПОВІДЬ А" });
      await sending;
    });

    expect(texts(result.current.s.messages)).toEqual([
      "питання А",
      "ВІДПОВІДЬ А",
    ]);
  });

  it("другий хід синтезу (tool-call) теж іде у свою бесіду", async () => {
    const exec =
      deferred<Array<{ name: string; ok: boolean; result: string }>>();
    sendMock.mockResolvedValue({
      tool_calls: [{ id: "tc1", name: "log_water", input: { amount_ml: 250 } }],
      tool_calls_raw: [],
    });
    executeActionsMock.mockReturnValue(exec.promise);
    streamMock.mockResolvedValue(
      new Response(JSON.stringify({ text: "СИНТЕЗ СТАРОЇ" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const { result } = renderHook(useBoth, { wrapper });
    const oldId = result.current.s.activeId;

    let sending!: Promise<void>;
    act(() => {
      sending = result.current.c.send("випив 250 мл води");
    });
    await waitFor(() => expect(executeActionsMock).toHaveBeenCalled());

    // Перемикаємось, поки tool ще виконується: і плейсхолдер синтезу, і
    // його оновлення мають піти у стару бесіду.
    act(() => result.current.s.handleCreateSession());
    const newId = result.current.s.activeId;

    await act(async () => {
      exec.resolve([{ name: "log_water", ok: true, result: "Записав 250 мл" }]);
      await sending;
    });

    expect(texts(result.current.s.messages)).toEqual([]);
    const old = sessionById(result.current.s.sessions, oldId)!;
    expect(old.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(old.messages[1]!.text).toContain("СИНТЕЗ СТАРОЇ");
    expect(
      texts(sessionById(result.current.s.sessions, newId)!.messages),
    ).toEqual([]);
  });

  it("скасування запиту після «Нова»: «Запит скасовано.» лягає у стару бесіду", async () => {
    sendMock.mockImplementation(
      (_body: unknown, opts: { signal: AbortSignal }) =>
        new Promise((_, reject) => {
          opts.signal.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        }),
    );
    const { result } = renderHook(useBoth, { wrapper });
    const oldId = result.current.s.activeId;

    let sending!: Promise<void>;
    act(() => {
      sending = result.current.c.send("питання");
    });
    await waitFor(() => expect(result.current.c.loading).toBe(true));
    act(() => result.current.s.handleCreateSession());

    await act(async () => {
      result.current.c.cancelInFlight();
      await sending;
    });

    expect(texts(result.current.s.messages)).toEqual([]);
    expect(
      texts(sessionById(result.current.s.sessions, oldId)!.messages),
    ).toEqual(["питання", "Запит скасовано."]);
  });

  it("бесіду видалено під час відповіді: нова бесіда не отримує сироти", async () => {
    const reply = deferred<{ text: string }>();
    sendMock.mockReturnValue(reply.promise);
    const { result } = renderHook(useBoth, { wrapper });
    const oldId = result.current.s.activeId;

    let sending!: Promise<void>;
    act(() => {
      sending = result.current.c.send("питання");
    });
    await waitFor(() => expect(result.current.c.loading).toBe(true));
    act(() => result.current.s.handleCreateSession());
    act(() => result.current.s.handleDeleteSession(oldId));

    await act(async () => {
      reply.resolve({ text: "ВІДПОВІДЬ" });
      await sending;
    });

    expect(texts(result.current.s.messages)).toEqual([]);
    expect(sessionById(result.current.s.sessions, oldId)).toBeUndefined();
    for (const sess of result.current.s.sessions) {
      expect(texts(sess.messages)).not.toContain("ВІДПОВІДЬ");
    }
  });
});
