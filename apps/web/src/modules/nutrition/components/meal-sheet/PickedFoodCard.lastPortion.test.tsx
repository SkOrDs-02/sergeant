// @vitest-environment jsdom
/**
 * Last validated: 2026-11-18
 * Status: Active
 * `PickedFoodCard`: вага з минулого запису того самого продукту (OD-27 Х-1 б).
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@shared/hooks/useCoarsePointer", () => ({
  useCoarsePointer: () => false,
}));

import type { FoodPortion } from "../../lib/foodDb/foodDb";
import type { LastFoodPortion } from "../../lib/lastFoodPortion";
import { PickedFoodCard } from "./PickedFoodCard";
import type { PickedFood } from "./FoodPickerSection";
import { rememberLastUnit } from "./portionUnits";

function food(portions: FoodPortion[] = []): PickedFood {
  return {
    id: "f1",
    name: "Банан",
    brand: "",
    defaultGrams: 100,
    per100: { kcal: 89, protein_g: 1, fat_g: 0, carbs_g: 23 },
    portions,
  };
}

const grams = () => screen.getByTestId("grams").textContent;
const LAST: LastFoodPortion = { grams: 120, date: "2026-11-15" };

function Harness({
  pickedFood = food(),
  initialGrams = "100",
  skipInitialRescale = false,
  last = LAST,
}: {
  pickedFood?: PickedFood;
  initialGrams?: string;
  skipInitialRescale?: boolean;
  last?: LastFoodPortion | null;
}) {
  const [pickedGrams, setPickedGrams] = useState(initialGrams);
  return (
    <>
      <span data-testid="grams">{pickedGrams}</span>
      <PickedFoodCard
        setForm={vi.fn()}
        pickedFood={pickedFood}
        pickedGrams={pickedGrams}
        setPickedGrams={setPickedGrams}
        onChangeProduct={vi.fn()}
        skipInitialRescale={skipInitialRescale}
        getLastPortion={(id) => (id === "f1" ? last : null)}
      />
    </>
  );
}

beforeEach(() => localStorage.clear());

describe("PickedFoodCard: остання вага продукту", () => {
  it("підставляє вагу минулого запису і каже, звідки число", () => {
    render(<Harness />);
    expect(grams()).toBe("120");
    expect(
      screen.getByText("Як минулого разу: 120 г, 15 листопада"),
    ).toBeInTheDocument();
  });

  it("після зміни ваги підпис зникає, бо число вже не звідти", () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText("Грами"), {
      target: { value: "80" },
    });
    expect(grams()).toBe("80");
    expect(screen.queryByText(/Як минулого разу/)).toBeNull();
  });

  it("минулого запису немає: як раніше, 100 г без підпису", () => {
    render(<Harness last={null} />);
    expect(grams()).toBe("100");
    expect(screen.queryByText(/Як минулого разу/)).toBeNull();
  });

  it("продукт із порціями повертає ту саму одиницю й кількість", () => {
    rememberLastUnit("f1", "p1");
    render(
      <Harness
        pickedFood={food([{ id: "p1", name: "скибка", grams: 30 }])}
        last={{ grams: 45, date: "2026-11-15" }}
      />,
    );
    expect(grams()).toBe("45");
    expect(screen.getByRole("radio", { name: /скибка/ })).toBeChecked();
    expect(screen.getByLabelText("Кількість, скибка")).toHaveValue("1.5");
  });

  it("редагування запису не підміняє його вагу", () => {
    render(<Harness skipInitialRescale initialGrams="200" />);
    expect(grams()).toBe("200");
    expect(screen.queryByText(/Як минулого разу/)).toBeNull();
  });

  it("вага не за замовчуванням (фасування з чека, чернетка) лишається", () => {
    render(<Harness initialGrams="250" />);
    expect(grams()).toBe("250");
    expect(screen.queryByText(/Як минулого разу/)).toBeNull();
  });
});
