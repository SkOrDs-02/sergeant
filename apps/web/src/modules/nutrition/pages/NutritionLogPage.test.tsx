// @vitest-environment jsdom
//
// audit-08 F12 — NutritionLogPage page-level test coverage.
//
// NutritionLogPage is a thin props-driven wrapper that wires a LogController
// and a Toast API into <LogCard>.  We mock the child at the module level so
// the tests stay focused on:
//   • the page renders without crashing
//   • onAddMeal opens the add-meal sheet (sets state on the controller)
//   • onRemoveMeal calls handleRemoveMeal AND fires an undo toast
//   • onEditMeal sets the editing-meal state with the correct shape
import { describe, expect, it, vi, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Meal, NutritionLog } from "@sergeant/nutrition-domain";

import type { useNutritionLog } from "../hooks/useNutritionLog";
import type { useToast } from "@shared/hooks/useToast";
import { NutritionLogPage } from "./NutritionLogPage";

// ---------------------------------------------------------------------------
// Mock <LogCard> so the test does not have to provision a full DOM environment
// for the virtual-meal-list, analytics, weekly-table, etc.  Instead it
// renders a small stub that exposes just enough surface to fire the callbacks
// the page wires.
// ---------------------------------------------------------------------------
vi.mock("../components/LogCard", () => ({
  LogCard: ({
    log,
    onAddMeal,
    onRemoveMeal,
    onEditMeal,
  }: {
    log: NutritionLog;
    onAddMeal?: () => void;
    onRemoveMeal?: (date: string, meal: Meal) => void;
    onEditMeal?: (date: string, meal: Meal) => void;
  }) => {
    const date = "2025-01-01";
    const meal: Meal = {
      id: "m1",
      name: "Яйце",
      time: "09:00",
      mealType: "breakfast",
      label: "",
      macros: { kcal: 70, protein_g: 6, fat_g: 5, carbs_g: 0 },
      source: "manual",
      macroSource: "manual",
      amount_g: null,
      foodId: null,
    };
    const meals = log[date]?.meals ?? [];
    return (
      <div>
        <div data-testid="meal-count">{meals.length}</div>
        <button onClick={onAddMeal}>Додати прийом їжі</button>
        <button onClick={() => onRemoveMeal?.(date, meal)}>
          Видалити meal
        </button>
        <button onClick={() => onEditMeal?.(date, meal)}>
          Редагувати meal
        </button>
      </div>
    );
  },
}));

// ---------------------------------------------------------------------------
// Helper: minimal typed LogController mock (props-driven, no hook calls).
// ---------------------------------------------------------------------------
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
    addMealPhotoResult: null,
    setAddMealPhotoResult: vi.fn(),
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

// ---------------------------------------------------------------------------
// Helper: minimal ToastApi mock.
// ---------------------------------------------------------------------------
function makeToast(): ReturnType<typeof useToast> {
  return {
    show: vi.fn(() => 1),
    success: vi.fn(() => 1),
    error: vi.fn(() => 1),
    info: vi.fn(() => 1),
    warning: vi.fn(() => 1),
    dismiss: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    toasts: [],
  } as ReturnType<typeof useToast>;
}

afterEach(() => cleanup());

