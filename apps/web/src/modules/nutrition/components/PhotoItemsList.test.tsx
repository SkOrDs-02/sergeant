// @vitest-environment jsdom
/**
 * Last validated: 2026-09-03
 * Status: Active
 *
 * Список позицій фото-аналізу (ініціатива 0023, PR-2).
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { NutritionPhotoItem } from "@shared/api";

import { PhotoItemsList } from "./PhotoItemsList";

const fmtMacro = (v: unknown) => (v == null ? "—" : String(v));

function item(over: Partial<NutritionPhotoItem> = {}): NutritionPhotoItem {
  return {
    name: "Котлета",
    macros: { kcal: 300, protein_g: 21, fat_g: 18, carbs_g: 6 },
    gramsApprox: 120,
    confidence: 0.9,
    ...over,
  };
}

describe("PhotoItemsList", () => {
  it("рендерить рядок на кожну позицію з вагою і макросами", () => {
    render(
      <PhotoItemsList
        items={[item(), item({ name: "Пюре", gramsApprox: 200 })]}
        fmtMacro={fmtMacro}
      />,
    );
    expect(screen.getByText("Котлета")).toBeInTheDocument();
    expect(screen.getByText("Пюре")).toBeInTheDocument();
    expect(screen.getByText("~120 г")).toBeInTheDocument();
  });

  it("позначає позицію з низькою впевненістю і не чіпає впевнені", () => {
    render(
      <PhotoItemsList
        items={[item({ confidence: 0.3 }), item({ name: "Пюре" })]}
        fmtMacro={fmtMacro}
      />,
    );
    // Рівно одна позначка — інакше «низька впевненість» перестає виділяти.
    expect(screen.getAllByText(/ШІ невпевнений/)).toHaveLength(1);
  });

  it("прибирає позицію за індексом", () => {
    const onRemoveItem = vi.fn();
    render(
      <PhotoItemsList
        items={[item(), item({ name: "Пюре" })]}
        fmtMacro={fmtMacro}
        onRemoveItem={onRemoveItem}
      />,
    );
    fireEvent.click(screen.getByLabelText("Прибрати «Пюре»"));
    expect(onRemoveItem).toHaveBeenCalledWith(1);
  });

  it("без onRemoveItem список лише для читання", () => {
    render(<PhotoItemsList items={[item()]} fmtMacro={fmtMacro} />);
    expect(screen.queryByLabelText(/Прибрати/)).toBeNull();
  });

  it("розкриває пікер і віддає йому спосіб згорнутись назад", () => {
    render(
      <PhotoItemsList
        items={[item()]}
        fmtMacro={fmtMacro}
        renderAddItem={(close) => (
          <button type="button" onClick={close}>
            пікер
          </button>
        )}
      />,
    );
    fireEvent.click(screen.getByText(/Додати позицію/));
    // Кнопка поступилась пікеру…
    expect(screen.queryByText(/Додати позицію/)).toBeNull();
    fireEvent.click(screen.getByText("пікер"));
    // …і повернулась, коли пікер покликав `close`.
    expect(screen.getByText(/Додати позицію/)).toBeInTheDocument();
  });

  it("нічого не рендерить, коли нема ні позицій, ні пікера", () => {
    const { container } = render(
      <PhotoItemsList items={[]} fmtMacro={fmtMacro} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
