// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { useState } from "react";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
} from "@testing-library/react";
import { emptyHabitDraft } from "../../lib/routineDraftUtils";
import type { HabitDraft } from "../../lib/types";
import { ReminderPresets } from "./ReminderPresets";

// Глобальний тумблер і дозвіл браузера керуються тестом; `updatePref` —
// шпигун, щоб не лізти в SQLite-кеші.
const routineMock = vi.hoisted(() => ({
  prefs: { routineRemindersEnabled: false } as Record<string, unknown>,
  updatePref: vi.fn(),
}));
const toastMock = vi.hoisted(() => ({ warning: vi.fn() }));

vi.mock("../../hooks/useRoutineState", () => ({
  useRoutineState: () => ({
    routine: { prefs: routineMock.prefs },
    setRoutine: vi.fn(),
    updatePref: routineMock.updatePref,
  }),
}));
vi.mock("@shared/hooks/useToast", () => ({
  useToast: () => ({ warning: toastMock.warning }),
}));

function stubNotification(
  permission: NotificationPermission,
  requested: NotificationPermission = permission,
) {
  vi.stubGlobal("Notification", {
    permission,
    requestPermission: vi.fn().mockResolvedValue(requested),
  });
}

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
  beforeEach(() => {
    routineMock.prefs = { routineRemindersEnabled: false };
    routineMock.updatePref.mockClear();
    toastMock.warning.mockClear();
    stubNotification("granted");
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

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

  // Пін на контракт ширини нативного контрола. `[min-inline-size:0]` дає
  // лише спільний примітив (`DateField` / `TimeField`); сирий `Input` його
  // НЕ має, і саме так поле ставало ширшим за екран на iOS. Playwright тут
  // не помічник — Chromium цей дефект не відтворює (заміряно 2026-09-15,
  // див. docs/start/instructions/fix-mobile-horizontal-overflow.md § 3).
  it("тримає поля часу в межах рядка — жодного intrinsic-розпирання", () => {
    render(<Harness initial={{ reminderTimes: ["08:00"] }} />);
    expect(screen.getByDisplayValue("08:00").className).toContain(
      "[min-inline-size:0]",
    );
  });

  it("adds another reminder time while under the limit", () => {
    render(<Harness initial={{ reminderTimes: ["08:00"] }} />);

    fireEvent.click(screen.getByRole("button", { name: "+ Додати час" }));

    expect(screen.getByDisplayValue("12:00")).toBeInTheDocument();
  });

  describe("підказка про глобальний тумблер нагадувань (ux-05)", () => {
    it("показує підказку й кнопку, коли час обрано, а тумблер вимкнений", () => {
      render(<Harness initial={{ reminderTimes: ["08:00"] }} />);
      expect(
        screen.getByText("Нагадування вимкнені в налаштуваннях"),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Увімкнути нагадування" }),
      ).toBeInTheDocument();
    });

    it("не показує підказку, поки час не обрано", () => {
      render(<Harness />);
      expect(
        screen.queryByRole("button", { name: "Увімкнути нагадування" }),
      ).toBeNull();
    });

    it("клік при дозволі granted вмикає routineRemindersEnabled", async () => {
      render(<Harness initial={{ reminderTimes: ["08:00"] }} />);
      fireEvent.click(
        screen.getByRole("button", { name: "Увімкнути нагадування" }),
      );
      await waitFor(() =>
        expect(routineMock.updatePref).toHaveBeenCalledWith(
          "routineRemindersEnabled",
          true,
        ),
      );
      expect(toastMock.warning).not.toHaveBeenCalled();
    });

    it("при відмові в дозволі не вмикає тумблер, а показує попередження", async () => {
      stubNotification("default", "denied");
      render(<Harness initial={{ reminderTimes: ["08:00"] }} />);
      fireEvent.click(
        screen.getByRole("button", { name: "Увімкнути нагадування" }),
      );
      await waitFor(() => expect(toastMock.warning).toHaveBeenCalledTimes(1));
      expect(routineMock.updatePref).not.toHaveBeenCalled();
    });

    it("не показує підказку, коли тумблер увімкнений і дозвіл granted", () => {
      routineMock.prefs = { routineRemindersEnabled: true };
      render(<Harness initial={{ reminderTimes: ["08:00"] }} />);
      expect(
        screen.queryByRole("button", { name: "Увімкнути нагадування" }),
      ).toBeNull();
      expect(screen.queryByRole("status")).toBeNull();
    });

    it("показує підказку про дозвіл, коли тумблер увімкнений, а дозволу немає", () => {
      routineMock.prefs = { routineRemindersEnabled: true };
      stubNotification("denied");
      render(<Harness initial={{ reminderTimes: ["08:00"] }} />);
      expect(
        screen.getByRole("button", { name: "Увімкнути нагадування" }),
      ).toBeInTheDocument();
    });
  });
});
