// @vitest-environment jsdom
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { chatApi } from "@shared/api";
import {
  __setNutritionSqliteCacheForTests,
  clearNutritionSqliteCache,
} from "../../../modules/nutrition/lib/sqliteReader";
import { notifyNutritionSqliteCacheRefresh } from "../../../modules/nutrition/lib/sqliteReadGate";
import { useChatSend } from "./useChatSend";

vi.mock("../../billing/usePlan", () => ({
  usePlan: () => ({ isPro: true, plan: "pro", isLoading: false }),
}));
vi.mock("../../lib/hubChatActions", () => ({ executeActions: vi.fn() }));
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

let client: QueryClient;
function Wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
function seed(kcal: number) {
  __setNutritionSqliteCacheForTests({
    log: {
      "2026-10-15": {
        meals: [
          {
            id: "meal",
            name: "Суп",
            label: "Суп",
            time: "12:00",
            mealType: "lunch",
            source: "manual",
            macroSource: "manual",
            foodId: null,
            amount_g: null,
            macros: { kcal, protein_g: 0, fat_g: 0, carbs_g: 0 },
          },
        ],
      },
    },
  });
}
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-15T12:00:00Z"));
  localStorage.clear();
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  seed(640);
});
afterEach(() => {
  cleanup();
  client.clear();
  clearNutritionSqliteCache();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

it.each(["new records", "new day"])(
  "sends current canonical context after %s without reopening chat",
  async (change) => {
    const send = vi.spyOn(chatApi, "send").mockResolvedValue({ text: "Ок." });
    const { result } = renderHook(
      () => useChatSend({ messages: [], setMessages: vi.fn() }),
      { wrapper: Wrapper },
    );
    await waitFor(() => {
      expect(result.current.contextState.status).toBe("ready");
      expect(client.isFetching()).toBe(0);
    });
    await act(async () => {
      await result.current.send("Що записано сьогодні?");
    });
    expect(send.mock.calls[0]?.[0].context).toContain(
      "[Харчування сьогодні] 640 ккал",
    );
    act(() => {
      if (change === "new records") {
        seed(1280);
        notifyNutritionSqliteCacheRefresh();
      } else vi.setSystemTime(new Date("2026-10-16T12:00:00Z"));
    });
    await act(async () => {
      await result.current.send("А зараз?");
    });
    expect(send).toHaveBeenCalledTimes(2);
    const context = send.mock.calls[1]?.[0].context;
    if (change === "new records")
      expect(context).toContain("[Харчування сьогодні] 1280 ккал");
    else expect(context).not.toContain("[Харчування сьогодні]");
  },
);
