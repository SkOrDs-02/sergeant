// @vitest-environment jsdom
/**
 * Експозиція стріку на полумʼї героя (Хвиля 2, `routine_streak_shown`).
 *
 * Головне, що тут захищено, — ДЕДУПЛІКАЦІЯ. Цей екран ре-рендериться на
 * кожен toggle звички; без guard-а показ роздувся б у десятки разів і
 * conversion `checkin / shown` впала б у нуль на рівному місці.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";

const mocks = vi.hoisted(() => ({ trackEvent: vi.fn() }));

vi.mock("../../../core/observability/analytics", () => ({
  trackEvent: mocks.trackEvent,
  ANALYTICS_EVENTS: { ROUTINE_STREAK_SHOWN: "routine_streak_shown" },
}));
vi.mock("../hooks/useStreakFlame", () => ({
  useStreakFlame: (streak: number) => ({
    visible: streak > 0,
    intensity: "low",
    count: streak,
    reducedMotion: false,
  }),
}));

import { RoutineCalendarHero } from "./RoutineCalendarHero";
import { readStreakExposure, resetStreakExposure } from "../lib/streakExposure";

function renderHero(currentStreak: number) {
  return render(
    <RoutineCalendarHero
      rangeLabel="Сьогодні"
      headlineDate="25 липня"
      dayProgress={{ completed: 1, scheduled: 2 }}
      filteredCount={2}
      activeHabitsCount={2}
      completionRate={{ rate: 0.5, completed: 1, scheduled: 2 }}
      currentStreak={currentStreak}
      onOpenDayReport={vi.fn()}
    />,
  );
}

function shownCalls() {
  return mocks.trackEvent.mock.calls.filter(
    (c) => c[0] === "routine_streak_shown",
  );
}

/** Payload n-ної події. Кидає, якщо події не було — це і є асершен. */
function shownPayload(index = 0): Record<string, unknown> {
  const call = shownCalls()[index];
  if (!call) throw new Error(`routine_streak_shown #${index} не полетів`);
  return call[1] as Record<string, unknown>;
}

describe("RoutineCalendarHero — експозиція стріку", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStreakExposure();
    sessionStorage.clear();
  });
  afterEach(cleanup);

  it("емітить routine_streak_shown з поверхнею hero_flame і scope", () => {
    renderHero(9);

    expect(shownCalls()).toHaveLength(1);
    expect(shownPayload()).toEqual({
      surface: "hero_flame",
      streak_days: 9,
      scope: "max_across_habits",
    });
  });

  it("ре-рендер того самого екрана НЕ множить показ", () => {
    const { rerender } = renderHero(9);
    for (let i = 0; i < 5; i++) {
      rerender(
        <RoutineCalendarHero
          rangeLabel="Сьогодні"
          headlineDate="25 липня"
          dayProgress={{ completed: 1, scheduled: 2 }}
          filteredCount={2}
          activeHabitsCount={2}
          completionRate={{ rate: 0.5, completed: 1, scheduled: 2 }}
          currentStreak={9}
          onOpenDayReport={vi.fn()}
        />,
      );
    }

    expect(shownCalls()).toHaveLength(1);
  });

  it("повторний монтаж екрана в тій же сесії теж не множить показ", () => {
    renderHero(9);
    cleanup();
    renderHero(9);

    expect(shownCalls()).toHaveLength(1);
  });

  it("холодний стрік (0) не показує полумʼя і не емітить події", () => {
    renderHero(0);

    expect(shownCalls()).toHaveLength(0);
    expect(readStreakExposure().saw_streak_surface).toBe(null);
  });

  it("пише в леджер експозиції, щоб чекін міг дописати собі стрік-поля", () => {
    renderHero(4);

    expect(readStreakExposure()).toMatchObject({
      saw_streak_surface: "hero_flame",
      streak_days_at_checkin: 4,
    });
  });
});
