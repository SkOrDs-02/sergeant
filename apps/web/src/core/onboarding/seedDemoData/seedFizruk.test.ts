import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { writeJSONMock } = vi.hoisted(() => ({ writeJSONMock: vi.fn() }));

vi.mock("./utils", async () => {
  const actual = await vi.importActual<typeof import("./utils")>("./utils");
  return { ...actual, writeJSON: writeJSONMock };
});

import { seedFizruk } from "./seedFizruk";

describe("seedFizruk", () => {
  beforeEach(() => {
    writeJSONMock.mockReset();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-23T12:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("writes the fizruk workouts key with demo workouts", () => {
    seedFizruk();
    const workoutsCall = writeJSONMock.mock.calls.find(
      ([key]) => key === "fizruk_workouts_v1",
    );
    expect(workoutsCall).toBeDefined();
    const payload = workoutsCall![1] as {
      workouts?: Array<{ id?: string }>;
    };
    const workouts = Array.isArray(payload)
      ? (payload as Array<{ id?: string }>)
      : (payload.workouts ?? []);
    expect(workouts.length).toBeGreaterThan(0);
    expect(typeof workouts[0]!.id).toBe("string");
  });

  it("writes the measurements key", () => {
    seedFizruk();
    const keys = writeJSONMock.mock.calls.map(([k]) => k);
    expect(keys).toContain("fizruk_measurements_v1");
  });

  it("сіє шаблони тренувань — «Із шаблону» не має відкривати порожнечу", () => {
    seedFizruk();
    const keys = writeJSONMock.mock.calls.map(([k]) => k);
    expect(keys).toContain("fizruk_workout_templates_v1");
  });

  // Ключі м'язів мусять бути ДОМЕННІ. Невідомий ключ мапиться в `null`,
  // випадає з силуету «Моє тіло» і спливає сирим англійським рядком у
  // списку «Почекати» — саме це й було видно наживо 2026-08-08
  // («Почекати: Квадрицепс, back, shoulders»), щойно демо знову
  // почало доїжджати до модуля.
  it("вживає лише ключі м'язів, які розуміє mapDomainMuscleToAtlas", async () => {
    const { mapDomainMuscleToAtlas } =
      await import("@sergeant/fizruk-domain/data");
    seedFizruk();
    const payload = writeJSONMock.mock.calls.find(
      ([key]) => key === "fizruk_workouts_v1",
    )![1] as {
      workouts: Array<{
        items: Array<{
          musclesPrimary?: string[];
          musclesSecondary?: string[];
        }>;
      }>;
    };

    const unmapped: string[] = [];
    for (const workout of payload.workouts) {
      for (const item of workout.items) {
        for (const muscle of [
          ...(item.musclesPrimary ?? []),
          ...(item.musclesSecondary ?? []),
        ]) {
          if (mapDomainMuscleToAtlas(muscle) === null) unmapped.push(muscle);
        }
      }
    }

    expect(unmapped).toEqual([]);
  });
});
