// @vitest-environment jsdom
/**
 * Last validated: 2026-06-23
 * Status: Active
 * Unit tests for the meal-sheet `NameTimeRow`.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@sergeant/shared", async () => {
  const actual =
    await vi.importActual<typeof import("@sergeant/shared")>(
      "@sergeant/shared",
    );
  return { ...actual, parseMealSpeech: vi.fn() };
});
// Stub the voice button — it has its own coverage and pulls in adapters.
vi.mock("@shared/components/ui/VoiceMicButton", () => ({
  VoiceMicButton: ({
    onError,
    onResult,
  }: {
    onError: (message: string) => void;
    onResult: (transcript: string) => void;
  }) => (
    <>
      <button type="button" onClick={() => onResult("омлет 250 ккал")}>
        mic
      </button>
      <button type="button" onClick={() => onError("voice failed")}>
        mic error
      </button>
    </>
  ),
}));

import { parseMealSpeech } from "@sergeant/shared";
import { currentTime } from "./mealFormUtils";
import { NameTimeRow } from "./NameTimeRow";
import type { MealFormState } from "./mealFormUtils";

function makeForm(overrides: Partial<MealFormState> = {}): MealFormState {
  return {
    name: "",
    mealType: "lunch",
    time: currentTime(),
    kcal: "",
    protein_g: "",
    fat_g: "",
    carbs_g: "",
    err: "",
    ...overrides,
  };
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.clearAllMocks());

describe("NameTimeRow", () => {
  it("hides the time field when the time is 'now' and reveals it on demand", () => {
    const setForm = vi.fn();
    const field = vi.fn(() => vi.fn());
    render(<NameTimeRow form={makeForm()} field={field} setForm={setForm} />);

    // Time input hidden initially (time === now).
    expect(screen.queryByLabelText("Час")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText(/Змінити час/));
    expect(screen.getByLabelText("Час")).toBeInTheDocument();
  });

  it("shows the time field directly when editing an older meal", () => {
    const setForm = vi.fn();
    const field = vi.fn(() => vi.fn());
    render(
      <NameTimeRow
        form={makeForm({ time: "08:15" })}
        field={field}
        setForm={setForm}
      />,
    );
    expect(screen.getByLabelText("Час")).toBeInTheDocument();
  });

  // Пін на контракт ширини нативного контрола. `[min-inline-size:0]` дає
  // лише спільний примітив (`DateField` / `TimeField`); сирий `Input` його
  // НЕ має, і саме так поле ставало ширшим за екран на iOS. Playwright тут
  // не помічник — Chromium цей дефект не відтворює (заміряно 2026-09-15,
  // див. docs/start/instructions/fix-mobile-horizontal-overflow.md § 3).
  it("тримає поле часу в межах рядка — жодного intrinsic-розпирання", () => {
    const field = vi.fn(() => vi.fn());
    render(
      <NameTimeRow
        form={makeForm({ time: "08:15" })}
        field={field}
        setForm={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("Час").className).toContain(
      "[min-inline-size:0]",
    );
  });

  it("routes name input changes through the field setter", () => {
    const setName = vi.fn();
    const field = vi.fn((key: string) => (key === "name" ? setName : vi.fn()));
    render(<NameTimeRow form={makeForm()} field={field} setForm={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Назва страви"), {
      target: { value: "Салат" },
    });
    expect(setName).toHaveBeenCalledWith("Салат");
  });

  it("routes time input changes through the field setter", () => {
    const setTime = vi.fn();
    const field = vi.fn((key: string) => (key === "time" ? setTime : vi.fn()));
    render(
      <NameTimeRow
        form={makeForm({ time: "08:15" })}
        field={field}
        setForm={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("Час"), {
      target: { value: "09:30" },
    });
    expect(setTime).toHaveBeenCalledWith("09:30");
  });

  it.each([
    {
      name: "Омлет",
      kcal: 249.6,
      protein: 30.4,
      grams: null,
      expectedName: "Омлет",
    },
    {
      name: "Гречка",
      kcal: 180,
      protein: null,
      grams: 200,
      expectedName: "Гречка 200 г",
    },
  ])(
    "routes spoken fields through the canonical setters: $expectedName",
    ({ name, kcal, protein, grams, expectedName }) => {
      vi.mocked(parseMealSpeech).mockReturnValue({
        name,
        kcal,
        protein,
        grams,
        raw: "meal",
      });
      const setters = { name: vi.fn(), kcal: vi.fn(), protein_g: vi.fn() };
      const field = (key: keyof MealFormState) =>
        setters[key as keyof typeof setters];
      render(<NameTimeRow form={makeForm()} field={field} setForm={vi.fn()} />);
      fireEvent.click(screen.getByRole("button", { name: "mic" }));
      expect(setters.name).toHaveBeenCalledWith(expectedName);
      expect(setters.kcal).toHaveBeenCalledWith(String(kcal));
      if (protein != null)
        expect(setters.protein_g).toHaveBeenCalledWith(String(protein));
      else expect(setters.protein_g).not.toHaveBeenCalled();
    },
  );

  it("ignores unparsed voice transcripts and records voice errors", () => {
    vi.mocked(parseMealSpeech).mockReturnValue(null);
    const setForm = vi.fn();
    render(<NameTimeRow form={makeForm()} field={vi.fn()} setForm={setForm} />);

    fireEvent.click(screen.getByRole("button", { name: "mic" }));
    expect(setForm).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "mic error" }));
    const update = setForm.mock.calls[0]?.[0] as (
      form: MealFormState,
    ) => MealFormState;
    expect(update(makeForm())).toMatchObject({ err: "voice failed" });
  });
});
