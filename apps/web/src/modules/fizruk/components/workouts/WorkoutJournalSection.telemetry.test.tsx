// @vitest-environment jsdom
/**
 * Телеметрія петель цінності (Хвиля 2) для завершення тренування.
 *
 * `fizruk_workout_finished` — половина «дію зроблено» модуля fizruk.
 * У payload лише counts і прапорці: назв вправ і нотаток там немає і бути
 * не має (Hard Rule #21 — `scrubPII` чистить за іменами ключів, тож
 * `nameUk` у події не був би вирізаний).
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

const mocks = vi.hoisted(() => ({ trackEvent: vi.fn() }));

vi.mock("../../../../core/observability/analytics", () => ({
  trackEvent: mocks.trackEvent,
  ANALYTICS_EVENTS: { FIZRUK_WORKOUT_FINISHED: "fizruk_workout_finished" },
}));
vi.mock("../workouts/ActiveWorkoutPanel", () => ({
  ActiveWorkoutPanel: ({ onFinishClick }: { onFinishClick: () => void }) => (
    <button type="button" data-testid="finish-btn" onClick={onFinishClick}>
      Завершити
    </button>
  ),
}));
vi.mock("@shared/components/ui/VirtualList", () => ({
  VirtualList: ({
    items,
    children,
  }: {
    items: unknown[];
    children: (item: unknown, index: number) => React.ReactNode;
  }) => (
    <div>
      {items.map((item, i) => (
        <div key={i}>{children(item, i)}</div>
      ))}
    </div>
  ),
}));

import { ToastProvider } from "@shared/hooks/useToast";
import type { Workout, WorkoutItem } from "@sergeant/fizruk-domain/domain";
import {
  markSignalShown,
  resetSignalAttribution,
} from "../../../../core/observability/valueSignalAttribution";
import { WorkoutJournalSection } from "./WorkoutJournalSection";

function strengthItem(sets: number): WorkoutItem {
  return {
    id: `i-${sets}`,
    exerciseId: "bench",
    nameUk: "Жим лежачи",
    primaryGroup: "chest",
    musclesPrimary: [],
    musclesSecondary: [],
    type: "strength",
    sets: Array.from({ length: sets }, (_, i) => ({
      id: `s-${i}`,
      reps: 8,
      weightKg: 40,
    })) as WorkoutItem["sets"],
  };
}

/**
 * A strength item whose `sets` array mixes real (non-zero) rows with
 * untouched `{weightKg: 0, reps: 0}` rows — the shape a set editor leaves
 * behind when a row was added but never filled in.
 */
function itemWithSets(
  sets: Array<{ reps: number; weightKg: number }>,
): WorkoutItem {
  return {
    id: `i-mixed-${sets.length}`,
    exerciseId: "squat",
    nameUk: "Присідання",
    primaryGroup: "legs",
    musclesPrimary: [],
    musclesSecondary: [],
    type: "strength",
    sets: sets.map((s, i) => ({ id: `s-${i}`, ...s })) as WorkoutItem["sets"],
  };
}

function baseProps(overrides: Record<string, unknown> = {}) {
  const active: Workout = {
    id: "w-active",
    startedAt: new Date("2025-01-01T10:00:00Z").toISOString(),
    endedAt: null,
    items: [],
    groups: [],
    warmup: null,
    cooldown: null,
    note: "",
    ...((overrides["activeWorkout"] as Partial<Workout>) ?? {}),
  };
  return {
    activeWorkout: active,
    activeDuration: "00:42",
    workouts: [active],
    activeWorkoutId: active.id,
    setActiveWorkoutId: vi.fn(),
    retroOpen: false,
    setRetroOpen: vi.fn(),
    retroDate: "",
    setRetroDate: vi.fn(),
    retroTime: "",
    setRetroTime: vi.fn(),
    createWorkout: vi.fn(),
    setMode: vi.fn(),
    musclesUk: {},
    recBy: {},
    lastByExerciseId: {},
    setRestTimer: vi.fn(),
    updateWorkout: vi.fn(),
    updateItem: vi.fn(),
    removeItem: vi.fn(),
    setFinishFlash: vi.fn(),
    endWorkout: vi.fn(() => active),
    summarizeWorkoutForFinish: vi.fn(() => ({
      durationSec: 1500,
      items: active.items.length,
      tonnageKg: 0,
    })),
    submitRetroWorkout: vi.fn(),
    deleteWorkout: vi.fn(),
    restoreWorkout: vi.fn(),
    ...overrides,
  };
}

function finishCalls() {
  return mocks.trackEvent.mock.calls.filter(
    (c) => c[0] === "fizruk_workout_finished",
  );
}

