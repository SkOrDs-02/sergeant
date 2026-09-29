import { describe, expect, it } from "vitest";
import { buildPantryAddedToastMessage } from "./pantryAddedToast";

const PANTRIES = [
  { id: "fridge", name: "Холодильник" },
  { id: "freezer", name: "Морозилка" },
  { id: "home", name: "Комора" },
];

describe("buildPantryAddedToastMessage", () => {
  it("returns null for an empty list — nothing was added", () => {
    expect(buildPantryAddedToastMessage([], PANTRIES)).toBeNull();
  });

  it("single item: «<місце>: додано «X»»", () => {
    expect(
      buildPantryAddedToastMessage(
        [{ name: "Молоко", pantryId: "fridge" }],
        PANTRIES,
      ),
    ).toBe("Холодильник: додано «Молоко»");
  });

  it("falls back to «Комора» when the place isn't in the list (deleted mid-flight)", () => {
    expect(
      buildPantryAddedToastMessage(
        [{ name: "Молоко", pantryId: "gone" }],
        PANTRIES,
      ),
    ).toBe("Комора: додано «Молоко»");
  });

  // Формат навмисно уникає прийменника «у» + назва місця: назву заводить
  // сам користувач (довільний рядок), і «у Холодильник» (замість «у
  // холодильник**у**») — граматична помилка, яка була непомітна лише тому,
  // що чоловічий рід тут випадково маскував відмінок. «<Місце>: додано …»
  // не потребує відмінка для жодної назви.
  it("does not decline an arbitrary user-defined place name", () => {
    const customPantries = [{ id: "p1", name: "Верхня поличка" }];
    expect(
      buildPantryAddedToastMessage(
        [{ name: "Гречка", pantryId: "p1" }],
        customPantries,
      ),
    ).toBe("Верхня поличка: додано «Гречка»");
  });

  it("multiple items, same place: «<місце>: додано N позицій»", () => {
    expect(
      buildPantryAddedToastMessage(
        [
          { name: "Молоко", pantryId: "fridge" },
          { name: "Сир", pantryId: "fridge" },
        ],
        PANTRIES,
      ),
    ).toBe("Холодильник: додано 2 позиції");
  });

  it("multiple items, different places: «Додано N позицій» without a place", () => {
    expect(
      buildPantryAddedToastMessage(
        [
          { name: "Молоко", pantryId: "fridge" },
          { name: "Гречка", pantryId: "home" },
        ],
        PANTRIES,
      ),
    ).toBe("Додано 2 позиції");
  });

  // Українська плюралізація — три форми (one/few/many), не бінарна
  // англійська «1 vs N». 11 і 21 ловлять класичну помилку: 11 бере "many"
  // (записів-подібна форма), 21 повертається до "one", попри «схожість» на
  // "2 позиції". N=1 тут не тестується — при рівно одному товарі функція
  // йде іншою гілкою («X: додано «Y»», без числа), уже покрита тестом
  // "single item" вище.
  it.each([
    [2, "позиції"],
    [5, "позицій"],
    [11, "позицій"],
    [21, "позицію"],
  ])("uses the correct plural form for N=%i (%s)", (n, form) => {
    const items = Array.from({ length: n }, (_, i) => ({
      name: `Продукт ${i}`,
      pantryId: "fridge",
    }));
    expect(buildPantryAddedToastMessage(items, PANTRIES)).toBe(
      `Холодильник: додано ${n} ${form}`,
    );
  });
});
