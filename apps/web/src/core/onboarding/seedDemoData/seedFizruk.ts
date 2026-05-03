import { FIZRUK_MEASUREMENTS_KEY, FIZRUK_WORKOUTS_KEY } from "./keys";
import { daysAgo, shortId, toISO, writeJSON } from "./utils";

export function seedFizruk(): void {
  // A single finished workout 2 days ago — enough for the calendar
  // streak, the recovery map, and "останнє тренування" card to light
  // up. Shape mirrors what `FinishWorkoutSheet` persists: a workout
  // item per exercise with `type: "strength"` and populated `sets`.
  const startedAt = daysAgo(2, 18, 30);
  const endedAt = new Date(startedAt.getTime() + 55 * 60 * 1000);

  const workouts = [
    {
      id: shortId("demo_wo", 1),
      startedAt: toISO(startedAt),
      endedAt: toISO(endedAt),
      note: "",
      warmup: null,
      cooldown: null,
      groups: [],
      items: [
        {
          id: shortId("demo_wi", 1),
          exerciseId: "squat",
          nameUk: "Присідання зі штангою",
          primaryGroup: "quadriceps",
          musclesPrimary: ["quadriceps"],
          musclesSecondary: ["gluteus_maximus", "rectus_abdominis"],
          type: "strength",
          sets: [
            { weightKg: 60, reps: 10 },
            { weightKg: 70, reps: 8 },
            { weightKg: 80, reps: 6 },
            { weightKg: 80, reps: 6 },
          ],
        },
        {
          id: shortId("demo_wi", 2),
          exerciseId: "bench_press",
          nameUk: "Жим штанги лежачи",
          primaryGroup: "chest",
          musclesPrimary: ["chest"],
          musclesSecondary: ["triceps", "shoulders"],
          type: "strength",
          sets: [
            { weightKg: 40, reps: 12 },
            { weightKg: 50, reps: 10 },
            { weightKg: 60, reps: 8 },
          ],
        },
        {
          id: shortId("demo_wi", 3),
          exerciseId: "deadlift",
          nameUk: "Станова тяга",
          primaryGroup: "back",
          musclesPrimary: ["back", "hamstrings"],
          musclesSecondary: ["glutes", "forearms"],
          type: "strength",
          sets: [
            { weightKg: 80, reps: 8 },
            { weightKg: 100, reps: 5 },
            { weightKg: 100, reps: 5 },
          ],
        },
      ],
    },
    {
      id: shortId("demo_wo", 2),
      startedAt: toISO(daysAgo(5, 19, 0)),
      endedAt: toISO(daysAgo(5, 19, 50)),
      note: "",
      warmup: null,
      cooldown: null,
      groups: [],
      items: [
        {
          id: shortId("demo_wi", 10),
          exerciseId: "pullup",
          nameUk: "Підтягування",
          primaryGroup: "back",
          musclesPrimary: ["back", "biceps"],
          musclesSecondary: ["forearms"],
          type: "strength",
          sets: [
            { weightKg: 0, reps: 8 },
            { weightKg: 0, reps: 7 },
            { weightKg: 0, reps: 6 },
          ],
        },
        {
          id: shortId("demo_wi", 11),
          exerciseId: "ohp",
          nameUk: "Армійський жим",
          primaryGroup: "shoulders",
          musclesPrimary: ["shoulders"],
          musclesSecondary: ["triceps"],
          type: "strength",
          sets: [
            { weightKg: 30, reps: 10 },
            { weightKg: 35, reps: 8 },
            { weightKg: 35, reps: 8 },
          ],
        },
      ],
    },
  ];

  writeJSON(FIZRUK_WORKOUTS_KEY, { schemaVersion: 1, workouts });

  // One recent measurement row so «Виміри» is populated.
  writeJSON(FIZRUK_MEASUREMENTS_KEY, [
    {
      id: shortId("demo_m", 1),
      at: toISO(daysAgo(1, 8, 0)),
      weight: 78.4,
      waist: 82,
      chest: 100,
    },
  ]);
}
