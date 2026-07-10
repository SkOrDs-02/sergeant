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
