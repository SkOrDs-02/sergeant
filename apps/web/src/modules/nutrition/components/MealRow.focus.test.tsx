/** @vitest-environment jsdom */
/**
 * Last validated: 2026-10-22
 * Status: Active
 *
 * Регресія ux-08: «Видалити запис» розмонтовує кнопку, що тримала фокус, і
 * фокус падав на `<body>`. Тепер він іде на сусідній рядок, а коли рядків
 * не лишилось, на контейнер журналу.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Meal } from "@sergeant/nutrition-domain";
import { focusFallbackProps } from "@shared/lib/ui/focusFallback";

vi.mock("../lib/mealPhotoStorage", () => ({
  getMealThumbnailBlob: async () => null,
}));

import { MealRow } from "./MealRow";

const meal = (id: string, name: string): Meal =>
  ({
    id,
    name,
    time: "08:00",
    macros: { kcal: 100, protein_g: 1, fat_g: 1, carbs_g: 1 },
  }) as unknown as Meal;

function Harness() {
  const [meals, setMeals] = useState([meal("a", "Яйця"), meal("b", "Кава")]);
  return (
    <section
      aria-label="Записи"
      tabIndex={-1}
      {...focusFallbackProps("nutrition-day-log")}
    >
      {meals.map((m) => (
        <MealRow
          key={m.id}
          meal={m}
          onEdit={() => {}}
          onRemove={() => setMeals((s) => s.filter((x) => x.id !== m.id))}
        />
      ))}
    </section>
  );
}

afterEach(cleanup);

describe("MealRow: фокус після видалення", () => {
  it("переходить на сусідній рядок, потім на контейнер журналу", () => {
    render(<Harness />);
    const remove = () =>
      screen.getAllByRole("button", { name: "Видалити запис" });

    remove()[0]!.focus();
    fireEvent.click(remove()[0]!);
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Редагувати запис" }),
    );

    remove()[0]!.focus();
    fireEvent.click(remove()[0]!);
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toBe(
      screen.getByRole("region", { name: "Записи" }),
    );
  });
});
