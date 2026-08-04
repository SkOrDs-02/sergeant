/** @vitest-environment jsdom */
/**
 * Last validated: 2026-08-03
 * Status: Active
 *
 * Delete-flow покриття, що переїхало сюди з `core/settings/RoutineSection`
 * разом із самим блоком керування звичками (2026-08-03).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { defaultRoutineState } from "@sergeant/routine-domain";
import type { RoutineState } from "../lib/types";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("@shared/hooks/useToast", () => ({ useToast: () => toast }));

const showUndoToast = vi.hoisted(() => vi.fn());
vi.mock("@shared/lib/ui/undoToast", () => ({ showUndoToast }));

const storageMocks = vi.hoisted(() => ({
  deleteHabit: vi.fn((s: unknown) => s),
  restoreHabit: vi.fn((s: unknown) => s),
  snapshotHabit: vi.fn(() => ({ id: "h1" })),
}));
vi.mock("../lib/routineStorage", () => storageMocks);

// Child surfaces own their own coverage; expose their callbacks via test hooks.
type DeleteCb = (p: { id: string; name: string; archived?: boolean }) => void;
const childCbs = vi.hoisted(
  () =>
    ({ activeDelete: undefined, archivedDelete: undefined }) as {
      activeDelete: DeleteCb | undefined;
      archivedDelete: DeleteCb | undefined;
    },
);

vi.mock("./habits/ActiveHabitsSection", () => ({
  ActiveHabitsSection: (props: { onRequestDelete: DeleteCb }) => {
    childCbs.activeDelete = props.onRequestDelete;
    return <div data-testid="active-habits" />;
  },
}));
vi.mock("./habits/ArchivedHabitsSection", () => ({
  ArchivedHabitsSection: (props: { onRequestDelete: DeleteCb }) => {
    childCbs.archivedDelete = props.onRequestDelete;
    return <div data-testid="archived-habits" />;
  },
}));
vi.mock("./HabitDetailSheet", () => ({
  HabitDetailSheet: () => <div data-testid="habit-detail-sheet" />,
}));
vi.mock("./HabitQuickCreateDialog", () => ({
  HabitQuickCreateDialog: () => <div data-testid="quick-create" />,
}));

import { RoutineHabitsPanel } from "./RoutineHabitsPanel";

const setRoutine = vi.fn((updater: unknown) => {
  if (typeof updater === "function") {
    (updater as (s: unknown) => unknown)({ habits: [] });
  }
});

function renderPanel() {
  return render(
    <RoutineHabitsPanel
      routine={defaultRoutineState() as RoutineState}
      setRoutine={setRoutine as never}
    />,
  );
}

describe("RoutineHabitsPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    childCbs.activeDelete = undefined;
    childCbs.archivedDelete = undefined;
  });

  afterEach(() => cleanup());

  it("renders both the active list and the archive as a routine tabpanel", () => {
    renderPanel();
    expect(screen.getByRole("tabpanel")).toHaveAttribute(
      "id",
      "routine-panel-habits",
    );
    expect(screen.getByTestId("active-habits")).toBeInTheDocument();
    expect(screen.getByTestId("archived-habits")).toBeInTheDocument();
  });

  it("opens an archive-aware confirm copy for archived habit deletion", () => {
    renderPanel();
    act(() => {
      childCbs.archivedDelete?.({ id: "h1", name: "Біг", archived: true });
    });
    expect(screen.getByText("Видалити «Біг» назавжди?")).toBeInTheDocument();
  });

  it("opens the soft-delete confirm copy for active habit deletion", () => {
    renderPanel();
    act(() => {
      childCbs.activeDelete?.({ id: "h2", name: "Читання" });
    });
    expect(screen.getByText("Видалити звичку «Читання»?")).toBeInTheDocument();
  });

  it("deletes via storage and fires an undo toast on confirm", () => {
    renderPanel();
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
    renderPanel();
    act(() => {
      childCbs.activeDelete?.({ id: "h2", name: "Читання" });
    });
    const dialog = screen.getByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Скасувати" }));
    expect(
      screen.queryByText("Видалити звичку «Читання»?"),
    ).not.toBeInTheDocument();
    expect(setRoutine).not.toHaveBeenCalled();
  });
});
