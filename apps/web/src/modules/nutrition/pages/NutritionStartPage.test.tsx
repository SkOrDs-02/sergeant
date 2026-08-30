// @vitest-environment jsdom
//
// audit-08 F12 — NutritionStartPage page-level test coverage.
//
// NutritionStartPage orchestrates:
//   • <NutritionDashboard> — gets log, prefs, callbacks
//   • useLocale() — resolves the sr-only page heading
//
// Фотоаналізу тут немає взагалі: ані UI (він крок AddMealSheet —
// meal-sheet/PhotoStep), ані CTA-ярлика в нього (прибраний 2026-08-17 як
// другий вхід у той самий флоу).
//
// Strategy: vi.mock `useLocale` and NutritionDashboard so tests stay
// focused on the page's wiring.

import { describe, expect, it, vi, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { NutritionPrefs } from "@sergeant/nutrition-domain";
import { messages } from "@shared/i18n/uk";

import type { useNutritionLog } from "../hooks/useNutritionLog";
import { NutritionStartPage } from "./NutritionStartPage";

// ---------------------------------------------------------------------------
// Break the import chain that leads to @sergeant/db-schema/sqlite (which is
// not built in this worktree environment). The chain is:
//   NutritionStartPage → Icon (via @shared/components/ui/Card)
//     → @shared/lib (barrel) → storage/storage → kvStoreBoot → db-schema
// Mocking storage/storage (and the barrel) prevents vite from resolving the
// unbuilt db-schema package. This mirrors the pattern in analytics.test.ts.
// ---------------------------------------------------------------------------
vi.mock("@shared/lib/storage/storage", () => ({
  safeReadLS: vi.fn(() => null),
  safeWriteLS: vi.fn(() => true),
  safeReadStringLS: vi.fn(() => null),
  safeReadLSValidated: vi.fn(() => null),
  safeRemoveLS: vi.fn(() => true),
  safeListLSKeys: vi.fn(() => []),
  webKVStore: { get: vi.fn(() => null), set: vi.fn(), remove: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Mock useLocale — return uk messages directly (no localStorage needed).
// ---------------------------------------------------------------------------
vi.mock("@shared/i18n/useLocale", () => ({
  useLocale: () => ({ locale: "uk" as const, messages, setLocale: vi.fn() }),
}));

// ---------------------------------------------------------------------------
// Mock heavy child components.
// ---------------------------------------------------------------------------
vi.mock("../components/NutritionDashboard", () => ({
  NutritionDashboard: ({
    onGoToLog,
    onGoToDailyPlan,
    onAddMeal,
  }: {
    onGoToLog: () => void;
    onGoToDailyPlan: () => void;
    onAddMeal: () => void;
  }) => (
    <div data-testid="nutrition-dashboard">
      <button onClick={onGoToLog}>До щоденника</button>
      <button onClick={onGoToDailyPlan}>До плану</button>
      <button onClick={onAddMeal}>Додати прийом їжі</button>
    </div>
  ),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const EMPTY_PREFS: NutritionPrefs = {} as NutritionPrefs;

function makeLog(
  override?: Partial<ReturnType<typeof useNutritionLog>>,
): ReturnType<typeof useNutritionLog> {
  return {
    nutritionLog: {},
    setNutritionLog: vi.fn(),
    selectedDate: "2025-01-01",
    setSelectedDate: vi.fn(),
    addMealSheetOpen: false,
    setAddMealSheetOpen: vi.fn(),
    handleAddMeal: vi.fn(),
    handleEditMeal: vi.fn(),
    handleRemoveMeal: vi.fn(),
    handleRestoreMeal: vi.fn(),
    storageErr: "",
    duplicateYesterday: vi.fn(),
    replaceLogFromJsonText: vi.fn(),
    mergeLogFromJsonText: vi.fn(),
    trimLogToLastDays: vi.fn(),
    ...override,
  } as ReturnType<typeof useNutritionLog>;
}

function renderStartPage(
  overrides: {
    log?: Partial<ReturnType<typeof useNutritionLog>>;
    setActivePageAndHash?: (page: string) => void;
    onRequestAddMeal?: () => void;
  } = {},
) {
  const log = makeLog(overrides.log);
  const setActivePageAndHash = overrides.setActivePageAndHash ?? vi.fn();
  const onRequestAddMeal = overrides.onRequestAddMeal ?? vi.fn();

  render(
    <NutritionStartPage
      log={log}
      prefs={EMPTY_PREFS}
      setActivePageAndHash={
        setActivePageAndHash as (
          page: import("../lib/nutritionRouter").NutritionPage,
        ) => void
      }
      onRequestAddMeal={onRequestAddMeal}
    />,
  );

  return { log, setActivePageAndHash, onRequestAddMeal };
}

afterEach(() => {
  cleanup();
});

describe("NutritionStartPage", () => {
  it("renders without crashing — shows NutritionDashboard", () => {
    renderStartPage();
    expect(screen.getByTestId("nutrition-dashboard")).toBeTruthy();
  });

  it("'До щоденника' button calls setActivePageAndHash('log')", async () => {
    const setActivePageAndHash = vi.fn();
    renderStartPage({ setActivePageAndHash });

    await userEvent.click(screen.getByRole("button", { name: "До щоденника" }));
    expect(setActivePageAndHash).toHaveBeenCalledWith("log");
  });

  it("'До плану' button calls setActivePageAndHash('menu')", async () => {
    const setActivePageAndHash = vi.fn();
    renderStartPage({ setActivePageAndHash });

    await userEvent.click(screen.getByRole("button", { name: "До плану" }));
    expect(setActivePageAndHash).toHaveBeenCalledWith("menu");
  });

  it("'Додати прийом їжі' delegates to onRequestAddMeal (parent owns navigate + sheet-open)", async () => {
    // F13: the page no longer owns the date-set / navigate / setTimeout
    // sheet-open dance. It just requests the action; NutritionApp drives the
    // deterministic, effect-based follow-up once the Log page has mounted.
    const onRequestAddMeal = vi.fn();

    renderStartPage({ onRequestAddMeal });

    await userEvent.click(
      screen.getByRole("button", { name: "Додати прийом їжі" }),
    );

    expect(onRequestAddMeal).toHaveBeenCalledTimes(1);
  });

  it("не тримає власного входу у фотоаналіз — він лишається джерелом у AddMealSheet", () => {
    // Пін проти повернення дубля: спершу тут жив повний UI аналізу у
    // <details>, потім CTA-ярлик у нього. Обидва прибрані — «Огляд» не
    // веде у фото повз потік «Додати прийом їжі».
    renderStartPage();

    expect(screen.queryByTestId("nutrition-photo-cta")).toBeNull();
    expect(screen.queryByText("Аналіз фото страви")).toBeNull();
  });
});
