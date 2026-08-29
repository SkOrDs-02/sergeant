// @vitest-environment jsdom
/**
 * Last validated: 2026-08-29
 * Status: Active
 *
 * Аркуш «З чого списати?» — рішення 11 спеки
 * `docs/90-work/planning/specs/pantry-generic-names.md`.
 *
 * Найважливіше тут не рендер, а ДВІ речі, які роблять діалог безпечним у
 * швидкому сценарії: він не існує без вибору (`choice === null`), і будь-яке
 * закриття все одно списує — прийом їжі вже збережено, тож «нічого не
 * списати» лишило б комору із завищеним залишком.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PantryVariantChoiceSheet } from "./PantryVariantChoiceSheet";

const CHOICE = {
  itemName: "Молоко",
  grams: 200,
  sources: [
    {
      name: "Молоко Яготинське 2.6%",
      qty: 900,
      unit: "мл",
      addedAt: "2026-08-21",
    },
    {
      name: "Молоко Галичина 1%",
      qty: 1100,
      unit: "мл",
      addedAt: "2026-08-28",
    },
  ],
};

describe("PantryVariantChoiceSheet", () => {
  it("не рендериться без вибору — тихе списання лишається тихим", () => {
    render(<PantryVariantChoiceSheet choice={null} onResolve={vi.fn()} />);
    expect(screen.queryByText("З чого списати?")).toBeNull();
  });

  it("показує кожен варіант із датою покупки і кількістю", () => {
    render(<PantryVariantChoiceSheet choice={CHOICE} onResolve={vi.fn()} />);
    expect(screen.getByText("Молоко Яготинське 2.6%")).toBeTruthy();
    expect(screen.getByText("Молоко Галичина 1%")).toBeTruthy();
    expect(screen.getByText("2026-08-21")).toBeTruthy();
    expect(screen.getByText("900 мл")).toBeTruthy();
  });

  it("тап по варіанту віддає його назву", () => {
    const onResolve = vi.fn();
    render(<PantryVariantChoiceSheet choice={CHOICE} onResolve={onResolve} />);
    fireEvent.click(screen.getByText("Молоко Галичина 1%"));
    expect(onResolve).toHaveBeenCalledWith("Молоко Галичина 1%");
  });

  it("«З найстарішої» віддає null — списання з найдавнішої покупки", () => {
    const onResolve = vi.fn();
    render(<PantryVariantChoiceSheet choice={CHOICE} onResolve={onResolve} />);
    fireEvent.click(screen.getByText("З найстарішої"));
    expect(onResolve).toHaveBeenCalledWith(null);
  });

  it("варіант без дати не показує порожнечу замість неї", () => {
    render(
      <PantryVariantChoiceSheet
        choice={{
          ...CHOICE,
          sources: [{ ...CHOICE.sources[0]!, addedAt: null }],
        }}
        onResolve={vi.fn()}
      />,
    );
    expect(screen.getByText("без дати")).toBeTruthy();
  });
});