/** Payload n-ної події. Кидає, якщо події не було — це і є асершен. */
function finishPayload(index = 0): Record<string, unknown> {
  const call = finishCalls()[index];
  if (!call) throw new Error(`fizruk_workout_finished #${index} не полетів`);
  return call[1] as Record<string, unknown>;
}

function renderSection(props: ReturnType<typeof baseProps>) {
  return render(
    <ToastProvider>
      <WorkoutJournalSection {...props} />
    </ToastProvider>,
  );
}

describe("WorkoutJournalSection — телеметрія завершення", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    resetSignalAttribution();
    sessionStorage.clear();
  });

  it("емітить fizruk_workout_finished з counts і атрибуцією", () => {
    const props = baseProps({
      activeWorkout: { items: [strengthItem(3), strengthItem(2)] },
    });
    renderSection(props);

    fireEvent.click(screen.getByTestId("finish-btn"));

    expect(finishCalls()).toHaveLength(1);
    expect(finishPayload()).toEqual({
      items: 2,
      sets: 5,
      has_sets: true,
      duration_min: 25,
      after_signal: false,
      ms_since_signal: null,
      signal: null,
    });
  });

  it("порожнє тренування їде з has_sets=false, а не мовчки зникає", () => {
    const props = baseProps();
    renderSection(props);

    fireEvent.click(screen.getByTestId("finish-btn"));

    expect(finishPayload()).toMatchObject({ items: 0, has_sets: false });
  });

  it("re-entry-guard: подвійний клік дає рівно одну подію", () => {
    const props = baseProps({
      activeWorkout: { items: [strengthItem(1)] },
    });
    renderSection(props);

    const btn = screen.getByTestId("finish-btn");
    fireEvent.click(btn);
    fireEvent.click(btn);

    expect(finishCalls()).toHaveLength(1);
  });

  it("уже завершене тренування не емітить події", () => {
    const props = baseProps({
      activeWorkout: {
        endedAt: new Date("2025-01-01T11:00:00Z").toISOString(),
      },
    });
    renderSection(props);

    fireEvent.click(screen.getByTestId("finish-btn"));

    expect(finishCalls()).toHaveLength(0);
  });

  it("дописує атрибуцію показаного fizruk-сигналу", () => {
    markSignalShown({ signal: "fizruk-rest-day-overdue", module: "fizruk" });
    const props = baseProps({ activeWorkout: { items: [strengthItem(1)] } });
    renderSection(props);

    fireEvent.click(screen.getByTestId("finish-btn"));

    expect(finishPayload()).toMatchObject({
      after_signal: true,
      signal: "fizruk-rest-day-overdue",
    });
  });

  it("порожні сети (weightKg:0, reps:0) не рахуються — sets/has_sets узгоджені з журналом", () => {
    // Raw `sets.length` across items would be 4 (3 + 1); the canonical
    // `computeWorkoutSetCount` criterion (weightKg > 0 || reps > 0) counts
    // only 2 — this is the exact bug from the live audit: the event
    // showed `sets: 3` while the journal showed «1 сетів» for the same
    // session.
    const props = baseProps({
      activeWorkout: {
        items: [
          itemWithSets([
            { reps: 8, weightKg: 60 },
            { reps: 0, weightKg: 0 }, // untouched row — must not count
            { reps: 0, weightKg: 0 }, // untouched row — must not count
          ]),
          itemWithSets([{ reps: 5, weightKg: 40 }]),
        ],
      },
    });
    renderSection(props);

    fireEvent.click(screen.getByTestId("finish-btn"));

    expect(finishPayload()).toMatchObject({ sets: 2, has_sets: true });
  });

  it("тренування лише з порожніми сетами дає has_sets=false", () => {
    const props = baseProps({
      activeWorkout: {
        items: [
          itemWithSets([
            { reps: 0, weightKg: 0 },
            { reps: 0, weightKg: 0 },
          ]),
        ],
      },
    });
    renderSection(props);

    fireEvent.click(screen.getByTestId("finish-btn"));

    expect(finishPayload()).toMatchObject({ sets: 0, has_sets: false });
  });

  it("у payload немає назв вправ і нотаток (Hard Rule #21)", () => {
    const props = baseProps({
      activeWorkout: { items: [strengthItem(1)], note: "секретна нотатка" },
    });
    renderSection(props);

    fireEvent.click(screen.getByTestId("finish-btn"));

    const payload = JSON.stringify(finishPayload());
    expect(payload).not.toContain("Жим");
    expect(payload).not.toContain("секретна");
  });
});
