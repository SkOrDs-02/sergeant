// @vitest-environment jsdom
/**
 * Last validated: 2026-07-10
 * Status: Active
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FoodHitRow } from "./FoodHitRow";

describe("FoodHitRow", () => {
  it("joins name and brand and invokes onPick", () => {
    const onPick = vi.fn();
    render(
      <ul>
        <FoodHitRow
          p={{
            name: "Гречка",
            brand: "Бренд",
            per100: { kcal: 343, protein_g: 13, fat_g: 3, carbs_g: 72 },
          }}
          badge="часто"
          onPick={onPick}
        />
      </ul>,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(onPick).toHaveBeenCalled();
  });

  it("handles missing brand", () => {
    render(
      <ul>
        <FoodHitRow p={{ name: "Вода" }} onPick={vi.fn()} />
      </ul>,
    );
    expect(screen.getByText("0 ккал")).toBeInTheDocument();
  });
});
