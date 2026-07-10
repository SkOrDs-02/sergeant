// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { emptyHabitDraft } from "../../lib/routineDraftUtils";
import type { HabitDraft } from "../../lib/types";
import { ReminderPresets } from "./ReminderPresets";

afterEach(cleanup);

function Harness({ initial }: { initial: HabitDraft }) {
  const [habitDraft, setHabitDraft] = useState(initial);
  return (
    <ReminderPresets habitDraft={habitDraft} setHabitDraft={setHabitDraft} />
  );
}

describe("ReminderPresets", () => {
  it("applies a reminder preset when a chip is selected", () => {
    render(<Harness initial={emptyHabitDraft()} />);
    fireEvent.click(screen.getByRole("radio", { name: "Ранок" }));
    const inputs = screen.getAllByDisplayValue("08:00");
    expect(inputs.length).toBeGreaterThan(0);
  });

  it("clears reminders when «Без» is selected", () => {
    render(
      <Harness
        initial={{
          ...emptyHabitDraft(),
          reminderTimes: ["09:00"],
          timeOfDay: "09:00",
        }}
      />,
    );
    fireEvent.click(screen.getByRole("radio", { name: "Без" }));
    expect(screen.queryByDisplayValue("09:00")).not.toBeInTheDocument();
  });
});
