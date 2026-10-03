// @vitest-environment jsdom
//
// Аркуш керує МІСЦЯМИ зберігання, а не активною коморою. Контракт:
//   • поряд зі «Зберегти/Створити» стоїть «Скасувати», не «Видалити»;
//   • у `idle` форма прихована, доки людина не обрала дію;
//   • тап по рядку місця перейменовує САМЕ це місце (id — у формі);
//   • три відомі місця не видаляються: це адреси автовизначення;
//   • «розкласти по місцях» показує список ДО дії (ADR-0077: масовий
//     переїзд — подія історії, а не косметика).
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Dispatch, SetStateAction } from "react";
import type { Pantry, RedistributeMove } from "@sergeant/nutrition-domain";

import { PantryManagerSheet, type PantryForm } from "./PantryManagerSheet";

const PLACES: Pantry[] = [
  { id: "fridge", name: "Холодильник", items: [], text: "" },
  { id: "freezer", name: "Морозилка", items: [], text: "" },
  { id: "home", name: "Комора", items: [], text: "" },
];

function makeProps(overrides: {
  pantries?: Pantry[];
  onClose?: () => void;
  onBeginDelete?: (id: string) => void;
  onBeginRename?: (id: string) => void;
  onSavePantryForm?: (
    name: string,
    mode: Exclude<PantryForm["mode"], "idle">,
    targetId?: string | null,
  ) => void;
  setPantryForm?: Dispatch<SetStateAction<PantryForm>>;
  pantryForm?: PantryForm;
  redistributePlan?: RedistributeMove[];
  onRedistribute?: () => void;
}) {
  return {
    open: true,
    onClose: overrides.onClose ?? vi.fn(),
    pantries: overrides.pantries ?? PLACES,
    pantryForm:
      overrides.pantryForm ??
      ({
        mode: "rename",
        name: "Комора",
        err: "",
        targetId: "home",
      } as PantryForm),
    setPantryForm: overrides.setPantryForm ?? vi.fn(),
    onSavePantryForm: overrides.onSavePantryForm ?? vi.fn(),
    onBeginCreate: vi.fn(),
    onBeginRename: overrides.onBeginRename ?? vi.fn(),
    onBeginDelete: overrides.onBeginDelete ?? vi.fn(),
    redistributePlan: overrides.redistributePlan ?? [],
    onRedistribute: overrides.onRedistribute ?? vi.fn(),
  };
}

afterEach(() => {
  cleanup();
});

