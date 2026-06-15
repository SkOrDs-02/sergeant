// @vitest-environment jsdom
/**
 * Page tests for the Programs screen (page-audit-07 F5).
 *
 * Exercises the page wiring the audit flagged as untested:
 *  - the Kyiv-anchored `todayDayIndex` drives "Розпочати сьогодні" vs
 *    "Сьогодні відпочинок" for the active program (F2);
 *  - the day-strip carries a screen-reader summary (F16);
 *  - starting a session resolves the schedule sessionKey safely and never
 *    crashes on a missing session (F6);
 *  - activate / deactivate CTAs fire the injected callbacks.
 *
 * `useExerciseCatalog` is mocked; `getKyivMondayIndex` is mocked so "today"
 * is deterministic regardless of the host clock.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { BUILTIN_PROGRAMS } from "@sergeant/fizruk-domain";

const mockMondayIndex = vi.fn<() => number>(() => 0);

vi.mock("@shared/lib/time/kyivTime", async () => {
  const actual = await vi.importActual<
    typeof import("@shared/lib/time/kyivTime")
  >("@shared/lib/time/kyivTime");
  return { ...actual, getKyivMondayIndex: () => mockMondayIndex() };
});

vi.mock("../hooks/useExerciseCatalog", () => ({
  useExerciseCatalog: () => ({ exercises: [], musclesUk: {} }),
}));

const captureException = vi.fn();
vi.mock("../../../core/observability/sentry", () => ({
  captureException: (...args: unknown[]) => captureException(...args),
}));

import { Programs } from "./Programs";

const firstProgram = BUILTIN_PROGRAMS[0]!;
const firstTrainingDay = firstProgram.schedule[0]!.day; // 1..7

function baseProps() {
  return {
    onStartWorkout: vi.fn(),
    activeProgramId: null as string | null,
    activeProgram: null as (typeof BUILTIN_PROGRAMS)[number] | null,
    activateProgram: vi.fn(),
    deactivateProgram: vi.fn(),
  };
}

beforeEach(() => {
  mockMondayIndex.mockReturnValue(0);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Programs page", () => {
  it("mounts without crashing", () => {
    expect(() => render(<Programs {...baseProps()} />)).not.toThrow();
  });

  it("renders every built-in program by name", () => {
    render(<Programs {...baseProps()} />);
    for (const prog of BUILTIN_PROGRAMS) {
      expect(screen.getAllByText(prog.name).length).toBeGreaterThan(0);
    }
  });

  it("shows an Активувати CTA for an inactive program", () => {
    render(<Programs {...baseProps()} />);
    expect(
      screen.getAllByRole("button", { name: "Активувати" }).length,
    ).toBeGreaterThan(0);
  });

  it("fires activateProgram when Активувати is clicked", () => {
    const props = baseProps();
    render(<Programs {...props} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Активувати" })[0]!);
    expect(props.activateProgram).toHaveBeenCalledWith(BUILTIN_PROGRAMS[0]!.id);
  });

  it("gives each day-strip a screen-reader schedule summary (F16)", () => {
    render(<Programs {...baseProps()} />);
    const strips = screen.getAllByRole("img", {
      name: new RegExp(`Розклад програми ${firstProgram.name}`),
    });
    expect(strips.length).toBeGreaterThan(0);
  });

  it('shows "Розпочати сьогодні" on a training day for the active program (F2)', () => {
    // Anchor "today" to the program's first scheduled training day.
    mockMondayIndex.mockReturnValue(firstTrainingDay - 1);
    const props = baseProps();
    props.activeProgramId = firstProgram.id;
    props.activeProgram = firstProgram;
    render(<Programs {...props} />);
    expect(
      screen.getByRole("button", { name: "Розпочати сьогодні" }),
    ).toBeInTheDocument();
  });

  it('shows "Сьогодні відпочинок" on a rest day for the active program', () => {
    const trainingDays = new Set(firstProgram.schedule.map((s) => s.day - 1));
    const restIndex = [0, 1, 2, 3, 4, 5, 6].find((i) => !trainingDays.has(i));
    expect(restIndex).toBeDefined();
    mockMondayIndex.mockReturnValue(restIndex!);
    const props = baseProps();
    props.activeProgramId = firstProgram.id;
    props.activeProgram = firstProgram;
    render(<Programs {...props} />);
    expect(screen.getByText("Сьогодні відпочинок")).toBeInTheDocument();
  });

  it("calls onStartWorkout with the resolved session (F6)", () => {
    mockMondayIndex.mockReturnValue(firstTrainingDay - 1);
    const props = baseProps();
    props.activeProgramId = firstProgram.id;
    props.activeProgram = firstProgram;
    render(<Programs {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Розпочати сьогодні" }));
    expect(props.onStartWorkout).toHaveBeenCalledTimes(1);
    expect(captureException).not.toHaveBeenCalled();
    const [session, prog] = props.onStartWorkout.mock.calls[0]!;
    expect(session).toBeTruthy();
    expect(prog.id).toBe(firstProgram.id);
  });

  it("fires deactivateProgram from the header Зупинити button", () => {
    const props = baseProps();
    props.activeProgramId = firstProgram.id;
    props.activeProgram = firstProgram;
    render(<Programs {...props} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Зупинити" })[0]!);
    expect(props.deactivateProgram).toHaveBeenCalled();
  });
});
