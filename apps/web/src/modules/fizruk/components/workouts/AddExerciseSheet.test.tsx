// @vitest-environment jsdom
/**
 * Tests for AddExerciseSheet — the local "add custom exercise" form.
 *
 * Covers: the name-required inline validation branch, equipment /
 * primary-muscle / secondary-muscle toggle chips, the primary-group
 * select resetting the muscle selections, the suggested-muscle memo
 * (derived from `musclesByPrimaryGroup` ∩ `musclesUk`), the successful
 * save path (slugified id, equipmentUk mapping, form reset + onClose),
 * and the cancel / close paths clearing the validation error.
 *
 * `useVisualKeyboardInset` (from @sergeant/shared) is a no-op in jsdom;
 * the Sheet renders into a portal that RTL's `screen` can still query.
 */
import { useState } from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import type { FizrukData } from "@sergeant/fizruk-domain";
import { AddExerciseSheet, type AddExerciseForm } from "./AddExerciseSheet";

const PRIMARY_GROUPS_UK: Record<string, string> = {
  chest: "Груди",
  back: "Спина",
};

const MUSCLES_UK: Record<string, string> = {
  pec: "Грудні",
  delt: "Дельти",
  lat: "Найширші",
};

const MUSCLES_BY_GROUP: Record<string, string[]> = {
  chest: ["pec", "delt", "unknown"], // "unknown" has no musclesUk → filtered out
  back: ["lat"],
};

function emptyForm(over: Partial<AddExerciseForm> = {}): AddExerciseForm {
  return {
    nameUk: "",
    primaryGroup: "chest",
    musclesPrimary: [],
    musclesSecondary: [],
    equipment: ["bodyweight"],
    description: "",
    ...over,
  };
}

const addExercise = vi.fn();
const onClose = vi.fn();

/**
 * Wrapper that owns the form state so `setForm` updaters actually
 * re-render the sheet — mirrors the real call-site in Workouts.
 */
function Harness({
  initial = emptyForm(),
  open = true,
}: {
  initial?: AddExerciseForm;
  open?: boolean;
}) {
  const [form, setForm] = useState<AddExerciseForm>(initial);
  return (
    <AddExerciseSheet
      open={open}
      onClose={onClose}
      form={form}
      setForm={setForm}
      primaryGroupsUk={PRIMARY_GROUPS_UK}
      musclesUk={MUSCLES_UK}
      musclesByPrimaryGroup={MUSCLES_BY_GROUP}
      addExercise={addExercise}
    />
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("AddExerciseSheet", () => {
  it("renders nothing when closed", () => {
    render(<Harness open={false} />);
    expect(screen.queryByText("Додати вправу")).not.toBeInTheDocument();
  });

  it("renders the form shell, equipment options and suggested muscles", () => {
    render(<Harness />);
    expect(screen.getByText("Додати вправу")).toBeInTheDocument();
    // Equipment option
    expect(screen.getByRole("button", { name: "Штанга" })).toBeInTheDocument();
    // Suggested muscles for "chest" — "unknown" is filtered out (no label).
    expect(screen.getAllByRole("button", { name: "Грудні" })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Дельти" })).toHaveLength(2);
  });

  it("shows an inline error and does NOT save when the name is empty", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Зберегти" }));
    expect(addExercise).not.toHaveBeenCalled();
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(/Вкажи назву українською/);
    // The name input is flagged invalid.
    expect(screen.getByLabelText("Назва вправи українською")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });

  it("clears the validation error once the name is typed", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Зберегти" }));
    expect(screen.getByRole("alert")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Назва вправи українською"), {
      target: { value: "Жим" },
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("toggles an equipment chip via aria-pressed", () => {
    render(<Harness />);
    const barbell = screen.getByRole("button", { name: "Штанга" });
    expect(barbell).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(barbell);
    expect(barbell).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(barbell);
    expect(barbell).toHaveAttribute("aria-pressed", "false");
  });

  it("changing the primary group swaps the suggested muscles", () => {
    render(<Harness />);
    // chest → "Грудні"/"Дельти" visible, no "Найширші".
    expect(screen.queryAllByRole("button", { name: "Найширші" })).toHaveLength(
      0,
    );
    fireEvent.change(screen.getByLabelText("Основна група м'язів"), {
      target: { value: "back" },
    });
    // back → "Найширші" appears (primary + secondary chip).
    expect(screen.getAllByRole("button", { name: "Найширші" })).toHaveLength(2);
    expect(screen.queryAllByRole("button", { name: "Грудні" })).toHaveLength(0);
  });

  it("saves a custom exercise with a slugified ASCII id and equipmentUk labels", () => {
    render(<Harness initial={emptyForm({ equipment: ["barbell"] })} />);
    fireEvent.change(screen.getByLabelText("Назва вправи українською"), {
      target: { value: "  Bench Press 2  " },
    });
    fireEvent.change(screen.getByPlaceholderText("Опис"), {
      target: { value: " розведення " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Зберегти" }));

    expect(addExercise).toHaveBeenCalledTimes(1);
    const arg = addExercise.mock.calls[0]![0] as FizrukData.RawExerciseDef;
    expect(arg.id).toBe("custom_bench_press_2");
    expect(arg.name).toEqual({ uk: "Bench Press 2", en: "Bench Press 2" });
    expect(arg.primaryGroup).toBe("chest");
    expect(arg.primaryGroupUk).toBe("Груди");
    expect(arg.equipment).toEqual(["barbell"]);
    expect(arg["equipmentUk"]).toEqual(["Штанга"]);
    expect(arg.description).toBe("розведення");
    expect(arg["source"]).toBe("manual");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("falls back to a timestamp id when the name has no slug-able chars (Cyrillic)", () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText("Назва вправи українською"), {
      target: { value: "Жим Гантелей" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Зберегти" }));
    const arg = addExercise.mock.calls[0]![0] as FizrukData.RawExerciseDef;
    // slugify("Жим Гантелей") === "" → id is `custom_<Date.now()>`.
    expect(arg.id).toMatch(/^custom_\d+$/);
    expect(arg.name).toEqual({ uk: "Жим Гантелей", en: "Жим Гантелей" });
  });

  it("includes selected primary and secondary muscles in the saved payload", () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText("Назва вправи українською"), {
      target: { value: "Тест" },
    });
    // The two "Грудні" buttons are [primary, secondary] in DOM order.
    const pecButtons = screen.getAllByRole("button", { name: "Грудні" });
    fireEvent.click(pecButtons[0]!); // primary
    const deltButtons = screen.getAllByRole("button", { name: "Дельти" });
    fireEvent.click(deltButtons[1]!); // secondary
    fireEvent.click(screen.getByRole("button", { name: "Зберегти" }));

    const arg = addExercise.mock.calls[0]![0] as FizrukData.RawExerciseDef;
    expect(arg.muscles!.primary).toEqual(["pec"]);
    expect(arg.muscles!.secondary).toEqual(["delt"]);
  });

  it("the cancel button invokes onClose", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Скасувати" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(addExercise).not.toHaveBeenCalled();
  });
});
