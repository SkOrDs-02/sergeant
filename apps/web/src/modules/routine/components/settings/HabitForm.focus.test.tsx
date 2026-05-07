// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { emptyHabitDraft } from "../../lib/routineDraftUtils";
import type { HabitDraft, RoutineState } from "../../lib/types";
import { HabitForm } from "./HabitForm";

vi.mock("@shared/components/ui/VoiceMicButton", () => ({
  VoiceMicButton: () => null,
}));

const routine = {
  habits: [],
  tags: [],
  categories: [],
} as unknown as RoutineState;

function Harness() {
  const [draft, setDraft] = useState<HabitDraft>(() => emptyHabitDraft());

  return (
    <HabitForm
      routine={routine}
      habitDraft={draft}
      setHabitDraft={setDraft}
      editingId={null}
      onSave={() => {}}
      onCancel={() => {}}
      hideHeading
    />
  );
}

describe("HabitForm focus stability", () => {
  it("keeps the name input mounted and focused while typing in the dialog form", () => {
    render(<Harness />);

    const input = screen.getByPlaceholderText("Назва");
    input.focus();
    expect(document.activeElement).toBe(input);

    fireEvent.change(input, { target: { value: "в" } });

    expect(screen.getByPlaceholderText("Назва")).toBe(input);
    expect(document.activeElement).toBe(input);
  });
});
