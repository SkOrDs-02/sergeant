/** @vitest-environment jsdom */
/**
 * @status Active
 * С-1 (б), рішення власника 2026-11-18 (OD-30): крок у бульбашці очікування.
 * `step` чесний: `null`, поки модель не відповіла на перший хід і поки
 * йде синтез; підпис інструмента лише на час реального виконання.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { chatApi } from "@shared/api";

// Під vi.mock-храповиком (≤ 5): стабимо лише те, без чого хук не живе в
// jsdom або що треба керувати вручну. `chatApi` — через `vi.spyOn` на
// справжньому модулі (як `useChatSend.freshness.test.tsx`); контекст чату,
// превʼю Фініка, мовлення й статус мережі — справжні.
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
import { SYNTHESIS_STEP_LABEL } from "./chatProgress";

let client: QueryClient;
function wrapper({ children }: { children: ReactNode }) {
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

let sendMock: ReturnType<typeof vi.spyOn>;
let streamMock: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  executeActionsMock.mockReset();
  localStorage.clear();
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  sendMock = vi.spyOn(chatApi, "send");
  streamMock = vi.spyOn(chatApi, "stream");
});

afterEach(() => {
  cleanup();
  client.clear();
  vi.restoreAllMocks();
});

describe("useChatSend — крок у бульбашці очікування", () => {
  it("перший хід: step null; виконання інструмента: його підпис; синтез: «Пишу відповідь…»; кінець: null", async () => {
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
    // Друга фаза (рішення 2026-11-18): інструменти відпрацювали, модель пише.
    expect(result.current.step).toBe(SYNTHESIS_STEP_LABEL);
    expect(result.current.loading).toBe(true);

    await act(async () => {
      synth.resolve(jsonResponse({ text: "120 ₴" }));
      await sending;
    });
    expect(result.current.loading).toBe(false);
    expect(result.current.step).toBeNull();
  });

  it("хід із синхронним інструментом: «Думаю…» → «Пишу відповідь…» → кінець, без вигаданих кроків", async () => {
    sendMock.mockResolvedValue({
      tool_calls: [
        { id: "tc1", name: "category_breakdown", input: { days: 30 } },
      ],
      tool_calls_raw: [{ id: "tc1" }],
    });
    // Синхронний виконавець: результат уже готовий.
    executeActionsMock.mockResolvedValue([
      { name: "category_breakdown", result: "Продукти 4 792 ₴", ok: true },
    ]);
    const synth = deferred<Response>();
    streamMock.mockReturnValue(synth.promise);
    const seen: Array<string | null> = [];
    const { result } = renderHook(
      () => {
        const r = useChatSend({ messages: [], setMessages: vi.fn() });
        if (seen[seen.length - 1] !== r.step) seen.push(r.step);
        return r;
      },
      { wrapper },
    );
    let sending!: Promise<void>;
    act(() => {
      sending = result.current.send("розбий витрати");
    });
    await waitFor(() => expect(streamMock).toHaveBeenCalled());
    expect(result.current.step).toBe(SYNTHESIS_STEP_LABEL);
    await act(async () => {
      synth.resolve(jsonResponse({ text: "Найбільше на продукти." }));
      await sending;
    });
    // Підпис інструмента може не встигнути намалюватись (синхронний), тож
    // його не вимагаємо; решта послідовності точна.
    const phases = seen.filter((s) => s !== "Рахую витрати за категоріями");
    expect(phases).toEqual([null, SYNTHESIS_STEP_LABEL, null]);
  });

  it("текстова відповідь без інструментів не показує жодного кроку (другої фази немає)", async () => {
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
