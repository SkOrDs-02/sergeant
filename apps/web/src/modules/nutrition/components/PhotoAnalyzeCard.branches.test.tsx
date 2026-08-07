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

  it("shows an inline status line next to the analyze button while analyzing", () => {
    render(<PhotoAnalyzeCard {...baseProps} analyzing />);
    expect(screen.getByRole("status")).toHaveTextContent("Аналізую фото…");
  });

  it("does not show the inline status line when neither analyzing nor refining", () => {
    render(<PhotoAnalyzeCard {...baseProps} />);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("shows an inline status line next to the refine button while refining", () => {
    render(
      <PhotoAnalyzeCard
        {...baseProps}
        refining
        photoResult={{
          dishName: "Борщ",
          macros: {},
          questions: ["Порція?"],
        }}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Уточнюю порцію та перераховую…",
    );
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

  it("refuses a non-food result: no macros, no save-to-log, no portion questions", () => {
    // Регресія фото кота: сервер віддає `isFood: false`, і картка не має
    // показувати ані КБЖВ, ані кнопку збереження, ані блок уточнень —
    // саме через них не-їжа потрапляла в денний журнал як `photoAI`.
    render(
      <PhotoAnalyzeCard
        {...baseProps}
        photoResult={{
          isFood: false,
          dishName: "Кіт",
          confidence: 1,
          macros: { kcal: null, protein_g: null, fat_g: null, carbs_g: null },
          questions: [],
        }}
        onSaveToLog={vi.fn()}
      />,
    );

    expect(screen.getByText("Не бачу тут страви")).toBeInTheDocument();
    expect(screen.getByText(/схоже на «Кіт»/)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Зберегти в журнал/ }),
    ).toBeNull();
    expect(screen.queryByText("Уточнення порції")).toBeNull();
    expect(screen.queryByText("Ккал")).toBeNull();
    expect(screen.queryByText(/Впевненість/)).toBeNull();
  });

  it("keeps the refusal readable when the model did not name the object", () => {
    render(
      <PhotoAnalyzeCard
        {...baseProps}
        photoResult={{ isFood: false, dishName: "", macros: {}, questions: [] }}
      />,
    );
    expect(
      screen.getByText(/На фото немає їжі, для якої можна порахувати КБЖВ/),
    ).toBeInTheDocument();
  });

  it("hides the confidence percentage when there are no macros to be confident about", () => {
    render(
      <PhotoAnalyzeCard
        {...baseProps}
        photoResult={{
          isFood: true,
          dishName: "Щось",
          confidence: 0.9,
          macros: {},
          questions: ["Що саме?"],
        }}
      />,
    );
    expect(screen.getByText("Щось")).toBeInTheDocument();
    expect(screen.queryByText(/Впевненість/)).toBeNull();
  });

  it("labels the confidence as recognition confidence when macros exist", () => {
    render(
      <PhotoAnalyzeCard
        {...baseProps}
        photoResult={{
          isFood: true,
          dishName: "Борщ",
          confidence: 0.82,
          macros: { kcal: 250, protein_g: 8, fat_g: 10, carbs_g: 30 },
          questions: [],
        }}
      />,
    );
    expect(
      screen.getByText(/Впевненість у розпізнаванні: 82%/),
    ).toBeInTheDocument();
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
