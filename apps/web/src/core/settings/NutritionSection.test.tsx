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

const patchNutritionPrefs = vi.fn((_p: unknown): boolean => true);
const loadNutritionPrefs = vi.fn();
// data-04: гідратацію prefs керує тест (за замовчуванням гідратовано).
const hydration = { value: true };

const DEFAULT_PREFS = {
  dailyTargetKcal: 2000,
  dailyTargetProtein_g: 120,
  dailyTargetFat_g: 70,
  dailyTargetCarbs_g: 230,
  waterGoalMl: 2000,
  adaptiveGoalEnabled: false,
  adaptiveGoalLastUpdatedAt: null,
};

vi.mock("../../modules/nutrition/lib/nutritionStorage", () => ({
  defaultNutritionPrefs: () => ({ ...DEFAULT_PREFS }),
  patchNutritionPrefs: (p: unknown) => patchNutritionPrefs(p),
}));
vi.mock("../../modules/nutrition/hooks/useNutritionPrefsHydration", () => ({
  useNutritionPrefsSnapshot: () => ({
    prefs: loadNutritionPrefs(),
    hydrated: hydration.value,
  }),
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
    hydration.value = true;
    loadNutritionPrefs.mockReturnValue({ ...DEFAULT_PREFS });
    patchNutritionPrefs.mockReturnValue(true);
  });
  afterEach(() => vi.clearAllMocks());

  it("renders the section and does NOT write anything on mount", () => {
    renderSection();
    expect(screen.getByText("Їжа")).toBeInTheDocument();
    expect(screen.getByText("Денна норма")).toBeInTheDocument();
    // data-04: раніше mount-ефект слав цілий blob з холодного кешу.
    expect(patchNutritionPrefs).not.toHaveBeenCalled();
  });

  it("commits an edited number field on blur as a single-field patch", () => {
    renderSection();
    const waterLabel = screen.getByText("Денна норма").closest("label")!;
    const waterInput = within(waterLabel).getByRole("spinbutton");
    fireEvent.change(waterInput, { target: { value: "2500" } });
    fireEvent.blur(waterInput);
    // Лише змінене поле: решту prefs бере з кешу `patchNutritionPrefs`.
    expect(patchNutritionPrefs).toHaveBeenLastCalledWith({ waterGoalMl: 2500 });
  });

  it("shows a storage error banner when persisting fails", async () => {
    patchNutritionPrefs.mockReturnValue(false);
    renderSection();
    const waterLabel = screen.getByText("Денна норма").closest("label")!;
    const waterInput = within(waterLabel).getByRole("spinbutton");
    fireEvent.change(waterInput, { target: { value: "2500" } });
    fireEvent.blur(waterInput);
    await waitFor(() => {
      expect(
        screen.getByText(/Не вдалося зберегти налаштування/i),
      ).toBeInTheDocument();
    });
  });

  it("data-04: до гідратації контроли заблоковані й нічого не пишеться", () => {
    hydration.value = false;
    renderSection();
    const waterLabel = screen.getByText("Денна норма").closest("label")!;
    const waterInput = within(waterLabel).getByRole("spinbutton");
    expect(waterInput).toBeDisabled();
    const toggle = screen.getByRole("switch", { name: "Автокалібрування" });
    expect(toggle).toBeDisabled();
    fireEvent.click(toggle);
    expect(patchNutritionPrefs).not.toHaveBeenCalled();
    expect(screen.getByText(/ще завантажуються/i)).toBeInTheDocument();
  });

  it("data-04: після гідратації поле показує значення акаунта з кешу, а не дефолт", () => {
    hydration.value = false;
    loadNutritionPrefs.mockReturnValue({ ...DEFAULT_PREFS, waterGoalMl: 2000 });
    const view = renderSection();
    const waterInput = () =>
      within(screen.getByText("Денна норма").closest("label")!).getByRole(
        "spinbutton",
      ) as HTMLInputElement;
    expect(waterInput().value).toBe("2000");

    // Pull приніс рядок prefs: тік кешу перерендерює секцію.
    hydration.value = true;
    loadNutritionPrefs.mockReturnValue({ ...DEFAULT_PREFS, waterGoalMl: 2750 });
    view.rerender(
      <MemoryRouter>
        <NutritionSection />
      </MemoryRouter>,
    );
    expect(waterInput().value).toBe("2750");
    expect(waterInput()).not.toBeDisabled();
    expect(patchNutritionPrefs).not.toHaveBeenCalled();
  });

  it("data-04: після гідратації тумблер знову працює", () => {
    hydration.value = true;
    renderSection();
    const toggle = screen.getByRole("switch", { name: "Автокалібрування" });
    expect(toggle).not.toBeDisabled();
    expect(screen.queryByText(/ще завантажуються/i)).not.toBeInTheDocument();
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

  it("toggles adaptiveGoalEnabled and patches only that field", () => {
    renderSection();
    const toggle = screen.getByRole("switch", { name: "Автокалібрування" });
    expect(toggle).toHaveAttribute("aria-checked", "false");
    fireEvent.click(toggle);
    const lastCall = patchNutritionPrefs.mock.calls.at(-1)?.[0] as Record<
      string,
      unknown
    >;
    expect(lastCall["adaptiveGoalEnabled"]).toBe(true);
    // Шаблони страв, вода, нагадування у патч не потрапляють.
    expect(lastCall).not.toHaveProperty("mealTemplates");
    expect(lastCall).not.toHaveProperty("reminderEnabled");
  });

  it("navigates to the pantry manager", () => {
    renderSection();
    fireEvent.click(
      screen.getByRole("button", { name: /Відкрити менеджер комори/i }),
    );
    expect(navigate).toHaveBeenCalledWith("/nutrition/pantry");
  });

  // V-13 (profile/settings deep audit 2026-08-08, §«Вкладка Розділи») —
  // без `module="nutrition"` іконка секції рендериться нейтрально-сірою.
  // Перевіряємо, що бейдж іконки несе саме nutrition-акцент.
});
