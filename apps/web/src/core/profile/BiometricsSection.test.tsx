// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { STORAGE_KEYS } from "@sergeant/shared";

const toastSuccessMock = vi.fn();
const toastErrorMock = vi.fn();
const toastShowMock = vi.fn();
vi.mock("@shared/hooks/useToast", () => ({
  useToast: () => ({
    success: toastSuccessMock,
    error: toastErrorMock,
    show: toastShowMock,
  }),
}));

import { BIOMETRICS_DEFAULT, type Biometrics } from "./biometrics";
import { BiometricsSection } from "./BiometricsSection";

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});

function readStored(): Biometrics | null {
  const raw = localStorage.getItem(STORAGE_KEYS.HUB_BIOMETRICS);
  return raw ? (JSON.parse(raw) as Biometrics) : null;
}

describe("BiometricsSection", () => {
  it("renders empty defaults when nothing is stored", () => {
    render(<BiometricsSection />);

    expect(screen.getByLabelText("Зріст (см)")).toHaveValue(null);
    expect(screen.getByLabelText("Дата народження")).toHaveValue("");
    expect(screen.getByLabelText("Стать")).toHaveValue("");
    expect(screen.getByLabelText("Рівень активності")).toHaveValue("");
    expect(screen.getByLabelText("Поточна вага (кг)")).toHaveValue(null);
  });

  it("hydrates from a persisted record", () => {
    const stored: Biometrics = {
      heightCm: 178,
      birthDate: "1990-05-12",
      sex: "male",
      activityLevel: "moderate",
      weightKg: 80,
      weightUpdatedAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    localStorage.setItem(STORAGE_KEYS.HUB_BIOMETRICS, JSON.stringify(stored));

    render(<BiometricsSection />);

    expect(screen.getByLabelText("Зріст (см)")).toHaveValue(178);
    expect(screen.getByLabelText("Дата народження")).toHaveValue("1990-05-12");
    expect(screen.getByLabelText("Стать")).toHaveValue("male");
    expect(screen.getByLabelText("Рівень активності")).toHaveValue("moderate");
    expect(screen.getByLabelText("Поточна вага (кг)")).toHaveValue(80);
  });

  it("disables Зберегти until the form is dirty", () => {
    render(<BiometricsSection />);
    const save = screen.getByRole("button", { name: "Зберегти" });
    expect(save).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Зріст (см)"), {
      target: { value: "180" },
    });
    expect(save).not.toBeDisabled();
  });

  it("persists every field on Save and emits a success toast", () => {
    render(<BiometricsSection />);

    fireEvent.change(screen.getByLabelText("Зріст (см)"), {
      target: { value: "175" },
    });
    fireEvent.change(screen.getByLabelText("Дата народження"), {
      target: { value: "1992-04-10" },
    });
    fireEvent.change(screen.getByLabelText("Стать"), {
      target: { value: "female" },
    });
    fireEvent.change(screen.getByLabelText("Рівень активності"), {
      target: { value: "active" },
    });
    fireEvent.change(screen.getByLabelText("Поточна вага (кг)"), {
      target: { value: "62.4" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Зберегти" }));

    const stored = readStored();
    expect(stored).toMatchObject({
      heightCm: 175,
      birthDate: "1992-04-10",
      sex: "female",
      activityLevel: "active",
      weightKg: 62.4,
    });
    expect(toastSuccessMock).toHaveBeenCalledWith("Біометрію збережено");
  });

  it("mirrors a Profile-side weight write into fizruk_daily_log_v1", () => {
    render(<BiometricsSection />);

    fireEvent.change(screen.getByLabelText("Поточна вага (кг)"), {
      target: { value: "70" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Зберегти" }));

    const log = JSON.parse(
      localStorage.getItem(STORAGE_KEYS.FIZRUK_DAILY_LOG) ?? "[]",
    );
    expect(log).toHaveLength(1);
    expect(log[0].weightKg).toBe(70);
  });

  it("shows the activity-level hint when one is selected", () => {
    render(<BiometricsSection />);

    fireEvent.change(screen.getByLabelText("Рівень активності"), {
      target: { value: "moderate" },
    });

    expect(
      screen.getByText("Тренування 3-5 днів на тиждень"),
    ).toBeInTheDocument();
  });

  it("renders the computed age helper when birthDate is set", () => {
    const stored: Biometrics = {
      ...BIOMETRICS_DEFAULT,
      birthDate: "1990-01-01",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    localStorage.setItem(STORAGE_KEYS.HUB_BIOMETRICS, JSON.stringify(stored));

    render(<BiometricsSection />);

    expect(screen.getByText(/Вік:/)).toBeInTheDocument();
  });

  it("disables every input when offline", () => {
    render(<BiometricsSection online={false} />);

    expect(screen.getByLabelText("Зріст (см)")).toBeDisabled();
    expect(screen.getByLabelText("Дата народження")).toBeDisabled();
    expect(screen.getByLabelText("Стать")).toBeDisabled();
    expect(screen.getByLabelText("Рівень активності")).toBeDisabled();
    expect(screen.getByLabelText("Поточна вага (кг)")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Зберегти" })).toBeDisabled();
  });
});
