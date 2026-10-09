// @vitest-environment jsdom
/**
 * Last validated: 2026-10-09
 * Status: Active
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EMPTY_FOOD_DRAFT } from "./foodDraft";
import { FoodFields } from "./FoodFields";
import { SourceTabs } from "./SourceTabs";

describe("a11y names", () => {
  it("names food fields from visible labels", () => {
    render(
      <FoodFields idPrefix="t" draft={EMPTY_FOOD_DRAFT} onChange={vi.fn()} />,
    );
    for (const l of [
      "Назва продукту",
      "Ккал / 100 г",
      "Білки / 100 г",
      "Жири / 100 г",
      "Вуглеводи / 100 г",
    ]) {
      expect(screen.getByLabelText(l)).toBeInTheDocument();
    }
  });

  it("names source tabs from visible text", () => {
    render(<SourceTabs active="search" onChange={vi.fn()} />);
    expect(screen.getByRole("tab", { name: "Своє" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Пошук" })).toBeInTheDocument();
  });
});