describe("NutritionLogPage", () => {
  it("renders without crashing", () => {
    const log = makeLog();
    const toast = makeToast();
    render(
      <NutritionLogPage log={log} toast={toast} setEditingMeal={vi.fn()} />,
    );
    // The stub renders the add button
    expect(
      screen.getByRole("button", { name: /Додати прийом їжі/ }),
    ).toBeTruthy();
  });

  it("clicking 'Додати прийом їжі' clears photo result and opens the add-meal sheet", async () => {
    const setAddMealSheetOpen = vi.fn();
    const setAddMealPhotoResult = vi.fn();
    const log = makeLog({ setAddMealSheetOpen, setAddMealPhotoResult });
    const toast = makeToast();

    render(
      <NutritionLogPage log={log} toast={toast} setEditingMeal={vi.fn()} />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: /Додати прийом їжі/ }),
    );

    expect(setAddMealPhotoResult).toHaveBeenCalledWith(null);
    expect(setAddMealSheetOpen).toHaveBeenCalledWith(true);
  });

  it("clicking 'Видалити meal' calls handleRemoveMeal and fires an info toast (undo pattern)", async () => {
    const handleRemoveMeal = vi.fn();
    const handleRestoreMeal = vi.fn();
    const log = makeLog({ handleRemoveMeal, handleRestoreMeal });
    const toast = makeToast();

    render(
      <NutritionLogPage log={log} toast={toast} setEditingMeal={vi.fn()} />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: /Видалити meal/ }),
    );

    expect(handleRemoveMeal).toHaveBeenCalledTimes(1);
    // showUndoToast always calls toast.show with type "info"
    expect(toast.show).toHaveBeenCalledTimes(1);
    const [, toastType] = (toast.show as ReturnType<typeof vi.fn>).mock
      .calls[0] as [unknown, string];
    expect(toastType).toBe("info");
  });

  it("the undo callback inside the toast calls handleRestoreMeal", async () => {
    const handleRemoveMeal = vi.fn();
    const handleRestoreMeal = vi.fn();
    const log = makeLog({ handleRemoveMeal, handleRestoreMeal });

    let capturedOnUndo: (() => void) | undefined;
    const toast = makeToast();
    (toast.show as ReturnType<typeof vi.fn>).mockImplementation(
      (_msg, _type, _dur, action?: { label: string; onClick: () => void }) => {
        capturedOnUndo = action?.onClick;
        return 1;
      },
    );

    render(
      <NutritionLogPage log={log} toast={toast} setEditingMeal={vi.fn()} />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: /Видалити meal/ }),
    );

    expect(capturedOnUndo).toBeDefined();
    capturedOnUndo!();
    expect(handleRestoreMeal).toHaveBeenCalledTimes(1);
  });

  it("clicking 'Редагувати meal' calls setEditingMeal with date + meal fields", async () => {
    const setAddMealSheetOpen = vi.fn();
    const setAddMealPhotoResult = vi.fn();
    const log = makeLog({ setAddMealSheetOpen, setAddMealPhotoResult });
    const toast = makeToast();
    const setEditingMeal = vi.fn();

    render(
      <NutritionLogPage
        log={log}
        toast={toast}
        setEditingMeal={setEditingMeal}
      />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: /Редагувати meal/ }),
    );

    expect(setEditingMeal).toHaveBeenCalledTimes(1);
    const firstCall = (setEditingMeal as ReturnType<typeof vi.fn>).mock
      .calls[0];
    const arg = firstCall?.[0];
    expect(arg).toMatchObject({ date: "2025-01-01", id: "m1" });
    // editing-meal also clears photo and reopens the sheet
    expect(setAddMealPhotoResult).toHaveBeenCalledWith(null);
    expect(setAddMealSheetOpen).toHaveBeenCalledWith(true);
  });

  it("multiple remove-meal calls each fire handleRemoveMeal and a toast", async () => {
    // Verifies the wiring is consistent across repeated clicks (no dedup/guard
    // that would silently drop the second call for the same meal id).
    const handleRemoveMeal = vi.fn();
    const handleRestoreMeal = vi.fn();
    const log = makeLog({ handleRemoveMeal, handleRestoreMeal });
    const toast = makeToast();

    render(
      <NutritionLogPage log={log} toast={toast} setEditingMeal={vi.fn()} />,
    );

    const removeBtn = screen.getByRole("button", { name: /Видалити meal/ });
    await userEvent.click(removeBtn);
    await userEvent.click(removeBtn);

    expect(handleRemoveMeal).toHaveBeenCalledTimes(2);
    expect(toast.show).toHaveBeenCalledTimes(2);
  });
});
