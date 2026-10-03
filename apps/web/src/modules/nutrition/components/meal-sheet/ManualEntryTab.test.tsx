// @vitest-environment jsdom
/**
 * Last validated: 2026-08-22
 * Status: Active
 *
 * ManualEntryTab — вкладка «Своє»: перемикач одиниці КБЖВ і два режими
 * вводу за ним.
 *
 * Головне, що тут пінимо, — режим «з упаковки» рендерить СПРАВЖНІЙ
 * `PackageEntryStep` і прозоро віддає його результат нагору. Прототип
 * цієї вкладки мав власні поля й на «Далі» підставляв захардкоджений
 * продукт, тобто набране людиною нікуди не йшло; тест існує, щоб та
 * підміна не могла повернутись непоміченою.
 */
import { describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach } from "vitest";

import { ManualEntryTab } from "./ManualEntryTab";
import type { PickedFood } from "./FoodPickerSection";

const PRODUCT: PickedFood = {
  id: "food-1",
  name: "Равіолі",
  per100: { kcal: 250, protein_g: 9, fat_g: 6, carbs_g: 40 },
};

// Мок віддає рівно те, що віддав би справжній крок: продукт і вагу.
// Так тест перевіряє ПРОВІДКУ вкладки, а не вміст самого кроку — його
// власна поведінка вкрита `PackageEntryStep.test.tsx`.
vi.mock("./PackageEntryStep", () => ({
  PackageEntryStep: ({
    onCreated,
  }: {
    onCreated: (product: PickedFood, grams: string) => void;
  }) => (
    <button
      type="button"
      data-testid="package-step"
      onClick={() => onCreated(PRODUCT, "250")}
    >
      package step
    </button>
  ),
}));

afterEach(() => cleanup());

describe("ManualEntryTab", () => {
  it("типовий режим — «з упаковки», і поля етикетки видно одразу", () => {
    render(<ManualEntryTab onCreated={vi.fn()} onWholeMeal={vi.fn()} />);
    expect(screen.getByRole("radio", { name: /З упаковки/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByTestId("package-step")).toBeInTheDocument();
  });

  it("підписує одиницю на кожному режимі", () => {
    render(<ManualEntryTab onCreated={vi.fn()} onWholeMeal={vi.fn()} />);
    expect(screen.getByRole("radio", { name: /З упаковки/ })).toHaveTextContent(
      "на 100 г",
    );
    expect(
      screen.getByRole("radio", { name: /Готова страва/ }),
    ).toHaveTextContent("за всю порцію");
  });

  it("віддає нагору саме той продукт, який створив крок етикетки", () => {
    const onCreated = vi.fn();
    render(<ManualEntryTab onCreated={onCreated} onWholeMeal={vi.fn()} />);
    fireEvent.click(screen.getByTestId("package-step"));
    expect(onCreated).toHaveBeenCalledWith(PRODUCT, "250");
  });

  it("«Готова страва» ховає поля етикетки й веде на разовий запис", () => {
    const onWholeMeal = vi.fn();
    render(<ManualEntryTab onCreated={vi.fn()} onWholeMeal={onWholeMeal} />);
    fireEvent.click(screen.getByRole("radio", { name: /Готова страва/ }));

    // Поля «на 100 г» зникають: у режимі «за порцію» вони означали б інше.
    expect(screen.queryByTestId("package-step")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Далі" }));
    expect(onWholeMeal).toHaveBeenCalledTimes(1);
  });

  it("повернення до «з упаковки» не тягне за собою стан разового запису", () => {
    render(<ManualEntryTab onCreated={vi.fn()} onWholeMeal={vi.fn()} />);
    fireEvent.click(screen.getByRole("radio", { name: /Готова страва/ }));
    fireEvent.click(screen.getByRole("radio", { name: /З упаковки/ }));
    expect(screen.getByTestId("package-step")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Далі" })).toBeNull();
  });
});
