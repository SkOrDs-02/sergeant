// @vitest-environment jsdom
import type { ComponentProps } from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { defaultRoutineState } from "@sergeant/routine-domain";
import { ToastProvider } from "@shared/hooks/useToast";
import { ToastContainer } from "@shared/components/ui/Toast";
import { RoutineActions } from "./RoutineActions";

vi.mock("@shared/lib/storage/storage", async () => {
  const actual = await vi.importActual<
    typeof import("@shared/lib/storage/storage")
  >("@shared/lib/storage/storage");
  return {
    ...actual,
    safeWriteLS: () => true,
    safeReadLS: () => null,
    safeReadStringLS: () => null,
  };
});

vi.mock("@shared/lib/adapters/haptic", () => ({
  hapticSuccess: vi.fn(),
  hapticTap: vi.fn(),
}));

function renderActions(
  props: Partial<ComponentProps<typeof RoutineActions>> = {},
) {
  return render(
    <ToastProvider>
      <RoutineActions
        mainTab="calendar"
        setMainTab={vi.fn()}
        routine={defaultRoutineState()}
        setRoutine={vi.fn()}
        quickAddHabitOpen={false}
        quickAddFocusTick={0}
        quickAddFirstRunHint={false}
        onDismissQuickAddFirstRunHint={vi.fn()}
        onOpenQuickAddHabit={vi.fn()}
        onCloseQuickAddHabit={vi.fn()}
        {...props}
      />
      <ToastContainer />
    </ToastProvider>,
  );
}

describe("RoutineActions", () => {
  afterEach(cleanup);

  it("renders bottom nav and opens quick-add dialog", () => {
    const onOpenQuickAddHabit = vi.fn();
    renderActions({ onOpenQuickAddHabit });

    fireEvent.click(screen.getByRole("button", { name: /Додати звичку/i }));
    expect(onOpenQuickAddHabit).toHaveBeenCalledTimes(1);
  });

  it("shows quick-add dialog when open", () => {
    renderActions({
      quickAddHabitOpen: true,
      quickAddFocusTick: 1,
      quickAddFirstRunHint: true,
    });

    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
