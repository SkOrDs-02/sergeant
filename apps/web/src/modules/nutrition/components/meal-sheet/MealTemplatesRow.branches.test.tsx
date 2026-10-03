// @vitest-environment jsdom
/**
 * Last validated: 2026-07-10
 * Status: Active
 */
import type { Dispatch, SetStateAction } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const { showUndoToastMock } = vi.hoisted(() => ({
  showUndoToastMock: vi.fn(),
}));
vi.mock("@shared/hooks/useToast", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));
vi.mock("@shared/lib/ui/undoToast", () => ({
  showUndoToast: showUndoToastMock,
}));

import { MealTemplatesRow } from "./MealTemplatesRow";
import type { MealFormState } from "./mealFormUtils";

const TEMPLATE = {
  id: "t1",
  name: "Омлет",
  mealType: "breakfast" as const,
  macros: { kcal: 280, protein_g: 18, fat_g: 20, carbs_g: 2 },
};

/**
 * Секція згорнута за замовчуванням (аркуш прийому їжі більше не стіна з
 * пʼяти блоків), а згорнутий вміст несе `aria-hidden` — тож `getByRole`
 * його не бачить, як не бачить і скрінрідер. Тести працюють із вмістом,
 * не зі згортанням, тому просто відкривають секцію.
 */
function expandTemplates() {
  const toggle = screen.getByRole("button", { name: /Швидкі прийоми/ });
  // Ідемпотентно: секція памʼятає стан у сховищі, тож після першого тесту
  // вона вже відкрита — беззастережний клік згортав би її назад.
  if (toggle.getAttribute("aria-expanded") === "false") fireEvent.click(toggle);
}

describe("MealTemplatesRow", () => {
  it("returns null when templates are empty", () => {
    const { container } = render(
      <MealTemplatesRow mealTemplates={[]} setForm={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("fills form from template and calls onSelected", () => {
    const setForm = vi.fn() as Dispatch<SetStateAction<MealFormState>>;
    const onSelected = vi.fn();
    render(
      <MealTemplatesRow
        mealTemplates={[TEMPLATE]}
        setForm={setForm}
        onSelected={onSelected}
      />,
    );
    expandTemplates();
    fireEvent.click(screen.getByRole("button", { name: "Омлет" }));
    expect(setForm).toHaveBeenCalled();
    expect(onSelected).toHaveBeenCalled();
  });

  it("does not render edit/delete affordances without setPrefs", () => {
    render(<MealTemplatesRow mealTemplates={[TEMPLATE]} setForm={vi.fn()} />);
    // Без розгортання тест проходив би з хибної причини: `aria-hidden`
    // згорнутої секції ховає від `queryByRole` геть усе, і твердження
    // «кнопок немає» стало б істинним незалежно від `setPrefs`.
    expandTemplates();
    expect(
      screen.queryByRole("button", {
        name: "Редагувати швидкий прийом Омлет",
      }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", {
        name: "Видалити швидкий прийом Омлет",
      }),
    ).toBeNull();
  });

  it("edit affordance fills form and reports the template", () => {
    const setForm = vi.fn() as Dispatch<SetStateAction<MealFormState>>;
    const onEditTemplate = vi.fn();
    render(
      <MealTemplatesRow
        mealTemplates={[TEMPLATE]}
        setForm={setForm}
        setPrefs={vi.fn()}
        onEditTemplate={onEditTemplate}
      />,
    );
    expandTemplates();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Редагувати швидкий прийом Омлет",
      }),
    );
    expect(setForm).toHaveBeenCalled();
    expect(onEditTemplate).toHaveBeenCalledWith(TEMPLATE);
  });

  it("delete affordance asks for confirmation, then removes the template with an undo toast", () => {
    const setPrefs = vi.fn();
    showUndoToastMock.mockClear();
    render(
      <MealTemplatesRow
        mealTemplates={[TEMPLATE]}
        setForm={vi.fn()}
        setPrefs={setPrefs}
      />,
    );
    expandTemplates();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Видалити швидкий прийом Омлет",
      }),
    );
    expect(screen.getByText("Видалити швидкий прийом?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Видалити" }));
    expect(setPrefs).toHaveBeenCalled();
    const updater = setPrefs.mock.calls[0]![0];
    const next = updater({ mealTemplates: [TEMPLATE] });
    expect(next.mealTemplates).toHaveLength(0);
    expect(showUndoToastMock).toHaveBeenCalledTimes(1);
  });
});
