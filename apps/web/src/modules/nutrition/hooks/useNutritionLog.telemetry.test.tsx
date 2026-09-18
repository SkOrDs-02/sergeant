// @vitest-environment jsdom
/**
 * Телеметрія петель цінності (Хвиля 2) для логування прийому їжі.
 *
 * `nutrition_meal_logged` — половина «дію зроблено» модуля nutrition.
 * НАЗВИ СТРАВИ в payload немає: `scrubPII` чистить за іменами ключів
 * (`packages/shared/src/lib/pii.ts`), тож `name` він не вирізав би
 * (Hard Rule #21). Захист має бути контрактом, а не сподіванням на скраб.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const mocks = vi.hoisted(() => ({ trackEvent: vi.fn() }));

vi.mock("../../../core/observability/analytics", () => ({
  trackEvent: mocks.trackEvent,
  ANALYTICS_EVENTS: { NUTRITION_MEAL_LOGGED: "nutrition_meal_logged" },
}));

import { ToastProvider } from "@shared/hooks/useToast";
import {
  markSignalShown,
  resetSignalAttribution,
} from "../../../core/observability/valueSignalAttribution";
import { clearNutritionSqliteCache } from "../lib/sqliteReader";
import { useNutritionLog } from "./useNutritionLog";

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <ToastProvider>
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      </ToastProvider>
    );
  };
}

function loggedCalls() {
  return mocks.trackEvent.mock.calls.filter(
    (c) => c[0] === "nutrition_meal_logged",
  );
}

/** Payload n-ної події. Кидає, якщо події не було — це і є асершен. */
function loggedPayload(index = 0): Record<string, unknown> {
  const call = loggedCalls()[index];
  if (!call) throw new Error(`nutrition_meal_logged #${index} не полетів`);
  return call[1] as Record<string, unknown>;
}

describe("useNutritionLog — телеметрія логування", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    clearNutritionSqliteCache();
    resetSignalAttribution();
    vi.clearAllMocks();
  });

  it("емітить nutrition_meal_logged з enum-полями і атрибуцією", () => {
    const { result } = renderHook(() => useNutritionLog(), {
      wrapper: makeWrapper(),
    });

    act(() => {
      result.current.handleAddMeal({
        id: "m1",
        name: "Вівсянка з бананом",
        mealType: "breakfast",
        source: "manual",
        macroSource: "manual",
        macros: { kcal: 300, protein_g: 10, fat_g: 5, carbs_g: 50 },
      });
    });

    expect(loggedCalls()).toHaveLength(1);
    expect(loggedPayload()).toEqual({
      meal_type: "breakfast",
      source: "manual",
      macro_source: "manual",
      has_macros: true,
      after_signal: false,
      ms_since_signal: null,
      signal: null,
    });
  });

  it("розрізняє source (як потрапило в лог) і macro_source (звідки макроси)", () => {
    const { result } = renderHook(() => useNutritionLog(), {
      wrapper: makeWrapper(),
    });

    act(() => {
      result.current.handleAddMeal({
        id: "m2",
        mealType: "lunch",
        source: "photo",
        macroSource: "photoAI",
      });
    });

    expect(loggedPayload()).toMatchObject({
      source: "photo",
      macro_source: "photoAI",
      has_macros: false,
    });
  });

  it("страва без типу їде як unknown, а не ламає подію", () => {
    const { result } = renderHook(() => useNutritionLog(), {
      wrapper: makeWrapper(),
    });

    act(() => {
      result.current.handleAddMeal({ id: "m3" });
    });

    expect(loggedPayload()).toMatchObject({
      meal_type: "unknown",
      source: "manual",
      macro_source: "manual",
    });
  });

  it("дописує атрибуцію показаного nutrition-сигналу", () => {
    markSignalShown({ signal: "nutrition-protein-low", module: "nutrition" });
    const { result } = renderHook(() => useNutritionLog(), {
      wrapper: makeWrapper(),
    });

    act(() => {
      result.current.handleAddMeal({ id: "m4", mealType: "dinner" });
    });

    expect(loggedPayload()).toMatchObject({
      after_signal: true,
      signal: "nutrition-protein-low",
    });
  });

  it("назви страви в payload немає (Hard Rule #21)", () => {
    const { result } = renderHook(() => useNutritionLog(), {
      wrapper: makeWrapper(),
    });

    act(() => {
      result.current.handleAddMeal({
        id: "m5",
        name: "Секретний борщ",
        mealType: "dinner",
      });
    });

    expect(JSON.stringify(loggedPayload())).not.toContain("борщ");
  });

  it("редагування страви НЕ рахується новим логом", () => {
    const { result } = renderHook(() => useNutritionLog(), {
      wrapper: makeWrapper(),
    });

    act(() => {
      result.current.handleEditMeal("2026-07-25", {
        id: "m1",
        mealType: "breakfast",
      });
    });

    expect(loggedCalls()).toHaveLength(0);
  });
});
