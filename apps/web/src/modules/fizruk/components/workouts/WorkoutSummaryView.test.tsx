// @vitest-environment jsdom
/**
 * Last validated: 2026-08-08
 * Status: Active
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Workout } from "@sergeant/fizruk-domain/domain";
import { flatMatch } from "@shared/testing/numberText";
import { WorkoutSummaryView } from "./WorkoutSummaryView";

function makeWorkout(override: Partial<Workout> = {}): Workout {
  return {
    id: "w1",
    startedAt: new Date("2025-03-10T10:00:00Z").toISOString(),
    endedAt: new Date("2025-03-10T11:00:00Z").toISOString(),
    items: [],
    groups: [],
    warmup: null,
    cooldown: null,
    note: "",
    ...override,
  };
}

describe("WorkoutSummaryView", () => {
  it("shows the finished-workout title, duration and the three stat tiles", () => {
    render(
      <WorkoutSummaryView
        workout={makeWorkout()}
        onRepeat={vi.fn()}
        onClose={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByText("Тренування завершено")).toBeInTheDocument();
    expect(screen.getByText("Вправ")).toBeInTheDocument();
    expect(screen.getByText("Підходів")).toBeInTheDocument();
    expect(screen.getByText("Обʼєм")).toBeInTheDocument();
  });

  // PR-Z3 (аудит 2026-09-13, хвиля 6): "Обʼєм" тут — `вага_кг × повторення`
  // (`computeWorkoutTonnageKg`), не маса. Канонічний підпис "кг×повт",
  // уніфікований з `WorkoutFinishSheets` і `RecentWorkoutsSection`.
  it("labels the volume stat 'кг×повт', not bare 'кг' — the value is weight × reps, not mass", () => {
    const workout = makeWorkout({
      items: [
        {
          id: "i1",
          exerciseId: "bench",
          nameUk: "Жим лежачи",
          primaryGroup: "chest",
          musclesPrimary: [],
          musclesSecondary: [],
          type: "strength",
          sets: [{ weightKg: 100, reps: 10 }],
        },
      ],
    });
    render(
      <WorkoutSummaryView
        workout={workout}
        onRepeat={vi.fn()}
        onClose={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByText(flatMatch("1 000 кг×повт"))).toBeInTheDocument();
  });

  it("shows a skipped exercise as «—», not the empty auto-row «0×0»", () => {
    const workout = makeWorkout({
      items: [
        {
          id: "i1",
          exerciseId: "pullup",
          nameUk: "Підтягування",
          primaryGroup: "back",
          musclesPrimary: [],
          musclesSecondary: [],
          type: "strength",
          sets: [{ weightKg: 0, reps: 0 }],
        },
        {
          id: "i2",
          exerciseId: "bench",
          nameUk: "Жим лежачи",
          primaryGroup: "chest",
          musclesPrimary: [],
          musclesSecondary: [],
          type: "strength",
          sets: [
            { weightKg: 60, reps: 8 },
            { weightKg: 0, reps: 0 },
          ],
        },
      ],
    });
    render(
      <WorkoutSummaryView
        workout={workout}
        onRepeat={vi.fn()}
        onClose={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.queryByText(/0×0/)).not.toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.getByText("60×8")).toBeInTheDocument();
  });

  it("renders the exercise list with per-item set details", () => {
    const workout = makeWorkout({
      items: [
        {
          id: "i1",
          exerciseId: "bench",
          nameUk: "Жим лежачи",
          primaryGroup: "chest",
          musclesPrimary: [],
          musclesSecondary: [],
          type: "strength",
          sets: [
            { weightKg: 40, reps: 8 },
            { weightKg: 45, reps: 6 },
          ],
        },
      ],
    });
    render(
      <WorkoutSummaryView
        workout={workout}
        onRepeat={vi.fn()}
        onClose={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByText("Жим лежачи")).toBeInTheDocument();
    expect(screen.getByText("40×8, 45×6")).toBeInTheDocument();
  });

  // RPE is optional end-to-end (`WorkoutSetRpeMenu`) — a set without it
  // must read as a plain "80×8", never "RPE 0" or any other synthesized
  // value (canon `fizruk.md` §3: "опц. `rpe` (Borg 1..10)").
  it("shows RPE next to a set only when it was recorded, omitting it otherwise", () => {
    const workout = makeWorkout({
      items: [
        {
          id: "i1",
          exerciseId: "bench",
          nameUk: "Жим лежачи",
          primaryGroup: "chest",
          musclesPrimary: [],
          musclesSecondary: [],
          type: "strength",
          sets: [
            { weightKg: 80, reps: 8, rpe: 7 },
            { weightKg: 80, reps: 6 },
          ],
        },
      ],
    });
    render(
      <WorkoutSummaryView
        workout={workout}
        onRepeat={vi.fn()}
        onClose={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByText("80×8 · RPE 7, 80×6")).toBeInTheDocument();
  });

  it("shows the wellbeing row only when energy or mood was recorded", () => {
    const { rerender } = render(
      <WorkoutSummaryView
        workout={makeWorkout()}
        onRepeat={vi.fn()}
        onClose={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.queryByText(/Самопочуття/)).not.toBeInTheDocument();

    rerender(
      <WorkoutSummaryView
        workout={makeWorkout({ wellbeing: { energy: 4, mood: 5 } })}
        onRepeat={vi.fn()}
        onClose={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByText(/Самопочуття/)).toBeInTheDocument();
    expect(screen.getByText(/енергія 4\/5/)).toBeInTheDocument();
    expect(screen.getByText(/настрій 5\/5/)).toBeInTheDocument();
  });

  it("shows the note only when present", () => {
    const { rerender } = render(
      <WorkoutSummaryView
        workout={makeWorkout()}
        onRepeat={vi.fn()}
        onClose={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.queryByText("Нотатка")).not.toBeInTheDocument();

    rerender(
      <WorkoutSummaryView
        workout={makeWorkout({ note: "Важко на присіданнях" })}
        onRepeat={vi.fn()}
        onClose={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByText("Нотатка")).toBeInTheDocument();
    expect(screen.getByText("Важко на присіданнях")).toBeInTheDocument();
  });

  it("calls onRepeat from the Повторити CTA", () => {
    const onRepeat = vi.fn();
    render(
      <WorkoutSummaryView
        workout={makeWorkout()}
        onRepeat={onRepeat}
        onClose={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    screen.getByRole("button", { name: /повторити це тренування/i }).click();
    expect(onRepeat).toHaveBeenCalledTimes(1);
  });

  it("calls onClose from the back button — PR-Z1: the only exit that does not start a new workout", () => {
    // Session chrome (header + bottom nav) is off for the whole `workout`
    // route (`FizrukApp.sessionMode`); before this, the finished-workout
    // summary had no way out except «Повторити це тренування», which
    // starts a brand-new session instead of leaving.
    const onClose = vi.fn();
    render(
      <WorkoutSummaryView
        workout={makeWorkout()}
        onRepeat={vi.fn()}
        onClose={onClose}
        onDelete={vi.fn()}
      />,
    );
    screen.getByRole("button", { name: "Повернутись до тренувань" }).click();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // ux-11 (аудит 2026-10-01): свайп в історії — touch-only; на сторінці
  // підсумку мусить бути кнопка, доступна з клавіатури (WCAG 2.1.1).
  it("has a keyboard-reachable «Видалити тренування» button that calls onDelete on Enter", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    render(
      <WorkoutSummaryView
        workout={makeWorkout()}
        onRepeat={vi.fn()}
        onClose={vi.fn()}
        onDelete={onDelete}
      />,
    );
    const del = screen.getByRole("button", { name: "Видалити тренування" });

    // Tab-ом із початку сторінки: back → «Повторити» → «Видалити».
    await user.tab();
    await user.tab();
    await user.tab();
    expect(del).toHaveFocus();

    await user.keyboard("{Enter}");
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});
