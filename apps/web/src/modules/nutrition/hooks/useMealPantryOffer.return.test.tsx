// @vitest-environment jsdom
/**
 * «Повернути» в підтвердженні «Списав 150 г із комори» (рішення власника
 * 2026-11-19, варіант Б): пропозиція списання йде після тосту запису, тож
 * його «Скасувати» після списання вже недосяжне, і відкат живе тут.
 * Справжні провайдер тостів і комора; журнал комори — мок, як у
 * `useNutritionPantries.pantryEvents.test.tsx`.
 */
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@shared/api", async () => {
  const actual =
    await vi.importActual<typeof import("@shared/api")>("@shared/api");
  return { ...actual, nutritionApi: { parsePantry: vi.fn() } };
});

vi.mock("../lib/nutritionStorage", async () => {
  const actual = await vi.importActual<
    typeof import("../lib/nutritionStorage")
  >("../lib/nutritionStorage");
  return {
    ...actual,
    appendNutritionPantryEvent: vi.fn(),
    backfillNutritionPantryCheckpoints: vi.fn(),
  };
});

import { ToastProvider, useToast } from "@shared/hooks/useToast";
import { useNutritionPantries } from "./useNutritionPantries";
import { useMealPantryOffer } from "./useMealPantryOffer";
import { appendNutritionPantryEvent } from "../lib/nutritionStorage";
import {
  __setNutritionSqliteCacheForTests,
  clearNutritionSqliteCache,
} from "../lib/sqliteReader";
import { notifyNutritionSqliteCacheRefresh } from "../lib/sqliteReadGate";

const appendMock = vi.mocked(appendNutritionPantryEvent);
const OFFER = "Списати 150 г із комори?";
const CONSUMED = "Списав 150\u00a0г із комори";

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return (
    <QueryClientProvider client={client}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
}

function seedRice() {
  __setNutritionSqliteCacheForTests({
    pantries: [
      {
        id: "home",
        name: "Дім",
        items: [{ id: "r1", name: "Рис", qty: 500, unit: "г", notes: null }],
        text: "",
      },
    ],
    activePantryId: "home",
  });
  notifyNutritionSqliteCacheRefresh();
}

function renderHarness() {
  return renderHook(
    () => {
      const toast = useToast();
      const pantry = useNutritionPantries({
        setBusy: vi.fn(),
        setErr: vi.fn(),
        setStatusText: vi.fn(),
        setDenial: vi.fn(),
      });
      const offer = useMealPantryOffer(toast, {
        items: pantry.pantryItems,
        consume: pantry.consumePantryItem,
        revert: pantry.revertConsume,
      });
      return { toast, pantry, offer };
    },
    { wrapper },
  ).result;
}

type Harness = ReturnType<typeof renderHarness>;

const riceQty = (r: Harness) =>
  r.current.pantry.pantries
    .find((p) => p.id === "home")
    ?.items.find((x) => x.name === "Рис")?.qty;

const live = (r: Harness, msg: string) =>
  r.current.toast.toasts.find((t) => !t.leaving && t.msg === msg);

function consumeViaOffer(r: Harness) {
  act(() => {
    r.current.offer([{ name: "Рис", amount_g: 150 }]);
  });
  act(() => {
    live(r, OFFER)!.action!.onClick();
  });
}

describe("«Повернути» після «Списати» з тосту пропозиції", () => {
  beforeEach(() => {
    localStorage.clear();
    clearNutritionSqliteCache();
    vi.clearAllMocks();
    seedRice();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("повертає списане в комору і пише подію відкату в журнал комори", () => {
    const r = renderHarness();
    consumeViaOffer(r);
    expect(riceQty(r)).toBe(350);

    const confirm = live(r, CONSUMED);
    expect(confirm?.action).toMatchObject({ label: "Повернути", kind: "undo" });
    appendMock.mockClear();
    act(() => {
      confirm!.action!.onClick();
    });

    expect(riceQty(r)).toBe(500);
    expect(appendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        pantryId: "home",
        kind: "adjust",
        absQty: 500,
        source: "meal_log",
      }),
    );
  });

  it("тост підтвердження зник — дії вже немає, списання лишається", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    const r = renderHarness();
    consumeViaOffer(r);
    expect(live(r, CONSUMED)).toBeDefined();
    appendMock.mockClear();

    act(() => {
      vi.advanceTimersByTime(10_000);
    });

    expect(live(r, CONSUMED)).toBeUndefined();
    expect(r.current.toast.toasts.some((t) => t.action)).toBe(false);
    expect(riceQty(r)).toBe(350);
    expect(appendMock).not.toHaveBeenCalled();
  });
});
