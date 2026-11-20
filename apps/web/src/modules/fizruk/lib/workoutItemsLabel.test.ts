import { describe, expect, it } from "vitest";
import {
  formatWorkoutItemsCount,
  workoutItemsLabel,
} from "./workoutItemsLabel";

// Одне джерело числа вправ для діалогу «Завершити зараз?», історії й
// «Останніх» — той самий лічильник, що в підсумку «Вправ N з M»
// (`computeWorkoutDoneItemCount`, рішення founder-а 2026-11-18).

const strength = (id: string, sets: { weightKg: number; reps: number }[]) => ({
  id,
  exerciseId: id,
  nameUk: id,
  primaryGroup: "chest",
  musclesPrimary: [] as string[],
  musclesSecondary: [] as string[],
  type: "strength",
  sets,
});

describe("formatWorkoutItemsCount", () => {
  it("коротка форма, коли зроблено всі", () => {
    expect(formatWorkoutItemsCount(2, 2)).toBe("2 вправи");
    expect(formatWorkoutItemsCount(1, 1)).toBe("1 вправа");
    expect(formatWorkoutItemsCount(5, 5)).toBe("5 вправ");
    expect(formatWorkoutItemsCount(0, 0)).toBe("0 вправ");
  });

  it("«N з M», коли зроблено не всі; іменник за M у родовому", () => {
    expect(formatWorkoutItemsCount(1, 2)).toBe("1 з 2 вправ");
    expect(formatWorkoutItemsCount(0, 1)).toBe("0 з 1 вправи");
    expect(formatWorkoutItemsCount(3, 21)).toBe("3 з 21 вправи");
    expect(formatWorkoutItemsCount(4, 6)).toBe("4 з 6 вправ");
  });
});

describe("workoutItemsLabel", () => {
  it("програма, де частина вправ без зарахованих підходів", () => {
    expect(
      workoutItemsLabel({
        items: [
          strength("a", [{ weightKg: 60, reps: 8 }]),
          // Рядок лише з вагою плану — не підхід (`isSetCompleted`).
          strength("b", [{ weightKg: 80, reps: 0 }]),
        ],
      }),
    ).toBe("1 з 2 вправ");
  });

  it("усе виконано — одне число", () => {
    expect(
      workoutItemsLabel({
        items: [
          strength("a", [{ weightKg: 60, reps: 8 }]),
          strength("b", [{ weightKg: 0, reps: 12 }]),
        ],
      }),
    ).toBe("2 вправи");
  });

  it("вільне тренування: додана, але не почата вправа теж не зроблена", () => {
    expect(
      workoutItemsLabel({
        items: [strength("a", [{ weightKg: 40, reps: 10 }]), strength("b", [])],
      }),
    ).toBe("1 з 2 вправ");
  });

  it("ретро-запис: підходи з повторами зараховані без ✓; заняття за часом — за секундами на вправі", () => {
    expect(
      workoutItemsLabel({
        items: [
          strength("a", [
            { weightKg: 50, reps: 10 },
            { weightKg: 50, reps: 8 },
          ]),
          // Заняття за часом (`type: "time"`) без рядків підходів.
          {
            type: "time",
            durationSec: 1200,
          },
        ],
      }),
    ).toBe("2 вправи");
  });

  it("порожнє чи відсутнє тренування", () => {
    expect(workoutItemsLabel({ items: [] })).toBe("0 вправ");
    expect(workoutItemsLabel(null)).toBe("0 вправ");
  });
});
