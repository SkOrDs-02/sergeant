// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { renderSettingsSection } from "../../test/helpers/collapsibleSection";

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
  return renderSettingsSection(
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

  it("renders the section and persists prefs on mount", () => {
    renderSection();
    expect(screen.getByText("Їжа")).toBeInTheDocument();
    expect(screen.getByText("Денна норма")).toBeInTheDocument();
    // persistNutritionPrefs is invoked by the mount effect
    expect(persistNutritionPrefs).toHaveBeenCalled();
  });

  it("commits an edited number field on blur", () => {
    renderSection();
    const waterLabel = screen.getByText("Денна норма").closest("label")!;
    const waterInput = within(waterLabel).getByRole("spinbutton");
    fireEvent.change(waterInput, { target: { value: "2500" } });
    fireEvent.blur(waterInput);
    // The effect re-persists with the patched value
    const lastCall = persistNutritionPrefs.mock.calls.at(-1)?.[0] as {
      waterGoalMl: number;
    };
    expect(lastCall.waterGoalMl).toBe(2500);
  });

  it("shows a storage error banner when persisting fails", async () => {
    persistNutritionPrefs.mockReturnValue(false);
    renderSection();
    await waitFor(() => {
      expect(
        screen.getByText(/Не вдалося зберегти налаштування/i),
      ).toBeInTheDocument();
    });
  });

  // Редактор КБЖВ живе тільки в модулі Їжі (`DailyPlanCard`). Ні полів, ні
  // посилання на них у налаштуваннях більше немає.
  it("does not surface the macro editor at all", () => {
    renderSection();
    expect(screen.queryByText("Калорії")).not.toBeInTheDocument();
    expect(screen.queryByText("Білки")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /цілі в модулі Їжі/i }),
    ).not.toBeInTheDocument();
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

  // V-13 (profile/settings deep audit 2026-08-08, §«Вкладка Розділи») —
  // без `module="nutrition"` іконка секції рендериться нейтрально-сірою.
  // Перевіряємо, що бейдж іконки несе саме nutrition-акцент.
  it("renders the section icon badge with the nutrition module accent", () => {
    const { container } = renderSection();
    const badge = container.querySelector("svg")?.closest("span");
    expect(badge).not.toBeNull();
    expect(badge?.className).toContain("bg-nutrition-soft");
    expect(badge?.className).toContain("border-nutrition-soft-border");
    expect(badge?.className).toContain("text-nutrition");
  });
});
