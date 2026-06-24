/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";

const routineState = vi.hoisted(() => ({
  routine: {
    prefs: {} as Record<string, unknown>,
  },
  // `setRoutine` invokes its updater (like the real useState setter) so the
  // RoutineSection delete flow — which computes `snapshot` *inside* the
  // updater closure — actually runs and surfaces the undo toast.
  setRoutine: vi.fn((updater: unknown) => {
    if (typeof updater === "function") {
      (updater as (s: unknown) => unknown)({ habits: [] });
    }
  }),
  updatePref: vi.fn(),
}));
vi.mock("../../modules/routine/hooks/useRoutineState", () => ({
  useRoutineState: () => routineState,
}));

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("@shared/hooks/useToast", () => ({ useToast: () => toast }));

const showUndoToast = vi.hoisted(() => vi.fn());
vi.mock("@shared/lib/ui/undoToast", () => ({ showUndoToast }));

const storageMocks = vi.hoisted(() => ({
  deleteHabit: vi.fn((s: unknown) => s),
  restoreHabit: vi.fn((s: unknown) => s),
  snapshotHabit: vi.fn(() => ({ id: "h1" })),
}));
vi.mock("../../modules/routine/lib/routineStorage", () => storageMocks);

// Child surfaces own their own coverage; expose their callbacks via test hooks.
type DeleteCb = (p: { id: string; name: string; archived?: boolean }) => void;
const childCbs = vi.hoisted(
  () =>
    ({ activeDelete: undefined, archivedDelete: undefined }) as {
      activeDelete: DeleteCb | undefined;
      archivedDelete: DeleteCb | undefined;
    },
);

vi.mock(
  "../../modules/routine/components/settings/ActiveHabitsSection",
  () => ({
    ActiveHabitsSection: (props: { onRequestDelete: DeleteCb }) => {
      childCbs.activeDelete = props.onRequestDelete;
      return <div data-testid="active-habits" />;
    },
  }),
);
vi.mock(
  "../../modules/routine/components/settings/ArchivedHabitsSection",
  () => ({
    ArchivedHabitsSection: (props: { onRequestDelete: DeleteCb }) => {
      childCbs.archivedDelete = props.onRequestDelete;
      return <div data-testid="archived-habits" />;
    },
  }),
);
vi.mock("../../modules/routine/components/settings/TagsSection", () => ({
  TagsSection: () => <div data-testid="tags-section" />,
}));
vi.mock("../../modules/routine/components/settings/CategoriesSection", () => ({
  CategoriesSection: () => <div data-testid="categories-section" />,
}));
vi.mock("../../modules/routine/components/HabitDetailSheet", () => ({
  HabitDetailSheet: () => <div data-testid="habit-detail-sheet" />,
}));
vi.mock("../../modules/routine/components/HabitQuickCreateDialog", () => ({
  HabitQuickCreateDialog: () => <div data-testid="quick-create" />,
}));

import { RoutineSection } from "./RoutineSection";

describe("RoutineSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routineState.routine = { prefs: {} };
    childCbs.activeDelete = undefined;
    childCbs.archivedDelete = undefined;
  });

  afterEach(() => cleanup());

  it("renders the calendar toggles and child sections", () => {
    render(<RoutineSection />);
    expect(
      screen.getByText("Показувати тренування з Фізрука в календарі"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("active-habits")).toBeInTheDocument();
    expect(screen.getByTestId("tags-section")).toBeInTheDocument();
  });

  it("defaults the Fizruk-in-calendar toggle to on when pref is unset", () => {
    render(<RoutineSection />);
    const switches = screen.getAllByRole("switch");
    expect(switches[0]).toBeChecked();
  });

  it("reflects an explicit false pref as an off toggle", () => {
    routineState.routine = { prefs: { showFizrukInCalendar: false } };
    render(<RoutineSection />);
    expect(screen.getAllByRole("switch")[0]).not.toBeChecked();
  });

  it("calls updatePref when toggling the Fizruk calendar switch", () => {
    routineState.routine = { prefs: { showFizrukInCalendar: false } };
    render(<RoutineSection />);
    fireEvent.click(screen.getAllByRole("switch")[0]!);
    expect(routineState.updatePref).toHaveBeenCalledWith(
      "showFizrukInCalendar",
      true,
    );
  });

  it("calls updatePref for the Finyk-subscriptions calendar switch", () => {
    render(<RoutineSection />);
    fireEvent.click(screen.getAllByRole("switch")[1]!);
    expect(routineState.updatePref).toHaveBeenCalledWith(
      "showFinykSubscriptionsInCalendar",
      false,
    );
  });

  it("opens an archive-aware confirm copy for archived habit deletion", () => {
    render(<RoutineSection />);
    act(() => {
      childCbs.archivedDelete?.({ id: "h1", name: "Біг", archived: true });
    });
    expect(screen.getByText("Видалити «Біг» назавжди?")).toBeInTheDocument();
  });

  it("opens the soft-delete confirm copy for active habit deletion", () => {
    render(<RoutineSection />);
    act(() => {
      childCbs.activeDelete?.({ id: "h2", name: "Читання" });
    });
    expect(screen.getByText("Видалити звичку «Читання»?")).toBeInTheDocument();
  });

  it("deletes via storage and fires an undo toast on confirm", () => {
    render(<RoutineSection />);
    act(() => {
      childCbs.activeDelete?.({ id: "h2", name: "Читання" });
    });

    const dialog = screen.getByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Видалити" }));

    // The mock setRoutine runs its updater, so the snapshot + delete path
    // executes against the seeded `{ habits: [] }` state.
    expect(storageMocks.snapshotHabit).toHaveBeenCalledWith(
      { habits: [] },
      "h2",
    );
    expect(storageMocks.deleteHabit).toHaveBeenCalledWith({ habits: [] }, "h2");
    expect(showUndoToast).toHaveBeenCalledTimes(1);
    expect(showUndoToast.mock.calls[0]![1].msg).toBe(
      "Видалено звичку «Читання»",
    );
  });

  it("dismisses the confirm dialog on cancel without deleting", () => {
    render(<RoutineSection />);
    act(() => {
      childCbs.activeDelete?.({ id: "h2", name: "Читання" });
    });
    const dialog = screen.getByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Скасувати" }));
    expect(
      screen.queryByText("Видалити звичку «Читання»?"),
    ).not.toBeInTheDocument();
    expect(routineState.setRoutine).not.toHaveBeenCalled();
  });
});
