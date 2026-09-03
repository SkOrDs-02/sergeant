// @vitest-environment jsdom
/**
 * Last validated: 2026-08-22
 * Status: Active
 * Unit tests for `PickedFoodCard` — вага порції і живий перерахунок КБЖВ
 * на кроці «fill».
 */
import { fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Колесо рендериться лише на coarse pointer, а jsdom — fine. Мокаємо і
// вказівник, і саме колесо, щоб перевірити діапазон його значень.
const coarse = vi.hoisted(() => ({ value: false }));
vi.mock("@shared/hooks/useCoarsePointer", () => ({
  useCoarsePointer: () => coarse.value,
}));
const wheelValues = vi.hoisted(() => ({ current: [] as number[] }));
vi.mock("@shared/components/ui/WheelPicker", () => ({
  WheelPicker: ({ values }: { values: number[] }) => {
    wheelValues.current = values;
    return <div data-testid="wheel" />;
  },
}));

vi.mock("./MacroChip", () => ({
  MacroChip: ({ label, value }: { label: string; value: number | null }) => (
    <div data-testid="macro-chip">
      {label}:{value ?? "—"}
    </div>
  ),
}));

import { PickedFoodCard } from "./PickedFoodCard";
import type { PickedFood } from "./FoodPickerSection";
import type { MealFormState } from "./mealFormUtils";

function form(overrides: Partial<MealFormState> = {}): MealFormState {
  return {
    name: "",
    mealType: "lunch",
    time: "12:00",
    kcal: "",
    protein_g: "",
    fat_g: "",
    carbs_g: "",
    err: "",
    ...overrides,
  };
}

type CardProps = ComponentProps<typeof PickedFoodCard>;

const picked: PickedFood = {
  id: "f1",
  name: "Курка",
  brand: "Наша Ряба",
  defaultGrams: 100,
  per100: { kcal: 110, protein_g: 23, fat_g: 2, carbs_g: 0 },
};

function baseProps(overrides: Partial<CardProps> = {}): CardProps {
  return {
    form: form(),
    setForm: vi.fn(),
    pickedFood: picked,
    pickedGrams: "100",
    setPickedGrams: vi.fn(),
    onChangeProduct: vi.fn(),
    ...overrides,
  };
}

afterEach(() => vi.clearAllMocks());

describe("PickedFoodCard", () => {
  it("renders the picked-food card with per-100 macros", () => {
    render(<PickedFoodCard {...baseProps({ form: form({ kcal: "110" }) })} />);
    expect(screen.getByText(/Курка · Наша Ряба/)).toBeInTheDocument();
    expect(screen.getByText(/\/ 100 г/)).toBeInTheDocument();
    expect(screen.getAllByTestId("macro-chip").length).toBe(4);
  });

  it("recalculates form macros from picked food and comma grams", () => {
    const setForm = vi.fn();
    render(
      <PickedFoodCard
        {...baseProps({
          pickedFood: {
            ...picked,
            per100: { kcal: 120, protein_g: 20, fat_g: 5, carbs_g: 10 },
          },
          pickedGrams: "50,5",
          setForm,
        })}
      />,
    );

    const updater = setForm.mock.calls[0]?.[0] as (
      state: MealFormState,
    ) => MealFormState;
    // Назва тут порожня навмисно: цей тест про перерахунок макросів.
    // Поведінку назви (своя виживає, порожня засівається) перевіряє
    // окремий тест нижче — доти вона тут перевірялась «навпаки» й
    // фіксувала баг: продукт затирав перейменовану страву.
    expect(updater(form({ name: "" }))).toMatchObject({
      name: "Курка Наша Ряба",
      kcal: "61",
      protein_g: "10",
      fat_g: "3",
      carbs_g: "5",
      err: "",
    });
  });

  it("renders the OFF badge for a picked Open Food Facts product", () => {
    render(
      <PickedFoodCard
        {...baseProps({ pickedFood: { ...picked, source: "off" } })}
      />,
    );
    // Позначка «Open Food Facts» — тепер `<Icon title="…">`, а не emoji.
    expect(screen.getByTitle("Open Food Facts")).toBeInTheDocument();
  });

  it("increments and decrements the gram portion", () => {
    const setPickedGrams = vi.fn();
    render(<PickedFoodCard {...baseProps({ setPickedGrams })} />);
    fireEvent.click(screen.getByLabelText("Збільшити"));
    expect(setPickedGrams).toHaveBeenCalledWith("110");
    fireEvent.click(screen.getByLabelText("Зменшити"));
    expect(setPickedGrams).toHaveBeenCalledWith("90");
  });

  it("uses smaller portion steps below 50 grams", () => {
    const setPickedGrams = vi.fn();
    render(
      <PickedFoodCard {...baseProps({ pickedGrams: "25", setPickedGrams })} />,
    );
    fireEvent.click(screen.getByLabelText("Збільшити"));
    expect(setPickedGrams).toHaveBeenCalledWith("30");
    fireEvent.click(screen.getByLabelText("Зменшити"));
    expect(setPickedGrams).toHaveBeenCalledWith("20");
  });

  it("applies a quick-portion preset", () => {
    const setPickedGrams = vi.fn();
    render(<PickedFoodCard {...baseProps({ setPickedGrams })} />);
    fireEvent.click(screen.getByText("200"));
    expect(setPickedGrams).toHaveBeenCalledWith("200");
  });

  it("не затирає назву, яку людина вже переписала", () => {
    const setForm = vi.fn();
    render(<PickedFoodCard {...baseProps({ pickedGrams: "150", setForm })} />);
    const updater = setForm.mock.calls[0]?.[0] as (
      state: MealFormState,
    ) => MealFormState;
    // Ефект перезапускається на кожну зміну ваги — своя назва має вижити.
    expect(updater(form({ name: "Мій обід" }))).toMatchObject({
      name: "Мій обід",
    });
    // А в порожнє поле назва продукту сіється, як і раніше.
    expect(updater(form({ name: "" }))).toMatchObject({
      name: "Курка Наша Ряба",
    });
  });

  it("не перераховує КБЖВ, поки поле ваги порожнє", () => {
    const setForm = vi.fn();
    render(<PickedFoodCard {...baseProps({ pickedGrams: "", setForm })} />);
    // Порожнє поле не має підставляти `defaultGrams`: плашки внизу
    // інакше показували б КБЖВ на 100 г під порожнім інпутом.
    expect(setForm).not.toHaveBeenCalled();
  });

  it("тримає стелю ваги і на кнопці «+», не лише на набраному вручну", () => {
    const setPickedGrams = vi.fn();
    render(
      <PickedFoodCard
        {...baseProps({ pickedGrams: "10000", setPickedGrams })}
      />,
    );
    fireEvent.click(screen.getByLabelText("Збільшити"));
    expect(setPickedGrams).toHaveBeenCalledWith("10000");
  });

  it("тримає дробову вагу точною, а не округлює під колесо", () => {
    // 12.5 г округлювалось у колесі до 13, поки макроси рахувались із
    // 12.5 — екран показував не ту вагу, за якою рахував.
    const setForm = vi.fn();
    render(<PickedFoodCard {...baseProps({ pickedGrams: "12.5", setForm })} />);
    const updater = setForm.mock.calls[0]?.[0] as (
      state: MealFormState,
    ) => MealFormState;
    // 110 ккал / 100 г × 12.5 г = 13.75 → 14
    expect(updater(form())).toMatchObject({ kcal: "14" });
    // jsdom — fine pointer, тож рендериться степер, а не колесо.
    expect(screen.getByLabelText("Грами")).toHaveValue("12.5");
  });

  it("не перераховує КБЖВ під нульову вагу", () => {
    // «0» набирається так само легко, як порожнє поле, і доти відкочував
    // розрахунок на `defaultGrams`: у полі 0, а плашки — на 100 г.
    const setForm = vi.fn();
    render(<PickedFoodCard {...baseProps({ pickedGrams: "0", setForm })} />);
    expect(setForm).not.toHaveBeenCalled();
  });

  it("колесо покриває всю дозволену межу, а не лише до 1000 г", () => {
    // На тачі колесо ПІДМІНЯЄ текстове поле, тож вага понад 1000 г була
    // недосяжна взагалі, хоча стеля — 10 000 г.
    coarse.value = true;
    try {
      render(<PickedFoodCard {...baseProps({ pickedGrams: "2000" })} />);
      expect(screen.getByTestId("wheel")).toBeInTheDocument();
      const vals = wheelValues.current;
      expect(vals).toContain(2000);
      expect(vals).toContain(5000);
      expect(vals[vals.length - 1]).toBe(10000);
      // Дрібний крок там, де живуть реальні порції.
      expect(vals).toContain(125);
    } finally {
      coarse.value = false;
    }
  });

  it("hands 'обрати інший продукт' back to the host", () => {
    const onChangeProduct = vi.fn();
    render(<PickedFoodCard {...baseProps({ onChangeProduct })} />);
    fireEvent.click(screen.getByLabelText("Обрати інший продукт"));
    expect(onChangeProduct).toHaveBeenCalled();
  });

  // Регресія browser-QA 2026-09-02. Аркуш редагування відновлює продукт із
  // `foodId`, і без цього гарда ефект картки миттю переписував би збережені
  // макроси добутком `per100 × вага` — тобто саме лише ВІДКРИТТЯ страви
  // тихо міняло б її дані. Найболючіше для страв, чиї КБЖВ людина правила
  // руками або які приїхали з фото.
  describe("skipInitialRescale", () => {
    it("не чіпає форму на першому рендері", () => {
      const setForm = vi.fn();
      render(
        <PickedFoodCard
          {...baseProps({
            form: form({ kcal: "999", protein_g: "1" }),
            pickedGrams: "150",
            setForm,
            skipInitialRescale: true,
          })}
        />,
      );
      expect(setForm).not.toHaveBeenCalled();
    });

    it("вмикає перерахунок, щойно людина міняє вагу", () => {
      const setForm = vi.fn();
      const { rerender } = render(
        <PickedFoodCard
          {...baseProps({
            form: form({ kcal: "999" }),
            pickedGrams: "150",
            setForm,
            skipInitialRescale: true,
          })}
        />,
      );
      expect(setForm).not.toHaveBeenCalled();

      rerender(
        <PickedFoodCard
          {...baseProps({
            form: form({ kcal: "999" }),
            pickedGrams: "200",
            setForm,
            skipInitialRescale: true,
          })}
        />,
      );
      expect(setForm).toHaveBeenCalledTimes(1);
      const updater = setForm.mock.calls[0]?.[0] as (
        state: MealFormState,
      ) => MealFormState;
      // 110 ккал/100 г × 200 г = 220.
      expect(updater(form({ kcal: "999" })).kcal).toBe("220");
    });

    it("без прапорця перераховує одразу — шлях створення не змінився", () => {
      const setForm = vi.fn();
      render(
        <PickedFoodCard {...baseProps({ pickedGrams: "200", setForm })} />,
      );
      expect(setForm).toHaveBeenCalledTimes(1);
    });
  });
});
