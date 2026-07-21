// @vitest-environment jsdom
/**
 * Last validated: 2026-07-10
 * Status: Active
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SetStateAction } from "react";
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

  it("handles preview removal, file selection and analyze click", () => {
    const analyzePhoto = vi.fn();
    const onPickPhoto = vi.fn();
    render(
      <PhotoAnalyzeCard
        {...baseProps}
        analyzePhoto={analyzePhoto}
        onPickPhoto={onPickPhoto}
        photoPreviewUrl="blob:meal-photo"
      />,
    );

    expect(screen.getByAltText("Обране фото")).toHaveAttribute(
      "src",
      "blob:meal-photo",
    );
    fireEvent.click(screen.getByRole("button", { name: "Аналізувати" }));
    expect(analyzePhoto).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Прибрати фото" }));
    expect(onPickPhoto).toHaveBeenCalledWith(null);

    const file = new File(["img"], "borsch.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Обрати фото страви"), {
      target: { files: [file] },
    });
    expect(onPickPhoto).toHaveBeenCalledWith(file);
  });

  it("updates clarification answers and refines the photo result", () => {
    const refinePhoto = vi.fn();
    const setPortionGrams = vi.fn();
    let currentAnswers: Record<string, string> = {};
    const setAnswers = vi.fn(
      (update: SetStateAction<Record<string, string>>) => {
        currentAnswers =
          typeof update === "function" ? update(currentAnswers) : update;
      },
    );
    render(
      <PhotoAnalyzeCard
        {...baseProps}
        photoResult={{
          dishName: null,
          macros: {},
          questions: [
            "Скільки було борщу?",
            "Чи була сметана?",
            "Питання 3",
            "Питання 4",
            "Питання 5",
            "Питання 6",
            "Питання 7",
          ],
        }}
        portionGrams="320"
        setPortionGrams={setPortionGrams}
        refinePhoto={refinePhoto}
        answers={{ "Чи була сметана?": "так" }}
        setAnswers={setAnswers}
      />,
    );

    expect(screen.getByText("Страва")).toBeInTheDocument();
    expect(screen.getByText("Питання 6")).toBeInTheDocument();
    expect(screen.queryByText("Питання 7")).toBeNull();

    fireEvent.change(screen.getByDisplayValue("320"), {
      target: { value: "450" },
    });
    expect(setPortionGrams).toHaveBeenCalledWith("450");

    fireEvent.change(screen.getAllByPlaceholderText("твоя відповідь…")[0]!, {
      target: { value: "велика тарілка" },
    });
    expect(currentAnswers).toMatchObject({
      "Скільки було борщу?": "велика тарілка",
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Перерахувати за всіма відповідями" }),
    );
    expect(refinePhoto).toHaveBeenCalledTimes(1);
  });
});
