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

  it("applies parsed voice meal fields and clears the form error", () => {
    vi.mocked(parseMealSpeech).mockReturnValue({
      name: "Омлет",
      kcal: 249.6,
      protein: 30.4,
      grams: null,
      raw: "омлет 250 ккал",
    });
    const setForm = vi.fn();
    render(<NameTimeRow form={makeForm()} field={vi.fn()} setForm={setForm} />);

    fireEvent.click(screen.getByRole("button", { name: "mic" }));

    const update = setForm.mock.calls[0]?.[0] as (
      form: MealFormState,
    ) => MealFormState;
    expect(update(makeForm({ err: "old error" }))).toMatchObject({
      name: "Омлет",
      kcal: "250",
      protein_g: "30",
      err: "",
    });
  });

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
