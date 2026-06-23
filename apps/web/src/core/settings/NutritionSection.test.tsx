// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const navigate = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => navigate };
});

const persistNutritionPrefs = vi.fn((_p: unknown): boolean => true);
const persistPantries = vi.fn((..._args: unknown[]): boolean => true);
const loadNutritionPrefs = vi.fn();
const loadPantries = vi.fn();
const loadActivePantryId = vi.fn();

const DEFAULT_PREFS = {
  dailyTargetKcal: 2000,
  dailyTargetProtein_g: 120,
  dailyTargetFat_g: 70,
  dailyTargetCarbs_g: 230,
  waterGoalMl: 2000,
};

vi.mock("../../modules/nutrition/lib/nutritionStorage", () => ({
  defaultNutritionPrefs: () => ({ ...DEFAULT_PREFS }),
  loadActivePantryId: () => loadActivePantryId(),
  loadNutritionPrefs: () => loadNutritionPrefs(),
  loadPantries: () => loadPantries(),
  persistNutritionPrefs: (p: unknown) => persistNutritionPrefs(p),
  persistPantries: (...args: unknown[]) => persistPantries(...args),
}));

import { NutritionSection } from "./NutritionSection";

function renderSection() {
  return render(
    <MemoryRouter>
      <NutritionSection />
    </MemoryRouter>,
  );
}

describe("NutritionSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    loadNutritionPrefs.mockReturnValue({ ...DEFAULT_PREFS });
    loadPantries.mockReturnValue([
      { id: "home", name: "Дім", items: [{ id: "a" }] },
      { id: "work", name: "", items: [] },
    ]);
    loadActivePantryId.mockReturnValue("home");
    persistNutritionPrefs.mockReturnValue(true);
  });
  afterEach(() => vi.clearAllMocks());

  it("renders the daily target fields and persists prefs on mount", () => {
    renderSection();
    expect(screen.getByText("Харчування")).toBeInTheDocument();
    expect(screen.getByText("Калорії")).toBeInTheDocument();
    // persistNutritionPrefs is invoked by the mount effect
    expect(persistNutritionPrefs).toHaveBeenCalled();
  });

  it("commits an edited number field on blur", () => {
    renderSection();
    // "Калорії" and "Вода" both use placeholder 2000; scope to the
    // Калорії <label> row to grab the right input.
    const kcalLabel = screen.getByText("Калорії").closest("label")!;
    const kcalInput = within(kcalLabel).getByRole("spinbutton");
    fireEvent.change(kcalInput, { target: { value: "2500" } });
    fireEvent.blur(kcalInput);
    // The effect re-persists with the patched value
    const lastCall = persistNutritionPrefs.mock.calls.at(-1)?.[0] as {
      dailyTargetKcal: number;
    };
    expect(lastCall.dailyTargetKcal).toBe(2500);
  });

  it("shows a storage error banner when persisting fails", () => {
    persistNutritionPrefs.mockReturnValue(false);
    renderSection();
    expect(
      screen.getByText(/Не вдалося зберегти налаштування/i),
    ).toBeInTheDocument();
  });

  it("resets daily targets to defaults", () => {
    renderSection();
    fireEvent.click(screen.getByRole("button", { name: /Скинути цілі/i }));
    const lastCall = persistNutritionPrefs.mock.calls.at(-1)?.[0] as {
      dailyTargetKcal: number;
    };
    expect(lastCall.dailyTargetKcal).toBe(DEFAULT_PREFS.dailyTargetKcal);
  });

  it("renders the pantry picker with options and switches active pantry", () => {
    renderSection();
    const select = screen.getByRole("combobox");
    // Two pantries → two options, with item-count suffix on the first
    const options = within(select).getAllByRole("option");
    expect(options.length).toBe(2);
    fireEvent.change(select, { target: { value: "work" } });
    expect(persistPantries).toHaveBeenCalledWith(
      undefined,
      undefined,
      expect.any(Array),
      "work",
    );
  });

  it("navigates to the pantry manager", () => {
    renderSection();
    fireEvent.click(
      screen.getByRole("button", { name: /Відкрити менеджер комори/i }),
    );
    expect(navigate).toHaveBeenCalledWith("/nutrition/pantry");
  });

  it("renders 'Немає комор' when there are no pantries", () => {
    loadPantries.mockReturnValue([]);
    renderSection();
    expect(screen.getByText("Немає комор")).toBeInTheDocument();
  });
});