describe("PantryManagerSheet — місця зберігання", () => {
  it("offers Cancel next to Save in rename mode, not Delete", () => {
    render(<PantryManagerSheet {...makeProps({})} />);

    expect(screen.getByRole("button", { name: "Зберегти" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Скасувати" })).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Видалити активний" }),
    ).toBeNull();
  });

  it("offers Create + Cancel pair in create mode", () => {
    render(
      <PantryManagerSheet
        {...makeProps({
          pantryForm: { mode: "create", name: "", err: "", targetId: null },
        })}
      />,
    );

    expect(screen.getByRole("button", { name: "Створити" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Скасувати" })).toBeTruthy();
  });

  it("hides the form entirely in idle mode", () => {
    render(
      <PantryManagerSheet
        {...makeProps({
          pantryForm: { mode: "idle", name: "", err: "", targetId: null },
        })}
      />,
    );

    expect(screen.queryByRole("button", { name: "Зберегти" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Створити" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Скасувати" })).toBeNull();
    expect(screen.getByRole("button", { name: "+ Нове місце" })).toBeTruthy();
  });

  it("renames the place whose row was tapped", () => {
    const onBeginRename = vi.fn();
    render(<PantryManagerSheet {...makeProps({ onBeginRename })} />);

    fireEvent.click(
      screen.getByRole("button", { name: /Перейменувати «Морозилка»/ }),
    );
    expect(onBeginRename).toHaveBeenCalledWith("freezer");
  });

  // Три відомі місця — адреси, куди автовизначення кладе результат.
  it("shows no delete affordance for known places", () => {
    render(<PantryManagerSheet {...makeProps({})} />);
    expect(screen.queryByRole("button", { name: /Видалити місце/ })).toBeNull();
  });

  it("deletes a custom place by id", () => {
    const onBeginDelete = vi.fn();
    render(
      <PantryManagerSheet
        {...makeProps({
          pantries: [
            ...PLACES,
            { id: "p_1", name: "Балкон", items: [], text: "" },
          ],
          onBeginDelete,
        })}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Видалити місце «Балкон»" }),
    );
    expect(onBeginDelete).toHaveBeenCalledWith("p_1");
  });

  it("invokes setPantryForm with idle when Cancel is clicked", () => {
    const setPantryForm = vi.fn();
    render(<PantryManagerSheet {...makeProps({ setPantryForm })} />);

    fireEvent.click(screen.getByRole("button", { name: "Скасувати" }));
    expect(setPantryForm).toHaveBeenCalledWith({
      mode: "idle",
      name: "",
      err: "",
      targetId: null,
    });
  });

  it("clears the inline error while editing the place name", () => {
    let currentForm: PantryForm = {
      mode: "create",
      name: "Стара",
      err: "Вкажи назву.",
      targetId: null,
    };
    const setPantryForm = vi.fn((update: SetStateAction<PantryForm>) => {
      currentForm = typeof update === "function" ? update(currentForm) : update;
    });
    render(
      <PantryManagerSheet
        {...makeProps({ pantryForm: currentForm, setPantryForm })}
      />,
    );

    fireEvent.change(screen.getByLabelText("Назва місця"), {
      target: { value: "Нова" },
    });
    expect(currentForm).toEqual({
      mode: "create",
      name: "Нова",
      err: "",
      targetId: null,
    });
  });

  it("validates an empty create name before saving", () => {
    const setPantryForm = vi.fn();
    const onSavePantryForm = vi.fn();
    render(
      <PantryManagerSheet
        {...makeProps({
          pantryForm: { mode: "create", name: "   ", err: "", targetId: null },
          setPantryForm,
          onSavePantryForm,
        })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Створити" }));
    const update = setPantryForm.mock.calls[0]?.[0] as (
      form: PantryForm,
    ) => PantryForm;
    expect(
      update({ mode: "create", name: "   ", err: "", targetId: null }),
    ).toEqual({
      mode: "create",
      name: "   ",
      err: "Вкажи назву.",
      targetId: null,
    });
    expect(onSavePantryForm).not.toHaveBeenCalled();
  });

  it("saves a trimmed name from the button and Enter key", () => {
    const onSavePantryForm = vi.fn();
    const { rerender } = render(
      <PantryManagerSheet
        {...makeProps({
          pantryForm: {
            mode: "create",
            name: "  Балкон  ",
            err: "",
            targetId: null,
          },
          onSavePantryForm,
        })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Створити" }));
    expect(onSavePantryForm).toHaveBeenCalledWith("Балкон", "create", null);

    rerender(
      <PantryManagerSheet
        {...makeProps({
          pantryForm: {
            mode: "rename",
            name: "  Погріб  ",
            err: "",
            targetId: "home",
          },
          onSavePantryForm,
        })}
      />,
    );
    fireEvent.keyDown(screen.getByLabelText("Нова назва"), { key: "Enter" });
    expect(onSavePantryForm).toHaveBeenCalledWith("Погріб", "rename", "home");
  });

  // Скидання форми переїхало з тіла рендера в обробник закриття
  // (браузерний аудит 2026-09-01: виклик батьківського сеттера під час
  // рендера дитини давав «Cannot update a component while rendering a
  // different component»). Тому тест закриває аркуш дією, а не флипом
  // пропа `open`.
  it("resets a visible form when the sheet is closed", () => {
    const setPantryForm = vi.fn();
    const onClose = vi.fn();
    render(
      <PantryManagerSheet
        {...makeProps({
          pantryForm: {
            mode: "rename",
            name: "Комора",
            err: "Помилка",
            targetId: "home",
          },
          setPantryForm,
          onClose,
        })}
      />,
    );

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onClose).toHaveBeenCalled();
    const update = setPantryForm.mock.calls[0]?.[0] as (
      form: PantryForm,
    ) => PantryForm;
    expect(
      update({
        mode: "rename",
        name: "Комора",
        err: "Помилка",
        targetId: "home",
      }),
    ).toEqual({ mode: "idle", name: "", err: "", targetId: null });
  });

  // Гейт 5 спеки: нічого не переїжджає саме.
  it("hides the redistribute action when nothing would move", () => {
    render(<PantryManagerSheet {...makeProps({ redistributePlan: [] })} />);
    expect(
      screen.queryByRole("button", { name: "Розкласти по місцях" }),
    ).toBeNull();
  });

  it("shows what would move before moving it", () => {
    const onRedistribute = vi.fn();
    render(
      <PantryManagerSheet
        {...makeProps({
          redistributePlan: [
            { name: "Пельмені", fromId: "home", toId: "freezer" },
          ],
          onRedistribute,
        })}
      />,
    );

    expect(screen.getByText("Пельмені")).toBeTruthy();
    expect(screen.getByText(/Комора → Морозилка/)).toBeTruthy();
    expect(onRedistribute).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole("button", { name: "Розкласти по місцях" }),
    );
    expect(onRedistribute).toHaveBeenCalledTimes(1);
  });
});
