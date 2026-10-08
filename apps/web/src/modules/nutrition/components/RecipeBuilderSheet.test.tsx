// @vitest-environment jsdom
/**
 * Last validated: 2026-10-08
 * Status: Active
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const hit = (
  id: string,
  name: string,
  kcal: number,
  p: number,
  f: number,
  c: number,
  defaultGrams: number,
) => ({
  id,
  name,
  brand: "",
  norm: name,
  defaultGrams,
  per100: { kcal, protein_g: p, fat_g: f, carbs_g: c },
  updatedAt: 1,
});

vi.mock("./meal-sheet/useFoodSearch", () => ({
  useFoodSearch: () => ({
    foodHits: [
      hit("f1", "Гречка варена", 110, 4.2, 1.1, 21.3, 250),
      hit("f2", "Куряче філе", 165, 31, 3.6, 0, 150),
      hit("f3", "Олія", 884, 0, 100, 0, 10),
    ],
    offHits: [],
    foodBusy: false,
    offBusy: false,
    searchSettled: true,
    foodErr: "",
    setFoodErr: vi.fn(),
  }),
}));

import { RecipeBuilderSheet } from "./RecipeBuilderSheet";

afterEach(cleanup);

function setup() {
  const onSave = vi.fn();
  render(
    <RecipeBuilderSheet
      initial={null}
      fmtMacro={(v) => String(Math.round(Number(v) * 100) / 100)}
      onClose={vi.fn()}
      onSave={onSave}
    />,
  );
  return onSave;
}

const saveBtn = () =>
  screen.getByRole("button", { name: "Зберегти" }) as HTMLButtonElement;

function fillControl() {
  fireEvent.change(screen.getByLabelText("Назва страви"), {
    target: { value: "Гречка з філе" },
  });
  for (const name of [/Гречка варена/, /Куряче філе/, /Олія/]) {
    fireEvent.click(screen.getByRole("button", { name }));
  }
  fireEvent.change(screen.getByLabelText("Порцій"), { target: { value: "2" } });
}

describe("RecipeBuilderSheet", () => {
  it("«Зберегти» неактивна без назви, інгредієнта, порцій; активна з порожньою вагою", () => {
    setup();
    expect(saveBtn().disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Назва страви"), {
      target: { value: "Суп" },
    });
    expect(saveBtn().disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /Гречка варена/ }));
    expect(saveBtn().disabled).toBe(false);
    fireEvent.change(screen.getByLabelText("Порцій"), {
      target: { value: "0" },
    });
    expect(saveBtn().disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Порцій"), {
      target: { value: "1" },
    });
    expect(saveBtn().disabled).toBe(false);
  });

  it("контроль: на порцію 305,45, на 100 г з'являється лише з вагою", () => {
    setup();
    fillControl();
    expect(screen.getByText(/На порцію: 305\.45 ккал/)).toBeTruthy();
    expect(screen.queryByText(/На 100 г:/)).toBeNull();
    fireEvent.change(screen.getByLabelText("Вага готової страви, г"), {
      target: { value: "400" },
    });
    expect(screen.getByText(/На 100 г: 152\.73 ккал/)).toBeTruthy();
  });

  it("зберігає склад, похідні ingredients, macros на порцію і вагу", () => {
    const onSave = setup();
    fillControl();
    fireEvent.change(screen.getByLabelText("Вага готової страви, г"), {
      target: { value: "400" },
    });
    fireEvent.click(saveBtn());
    const r = onSave.mock.calls[0]?.[0];
    expect(r.title).toBe("Гречка з філе");
    expect(r.servings).toBe(2);
    expect(r.cookedWeightG).toBe(400);
    expect(r.components).toHaveLength(3);
    expect(r.ingredients[0]).toBe("Гречка варена, 250 г");
    expect(r.macros.kcal).toBeCloseTo(305.45, 5);
  });

  it("невалідна вага: помилка під полем, збереження з null", () => {
    const onSave = setup();
    fillControl();
    fireEvent.change(screen.getByLabelText("Вага готової страви, г"), {
      target: { value: "0" },
    });
    expect(screen.getByRole("alert").textContent).toMatch(/вагу від 1/);
    expect(saveBtn().disabled).toBe(false);
    fireEvent.click(saveBtn());
    expect(onSave.mock.calls[0]?.[0].cookedWeightG).toBeNull();
  });

  it("«Прибрати» знімає рядок", () => {
    setup();
    fillControl();
    fireEvent.click(screen.getByRole("button", { name: "Прибрати: Олія" }));
    expect(screen.queryByLabelText("Грами: Олія")).toBeNull();
  });
});
