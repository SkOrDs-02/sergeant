// @vitest-environment jsdom
import type { ComponentProps } from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
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
        onCloseQuickAddHabit={vi.fn()}
        {...props}
      />
      <ToastContainer />
    </ToastProvider>,
  );
}

describe("RoutineActions", () => {
  afterEach(cleanup);

  it("renders the bottom nav without a pinned add bar", () => {
    renderActions();

    expect(screen.getByRole("navigation")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Нова звичка" }),
    ).not.toBeInTheDocument();
  });

  it("shows quick-add dialog when open", () => {
    renderActions({
      quickAddHabitOpen: true,
      quickAddFocusTick: 1,
    });

    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
