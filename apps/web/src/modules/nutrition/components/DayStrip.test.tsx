/** @vitest-environment jsdom */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { Meal } from "@sergeant/nutrition-domain";
import { DayStrip } from "./DayStrip";

afterEach(cleanup);

function meal(over: Partial<Meal> & { id: string }): Meal {
  return {
    name: "Страва",
    time: "12:00",
    mealType: "lunch",
    label: "",
    macros: { kcal: 500, protein_g: null, fat_g: null, carbs_g: null },
    source: "manual",
    macroSource: "manual",
    amount_g: null,
    foodId: null,
    ...over,
  } as Meal;
}

describe("DayStrip", () => {
  it("мовчить нижче порога — жодної порожньої рамки", () => {
    const { container } = render(<DayStrip meals={[meal({ id: "a" })]} />);
    expect(container.firstChild).toBeNull();
  });

  it("рендерить секцію з підписом і піком", () => {
    render(
      <DayStrip
        meals={[
          meal({ id: "a", time: "09:00" }),
          meal({
            id: "b",
            time: "14:00",
            macros: { kcal: 800, protein_g: null, fat_g: null, carbs_g: null },
          }),
        ]}
      />,
    );
    expect(
      screen.getByRole("region", { name: "Розподіл калорій за добу" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/пік 800/)).toBeInTheDocument();
  });

  /**
   * Головне рішення власника 2026-08-06: частка показується ЗАВЖДИ, а не
   * від порога 50%. Інакше день, угаданий на 49%, виглядає точно як день,
   * зважений до грама, — тобто здогадку видають за вимір.
   */
  it("показує частку здогадок навіть нижче порога 50%", () => {
    render(
      <DayStrip
        meals={[
          meal({
            id: "guess",
            time: "09:00",
            macroSource: "photoAI",
            macros: { kcal: 400, protein_g: null, fat_g: null, carbs_g: null },
          }),
          meal({
            id: "known",
            time: "14:00",
            macros: { kcal: 600, protein_g: null, fat_g: null, carbs_g: null },
          }),
        ]}
      />,
    );
    expect(screen.getByText(/оцінка з фото — 40%/)).toBeInTheDocument();
  });

  it("каже прямо, коли фото-оцінок немає зовсім", () => {
    render(
      <DayStrip
        meals={[
          meal({ id: "a", time: "09:00" }),
          meal({ id: "b", time: "14:00" }),
        ]}
      />,
    );
    expect(screen.getByText(/усе з бази або зважене/)).toBeInTheDocument();
  });

  /**
   * Без цього рядка смуга мовчки применшує день: людина бачить два
   * стовпчики, а в журналі під ними три записи.
   */
  it("називає кількість записів без часу", () => {
    render(
      <DayStrip
        meals={[
          meal({ id: "a", time: "09:00" }),
          meal({ id: "b", time: "14:00" }),
          meal({ id: "c", time: "" }),
        ]}
      />,
    );
    expect(screen.getByText(/без часу: 1/)).toBeInTheDocument();
  });

  it("віддає числа скрінрідеру таблицею, а картинку ховає", () => {
    const { container } = render(
      <DayStrip
        meals={[
          meal({ id: "a", time: "09:00" }),
          meal({ id: "b", time: "14:00" }),
        ]}
      />,
    );
    // Сітка стовпчиків не для AT — 24 фокусовані вузли зробили б обхід
    // довшим за читання журналу. Тому вона є в DOM і схована від AT.
    const grid = container.querySelector<HTMLElement>(
      "[style*='--strip-hours']",
    );
    expect(grid).not.toBeNull();
    expect(grid).toHaveAttribute("aria-hidden");
    const rows = screen.getAllByRole("row");
    // Заголовок + дві заповнені години.
    expect(rows).toHaveLength(3);
    expect(
      screen.getByRole("rowheader", { name: "09:00" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("rowheader", { name: "14:00" }),
    ).toBeInTheDocument();
  });
});
