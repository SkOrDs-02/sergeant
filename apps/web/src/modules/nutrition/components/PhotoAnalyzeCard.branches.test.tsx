// @vitest-environment jsdom
/**
 * Last validated: 2026-07-10
 * Status: Active
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PhotoAnalyzeCard } from "./PhotoAnalyzeCard";

const baseProps = {
  analyzePhoto: vi.fn(),
  fileRef: { current: null },
  onPickPhoto: vi.fn(),
  fmtMacro: (v: unknown) => (v == null ? "—" : String(v)),
  portionGrams: "",
  setPortionGrams: vi.fn(),
  refinePhoto: vi.fn(),
  answers: {},
  setAnswers: vi.fn(),
};

describe("PhotoAnalyzeCard", () => {
  it("shows drop-zone placeholder without preview", () => {
    render(<PhotoAnalyzeCard {...baseProps} />);
    expect(screen.getByText("Натисни щоб обрати фото")).toBeInTheDocument();
  });

  it("shows busy label on analyze button", () => {
    render(<PhotoAnalyzeCard {...baseProps} busy />);
    expect(screen.getByRole("button", { name: "…" })).toBeDisabled();
  });

  it("renders result and save-to-log", () => {
    const onSaveToLog = vi.fn();
    render(
      <PhotoAnalyzeCard
        {...baseProps}
        photoResult={{
          dishName: "Борщ",
          confidence: 0.82,
          macros: { kcal: 250, protein_g: 8, fat_g: 10, carbs_g: 30 },
          ingredients: [{ name: "буряк" }],
          questions: ["Порція?"],
        }}
        onSaveToLog={onSaveToLog}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Зберегти в журнал/ }));
    expect(onSaveToLog).toHaveBeenCalled();
  });
});
