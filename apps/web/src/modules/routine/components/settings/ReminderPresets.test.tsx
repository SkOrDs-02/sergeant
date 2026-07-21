// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { emptyHabitDraft } from "../../lib/routineDraftUtils";
import type { HabitDraft } from "../../lib/types";
import { ReminderPresets } from "./ReminderPresets";

function Harness({ initial }: { initial?: Partial<HabitDraft> }) {
  const [habitDraft, setHabitDraft] = useState<HabitDraft>({
    ...emptyHabitDraft(),
    ...initial,
  });
  return (
    <ReminderPresets habitDraft={habitDraft} setHabitDraft={setHabitDraft} />
  );
}

describe("ReminderPresets", () => {
  afterEach(cleanup);

  it("selects a reminder preset", () => {
    render(<Harness />);
    const morning = screen.getByRole("radio", { name: "Ранок" });
    fireEvent.click(morning);
    expect(morning).toHaveAttribute("aria-checked", "true");
  });

  it("clears reminders via «Без» option", () => {
    render(<Harness initial={{ reminderTimes: ["08:00"] }} />);
    fireEvent.click(screen.getByRole("radio", { name: "Без" }));
    expect(screen.getByRole("radio", { name: "Без" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("removes a custom reminder time", () => {
    render(<Harness initial={{ reminderTimes: ["08:00", "12:00"] }} />);
    fireEvent.click(
      screen.getAllByRole("button", { name: "Видалити час" })[0]!,
    );
    expect(screen.getAllByDisplayValue(/\d{2}:\d{2}/)).toHaveLength(1);
  });

  it("updates a custom reminder time", () => {
    render(<Harness initial={{ reminderTimes: ["08:00"] }} />);
    const input = screen.getByDisplayValue("08:00");

    fireEvent.change(input, { target: { value: "09:30" } });

    expect(screen.getByDisplayValue("09:30")).toBeInTheDocument();
  });

  it("adds another reminder time while under the limit", () => {
    render(<Harness initial={{ reminderTimes: ["08:00"] }} />);

    fireEvent.click(screen.getByRole("button", { name: "+ Додати час" }));

    expect(screen.getByDisplayValue("12:00")).toBeInTheDocument();
  });
});
