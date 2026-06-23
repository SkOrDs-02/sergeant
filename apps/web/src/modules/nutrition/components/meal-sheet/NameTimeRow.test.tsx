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
  VoiceMicButton: () => <button type="button">mic</button>,
}));

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
});
