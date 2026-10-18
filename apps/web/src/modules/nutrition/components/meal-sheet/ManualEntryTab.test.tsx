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

// Сам аркуш «Мої продукти» має власний тест; тут важить лише вхід у нього.
vi.mock("../MyFoodsSheet", () => ({
  MyFoodsSheet: ({ open }: { open: boolean }) =>
    open ? <div data-testid="my-foods-sheet" /> : null,
}));

afterEach(() => cleanup());

describe("ManualEntryTab", () => {
  it("просить явний вибір одиниці перед полями", () => {
    render(<ManualEntryTab onCreated={vi.fn()} onWholeMeal={vi.fn()} />);
    expect(screen.getByRole("button", { name: /На 100 г/ })).toBeVisible();
    expect(screen.getByRole("button", { name: /За всю порцію/ })).toBeVisible();
    expect(screen.queryByTestId("package-step")).not.toBeInTheDocument();
  });
  it("передає справжній продукт і вагу з форми на 100 г", () => {
    const onCreated = vi.fn();
    render(<ManualEntryTab onCreated={onCreated} onWholeMeal={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /На 100 г/ }));
    fireEvent.click(screen.getByTestId("package-step"));
    expect(onCreated).toHaveBeenCalledWith(PRODUCT, "250");
  });
  it("за всю порцію одразу відкриває форму без додаткового Далі", () => {
    const onWholeMeal = vi.fn();
    render(<ManualEntryTab onCreated={vi.fn()} onWholeMeal={onWholeMeal} />);
    fireEvent.click(screen.getByRole("button", { name: /За всю порцію/ }));
    expect(onWholeMeal).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByRole("button", { name: "Далі" }),
    ).not.toBeInTheDocument();
  });
  it("зміна одиниці не демонтує чернетку продукту", () => {
    render(<ManualEntryTab onCreated={vi.fn()} onWholeMeal={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /На 100 г/ }));
    const form = screen.getByTestId("package-step");
    fireEvent.click(
      screen.getByRole("button", { name: "Змінити одиницю калорійності" }),
    );
    expect(form).not.toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: /На 100 г/ }));
    expect(screen.getByTestId("package-step")).toBe(form);
    expect(form).toBeVisible();
  });
});
