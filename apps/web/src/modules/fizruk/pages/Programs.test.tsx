// @vitest-environment jsdom
/**
 * Page tests for the Programs screen (page-audit-07 F5).
 *
 * Exercises the page wiring the audit flagged as untested:
 *  - the DEVICE-local `todayDayIndex` (ADR-0078) drives "Розпочати сьогодні"
 *    vs "Сьогодні відпочинок" for the active program (F2);
 *  - the day-strip carries a screen-reader summary (F16);
 *  - starting a session resolves the schedule sessionKey safely and never
 *    crashes on a missing session (F6);
 *  - activate / deactivate CTAs fire the injected callbacks.
 *
 * `useExerciseCatalog` is mocked; `weekdayIndex` (from `@sergeant/fizruk-domain`)
 * is mocked so "today" is deterministic regardless of the host clock, except
 * in the dedicated ADR-0078 regression test below, which wires the mock
 * through to the REAL `weekdayIndex` implementation under a frozen system
 * clock — proving the page reads the device day, not Kyiv's.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { BUILTIN_PROGRAMS } from "@sergeant/fizruk-domain";
import type { FizrukData } from "@sergeant/fizruk-domain";

const mockWeekdayIndex = vi.fn<() => number>(() => 0);
const mockExercises = vi.fn<() => FizrukData.RawExerciseDef[]>(() => []);

vi.mock("@sergeant/fizruk-domain", async () => {
  const actual = await vi.importActual<
    typeof import("@sergeant/fizruk-domain")
  >("@sergeant/fizruk-domain");
  return { ...actual, weekdayIndex: () => mockWeekdayIndex() };
});

vi.mock("../hooks/useExerciseCatalog", () => ({
  useExerciseCatalog: () => ({ exercises: mockExercises(), musclesUk: {} }),
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
  mockWeekdayIndex.mockReturnValue(0);
  mockExercises.mockReturnValue([]);
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
    mockWeekdayIndex.mockReturnValue(firstTrainingDay - 1);
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
    mockWeekdayIndex.mockReturnValue(restIndex!);
    const props = baseProps();
    props.activeProgramId = firstProgram.id;
    props.activeProgram = firstProgram;
    render(<Programs {...props} />);
    expect(screen.getByText("Сьогодні відпочинок")).toBeInTheDocument();
  });

  it("calls onStartWorkout with the resolved session (F6)", () => {
    mockWeekdayIndex.mockReturnValue(firstTrainingDay - 1);
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

  it("expands program details and shows the missing-exercises fallback", () => {
    render(<Programs {...baseProps()} />);

    fireEvent.click(screen.getAllByRole("button", { name: "Деталі" })[0]!);

    expect(screen.getByText("Згорнути")).toBeInTheDocument();
    expect(screen.getByText("Розклад та вправи")).toBeInTheDocument();
    expect(
      screen.getAllByText(
        "Вправи з програми відсутні в каталозі — додайте вправи з відповідними ID вручну.",
      ).length,
    ).toBeGreaterThan(0);
  });

  it("renders resolved exercise names inside expanded program details", () => {
    const firstSessionKey = firstProgram.schedule[0]!.sessionKey;
    const firstSession = firstProgram.sessions[firstSessionKey]!;
    const firstExerciseId = firstSession.exerciseIds[0]!;
    mockExercises.mockReturnValue([
      {
        id: firstExerciseId,
        name: { uk: "Тестова вправа", en: "Test exercise" },
        primaryGroup: "chest",
        musclesPrimary: [],
        musclesSecondary: [],
        equipment: [],
      },
    ]);

    render(<Programs {...baseProps()} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Деталі" })[0]!);

    expect(screen.getAllByText("Тестова вправа").length).toBeGreaterThan(0);
  });

  it("uses the DEVICE day, not Kyiv, near midnight (ADR-0078 regression)", () => {
    // 2026-04-19T22:00:00Z is Sunday on the device clock (UTC in this test
    // env), but Kyiv is already UTC+3 (EEST/DST) at that instant, so a
    // Kyiv-anchored "today" would read Monday 2026-04-20 01:00 instead.
    // The first built-in program (PPL) trains Mon–Sat and rests Sunday —
    // a stale Kyiv-based implementation would wrongly show "Розпочати
    // сьогодні" for Monday's Push day; the device-local fix must show rest.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-19T22:00:00Z"));
    // Wire the mock through to the REAL weekdayIndex implementation so this
    // test exercises actual device-clock derivation, not a hand-picked stub.
    return vi
      .importActual<typeof import("@sergeant/fizruk-domain")>(
        "@sergeant/fizruk-domain",
      )
      .then(({ weekdayIndex: actualWeekdayIndex }) => {
        mockWeekdayIndex.mockImplementation(actualWeekdayIndex);

        const props = baseProps();
        props.activeProgramId = firstProgram.id;
        props.activeProgram = firstProgram;
        render(<Programs {...props} />);

        expect(screen.getByText("Сьогодні відпочинок")).toBeInTheDocument();
        expect(
          screen.queryByRole("button", { name: "Розпочати сьогодні" }),
        ).not.toBeInTheDocument();

        vi.useRealTimers();
      });
  });
});
