// @vitest-environment jsdom
/**
 * Last validated: 2026-07-10
 * Status: Active
 * Unit tests for photo-analysis card interactions.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";

import { PhotoAnalyzeCard } from "./PhotoAnalyzeCard";

function renderCard(overrides: Record<string, unknown> = {}) {
  const analyzePhoto = vi.fn();
  const onPickPhoto = vi.fn();
  const setPortionGrams = vi.fn();
  const setAnswers = vi.fn();
  const refinePhoto = vi.fn();
  const onSaveToLog = vi.fn();
  const fileRef = createRef<HTMLInputElement>();

  const props = {
    analyzePhoto,
    fileRef,
    onPickPhoto,
    portionGrams: "250",
    setPortionGrams,
    refinePhoto,
    answers: {},
    setAnswers,
    fmtMacro: (v: unknown) => (v == null ? "—" : String(v)),
    ...overrides,
  };

  const view = render(
    <PhotoAnalyzeCard {...props} onSaveToLog={onSaveToLog} />,
  );
  return { ...view, analyzePhoto, onPickPhoto, refinePhoto, onSaveToLog };
}

describe("PhotoAnalyzeCard", () => {
  it("triggers analyzePhoto from the primary action", () => {
    const { analyzePhoto } = renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Аналізувати" }));
    expect(analyzePhoto).toHaveBeenCalledTimes(1);
  });

  it("shows busy label and disables actions when busy", () => {
    renderCard({ busy: true });
    expect(screen.getByRole("button", { name: "…" })).toBeDisabled();
    expect(screen.getByLabelText("Обрати фото страви")).toBeDisabled();
  });

  it("renders analysis results, macros, and save action", () => {
    const { onSaveToLog } = renderCard({
      photoResult: {
        dishName: "Борщ",
        confidence: 0.82,
        macros: { kcal: 320, protein_g: 12, fat_g: 8, carbs_g: 40 },
        ingredients: [{ name: "буряк" }],
        questions: ["Чи була сметана?"],
      },
    });

    expect(screen.getByText("Борщ")).toBeInTheDocument();
    expect(screen.getByText(/Впевненість: 82%/)).toBeInTheDocument();
    expect(screen.getByText("320")).toBeInTheDocument();
    expect(screen.getByText(/буряк/)).toBeInTheDocument();
    expect(screen.getByText("Чи була сметана?")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Зберегти в журнал/ }));
    expect(onSaveToLog).toHaveBeenCalledTimes(1);
  });
});
