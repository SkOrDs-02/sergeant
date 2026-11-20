// @vitest-environment jsdom
/**
 * Last validated: 2026-11-19
 * Status: Active
 * `PickedFoodCard` із побутовою порцією корпусу (OD-27 Х-1 а): старт з
 * однієї одиниці, назва одиниці узгоджена з кількістю, перерахунок КБЖВ, і
 * вага минулого запису людини важливіша за дефолт корпусу (Х-1 б).
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@shared/hooks/useCoarsePointer", () => ({
  useCoarsePointer: () => false,
}));

import { withHouseholdServing } from "../../lib/foodDb/householdPortions";
import type { LastFoodPortion } from "../../lib/lastFoodPortion";
import { PickedFoodCard } from "./PickedFoodCard";
import type { PickedFood } from "./FoodPickerSection";
import { rememberLastUnit } from "./portionUnits";
import type { MealFormState } from "./mealFormUtils";

const EGG: PickedFood = withHouseholdServing({
  id: "gen_iaitse-kuriache",
  name: "Яйце куряче",
  brand: "",
  defaultGrams: 100,
  per100: { kcal: 143, protein_g: 12.6, fat_g: 9.5, carbs_g: 0.7 },
});

const grams = () => screen.getByTestId("grams").textContent;
const lastForm = { current: null as null | MealFormState };

function Harness({ last = null }: { last?: LastFoodPortion | null }) {
  // Як `FoodPickerSection`: на старті стоїть типова вага продукту.
  const [pickedGrams, setPickedGrams] = useState(String(EGG.defaultGrams));
  return (
    <>
      <span data-testid="grams">{pickedGrams}</span>
      <PickedFoodCard
        setForm={(update) => {
          const base = { name: "", kcal: "", err: "" } as MealFormState;
          lastForm.current =
            typeof update === "function" ? update(base) : update;
        }}
        pickedFood={EGG}
        pickedGrams={pickedGrams}
        setPickedGrams={setPickedGrams}
        onChangeProduct={vi.fn()}
        getLastPortion={() => last}
      />
    </>
  );
}

beforeEach(() => {
  localStorage.clear();
  lastForm.current = null;
});

describe("PickedFoodCard: побутова порція корпусу", () => {
  it("стартує з одного яйця, 50 г, і рахує КБЖВ під цю вагу", () => {
    render(<Harness />);
    expect(grams()).toBe("50");
    expect(screen.getByRole("radio", { name: "яйце, 50 г" })).toBeChecked();
    expect(screen.getByText("яйце")).toBeInTheDocument();
    expect(lastForm.current?.kcal).toBe("71.5");
  });

  it("кількість змінює вагу, а назва одиниці узгоджується з числом", () => {
    render(<Harness />);
    const plus = screen.getByRole("button", { name: "Збільшити" });
    fireEvent.click(plus);
    expect(grams()).toBe("75");
    expect(screen.getByText("яйця")).toBeInTheDocument();
    fireEvent.click(plus);
    expect(grams()).toBe("100");
    expect(screen.getByText("яйця")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Кількість, яйце"), {
      target: { value: "5" },
    });
    expect(grams()).toBe("250");
    expect(screen.getByText("яєць")).toBeInTheDocument();
  });

  it("грами лишаються: перемикання на «г» тримає ту саму вагу", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("radio", { name: "г" }));
    expect(grams()).toBe("50");
    expect(screen.getByLabelText("Грами")).toHaveValue("50");
  });

  it("вага минулого запису виграє дефолт корпусу; без памʼяті одиниці — грамами", () => {
    render(<Harness last={{ grams: 120, date: "2026-11-15" }} />);
    expect(grams()).toBe("120");
    expect(screen.getByRole("radio", { name: "г" })).toBeChecked();
    expect(screen.getByText(/Як минулого разу: 120 г/)).toBeInTheDocument();
  });

  it("минулий запис яйцями повертається яйцями", () => {
    rememberLastUnit("gen_iaitse-kuriache", "hh_egg");
    render(<Harness last={{ grams: 100, date: "2026-11-15" }} />);
    expect(grams()).toBe("100");
    expect(screen.getByRole("radio", { name: "яйце, 50 г" })).toBeChecked();
    expect(screen.getByLabelText("Кількість, яйце")).toHaveValue("2");
  });
});
