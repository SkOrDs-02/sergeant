// @vitest-environment jsdom
/**
 * Last validated: 2026-07-10
 * Status: Active
 */
import type { Dispatch, SetStateAction } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SavedSection } from "./RecipesCard.SavedSection";

describe("SavedSection", () => {
  it("toggles open state", () => {
    const setSavedOpen = vi.fn() as Dispatch<SetStateAction<boolean>>;
    render(
      <SavedSection
        saved={[]}
        savedBusy={false}
        savedOpen={false}
        setSavedOpen={setSavedOpen}
        openSavedId={null}
        setOpenSavedId={vi.fn()}
        portionById={{}}
        setPortionById={vi.fn()}
        onAddToLog={vi.fn()}
        onDeleteClick={vi.fn()}
        fmtMacro={(v) => String(v)}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Мої рецепти/ }));
    expect(setSavedOpen).toHaveBeenCalled();
  });

  it("на збій читання показує помилку з повтором, а не порожній стан", () => {
    const onRetry = vi.fn();
    render(
      <SavedSection
        saved={[]}
        savedBusy={false}
        savedError
        onRetry={onRetry}
        savedOpen
        setSavedOpen={vi.fn()}
        openSavedId={null}
        setOpenSavedId={vi.fn()}
        portionById={{}}
        setPortionById={vi.fn()}
        onAddToLog={vi.fn()}
        onDeleteClick={vi.fn()}
        fmtMacro={(v) => String(v)}
      />,
    );
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.queryByText(/Тут зʼявляться/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Спробувати ще раз" }));
    expect(onRetry).toHaveBeenCalled();
  });

  it("renders saved recipes and delete trigger", () => {
    const onDeleteClick = vi.fn();
    render(
      <SavedSection
        saved={
          [
            {
              id: "s1",
              title: "Борщ",
              macros: { kcal: 220, protein_g: 8, fat_g: 6, carbs_g: 28 },
            },
          ] as never
        }
        savedBusy={false}
        savedOpen
        setSavedOpen={vi.fn()}
        openSavedId={null}
        setOpenSavedId={vi.fn()}
        portionById={{ s1: "1" }}
        setPortionById={vi.fn()}
        onAddToLog={vi.fn()}
        onDeleteClick={onDeleteClick}
        fmtMacro={(v) => String(v)}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Видалити" }));
    expect(onDeleteClick).toHaveBeenCalled();
  });
});

describe("SavedSection — множник порцій", () => {
  const RECIPE = {
    id: "s1",
    title: "Борщ",
    timeMinutes: 40,
    servings: 4,
    ingredients: ["буряк"],
    steps: ["Зварити"],
    tips: [],
    macros: { kcal: 450, protein_g: 8, fat_g: 6, carbs_g: 28 },
  };

  function renderSaved(
    portionById: Record<string, string>,
    overrides: { openSavedId?: string | null } = {},
  ) {
    return render(
      <SavedSection
        saved={[RECIPE] as never}
        savedBusy={false}
        savedOpen
        setSavedOpen={vi.fn()}
        openSavedId={overrides.openSavedId ?? null}
        setOpenSavedId={vi.fn()}
        portionById={portionById}
        setPortionById={vi.fn()}
        onAddToLog={vi.fn()}
        onDeleteClick={vi.fn()}
        fmtMacro={(v) => String(v)}
      />,
    );
  }

  it("при множнику 1 показує макроси рецепта як є, без ×1 на кнопці", () => {
    renderSaved({});
    // і підрядок картки, і рядок порцій
    expect(screen.getAllByText(/≈ 450 ккал/)).toHaveLength(2);
    expect(screen.getByRole("button", { name: "+ У журнал" })).toBeTruthy();
  });

  it("множник 2 одразу перераховує ккал у підрядку й у рядку порцій", () => {
    renderSaved({ s1: "2" });
    expect(screen.getAllByText(/≈ 900 ккал/)).toHaveLength(2);
    expect(screen.queryByText(/≈ 450 ккал/)).toBeNull();
  });

  it("множник 2 перераховує Б/Ж/В у розгорнутому рецепті", () => {
    renderSaved({ s1: "2" }, { openSavedId: "s1" });
    expect(screen.getByText(/Б: 16 г · Ж: 12 г · В: 56 г/)).toBeTruthy();
  });

  it("кнопка журналу показує множник, коли він ≠ 1 (десяткова кома)", () => {
    renderSaved({ s1: "1.5" });
    expect(
      screen.getByRole("button", { name: "+ У журнал ×1,5" }),
    ).toBeTruthy();
    expect(screen.getAllByText(/≈ 675 ккал/)).toHaveLength(2);
  });

  it("нечисловий чи нульовий ввід рахується як 1 — і число, і кнопка кажуть правду", () => {
    for (const raw of ["abc", "0", ""]) {
      const { unmount } = renderSaved({ s1: raw });
      expect(screen.getAllByText(/≈ 450 ккал/)).toHaveLength(2);
      expect(screen.getByRole("button", { name: "+ У журнал" })).toBeTruthy();
      unmount();
    }
  });

  it("не лишає статичного підпису «× макроси рецепту»", () => {
    renderSaved({ s1: "2" });
    expect(screen.queryByText(/× макроси рецепту/)).toBeNull();
    expect(screen.queryByText(/множник/i)).toBeNull();
  });

  it("поле порцій має доступне імʼя з назвою рецепта", () => {
    renderSaved({ s1: "2" });
    expect(screen.getByRole("textbox", { name: "Порції: Борщ" })).toHaveValue(
      "2",
    );
  });

  it("без ккал у рецепті не малює «→ ≈ … ккал»", () => {
    render(
      <SavedSection
        saved={[{ ...RECIPE, macros: { kcal: null } }] as never}
        savedBusy={false}
        savedOpen
        setSavedOpen={vi.fn()}
        openSavedId={null}
        setOpenSavedId={vi.fn()}
        portionById={{ s1: "2" }}
        setPortionById={vi.fn()}
        onAddToLog={vi.fn()}
        onDeleteClick={vi.fn()}
        fmtMacro={(v) => String(v)}
      />,
    );
    expect(screen.queryByText(/ккал/)).toBeNull();
  });
});
