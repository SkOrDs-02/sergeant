// @vitest-environment jsdom
/**
 * Аркуш «Моя норма»: гість без мережі бачить розклад формули, зберігає вагу
 * (рівно один запис у fizruk-журнал) і пише норму патчем у prefs.
 */
import { vi } from "vitest";

const saveBiometrics = vi.fn();
const addEntry = vi.fn();
const patchProfileNutritionPrefs = vi.fn(() => true);
const toastSuccess = vi.fn();
const toastError = vi.fn();

function ageThirtyBirthDate(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 30);
  d.setDate(d.getDate() - 1);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

const BIOMETRICS = {
  heightCm: 180,
  birthDate: ageThirtyBirthDate(),
  sex: "male" as const,
  activityLevel: "sedentary" as const,
  weightKg: 80,
  weightUpdatedAt: "2026-01-01T00:00:00.000Z",
  countWorkoutsInGoal: false,
  updatedAt: "2026-01-01T00:00:00.000Z",
};

vi.mock("../../../core/profile/useBiometrics", () => ({
  useBiometrics: () => ({ biometrics: BIOMETRICS, saveBiometrics }),
}));
vi.mock("../../fizruk/hooks/useDailyLog", () => ({
  useDailyLog: () => ({ addEntry }),
}));
vi.mock("../../../core/profile/useLatestBodyWeight", () => ({
  useLatestBodyWeightKg: () => null,
}));
vi.mock("@shared/hooks/useToast", () => ({
  useToast: () => ({ success: toastSuccess, error: toastError, info: vi.fn() }),
}));
vi.mock("../lib/nutritionStorage", () => ({
  loadLatestNutritionPrefs: () => ({
    adaptiveGoalIntent: "maintenance",
    weeklyRateKg: 0.5,
    goalWeightKg: null,
  }),
  patchProfileNutritionPrefs: (...a: unknown[]) =>
    (patchProfileNutritionPrefs as (...x: unknown[]) => boolean)(...a),
}));

import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MyNormSheet } from "./MyNormSheet";

const text = (el: HTMLElement) => (el.textContent ?? "").replace(/\s/gu, " ");

afterEach(() => vi.clearAllMocks());

describe("MyNormSheet", () => {
  it("показує норму з розкладом формули: 1590 ккал, сидячий x 1,2, дефіцит 550", () => {
    render(<MyNormSheet open onClose={() => {}} />);
    fireEvent.click(screen.getByRole("tab", { name: "Схуднення" }));

    const body = text(document.body);
    expect(body).toContain("1 590 ккал на день");
    expect(body).toContain("Міффлін-Сан-Жеор");
    expect(body).toContain("сидячий × 1,2");
    expect(body).toContain("дефіцит 550 ккал");
  });

  it("гість без мережі зберігає вагу: addEntry рівно раз, норма йде в prefs", () => {
    vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
    const onClose = vi.fn();
    render(<MyNormSheet open onClose={onClose} />);
    fireEvent.click(screen.getByRole("tab", { name: "Схуднення" }));
    fireEvent.change(screen.getByLabelText("Поточна вага (кг)"), {
      target: { value: "79" },
    });

    expect(text(document.body)).toContain("1 570 ккал на день");
    fireEvent.click(screen.getByRole("button", { name: "Застосувати" }));

    expect(addEntry).toHaveBeenCalledTimes(1);
    expect(addEntry).toHaveBeenCalledWith({ weightKg: 79 });
    expect(patchProfileNutritionPrefs).toHaveBeenCalledWith(
      expect.objectContaining({
        dailyTargetKcal: 1570,
        weeklyRateKg: 0.5,
        goalWeightKg: null,
        adaptiveGoalIntent: "cutting",
      }),
    );
    expect(onClose).toHaveBeenCalled();
  });

  it("цільова вага дає орієнтовну дату цілі", () => {
    render(<MyNormSheet open onClose={() => {}} />);
    fireEvent.click(screen.getByRole("tab", { name: "Схуднення" }));
    fireEvent.change(screen.getByLabelText(/Цільова вага/u), {
      target: { value: "75" },
    });
    expect(text(document.body)).toContain("Орієнтовно до цілі");
  });
});
