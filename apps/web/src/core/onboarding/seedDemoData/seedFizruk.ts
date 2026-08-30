import {
  FIZRUK_MEASUREMENTS_KEY,
  FIZRUK_PUSHUPS_SEED_KEY,
  FIZRUK_TEMPLATES_KEY,
  FIZRUK_WORKOUTS_KEY,
} from "./keys";
import { dateKey, daysAgo, shortId, toISO, writeJSON } from "./utils";

/**
 * AI-DANGER: `musclesPrimary` / `musclesSecondary` мусять містити ДОМЕННІ
 * ключі — рівно ті, які розуміє `mapDomainMuscleToAtlas` у
 * `packages/fizruk-domain/src/data/bodyAtlas.ts`: `pectoralis_major`, а не
 * `chest`; `latissimus_dorsi`, а не `back`; `front_deltoid`, а не
 * `shoulders`. Невідомий ключ мапиться в `null`, тобто мовчки випадає з
 * силуету «Моє тіло» — і спливає сирим англійським рядком у списку
 * «Почекати» («Почекати: Квадрицепс, back, shoulders»). Виявлено
 * 2026-08-08, щойно демо знову почало доїжджати до модуля (L-8): доти
 * ці дані просто ніде не рендерились.
 */
export function seedFizruk(): void {
  // A single finished workout 1 day ago — enough for the calendar
  // streak, the recovery map, and "останнє тренування" card to light
  // up. Shape mirrors what `FinishWorkoutSheet` persists: a workout
  // item per exercise with `type: "strength"` and populated `sets`.
  //
  // Kept inside `daysAgo(1)` (not `daysAgo(2)`) so the Hub Reports
  // "week" window (Mon–Sun, see `hubReports.aggregation.ts`) always
  // contains at least one seeded workout: early in the week, anything
  // ≥2 days ago can fall into the *previous* ISO week and leave the
  // Fitness card empty even though the demo payload has data.
  const startedAt = daysAgo(1, 18, 30);
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
          musclesPrimary: ["pectoralis_major"],
          musclesSecondary: ["triceps", "front_deltoid"],
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
          musclesPrimary: ["latissimus_dorsi", "hamstrings"],
          musclesSecondary: ["gluteus_maximus", "forearms"],
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
          musclesPrimary: ["latissimus_dorsi", "biceps"],
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
          musclesPrimary: ["front_deltoid"],
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

  // One recent measurement row so «Заміри» is populated.
  //
  // AI-DANGER: ці поля мають писатися рівно тими іменами, які SQLite
  // dual-write адаптер (`upsertMeasurement` у `sqliteWriter/adapter.ts`)
  // читає через `m["weightKg"]`/`m["waistCm"]`/`m["chestCm"]` — НЕ
  // `weight`/`waist`/`chest`. Це НЕ те саме, що набір id-шників
  // `MEASURE_FIELDS` (`hooks/useMeasurements.ts`): адаптер там також читає
  // `bicepCm`, якого серед `MEASURE_FIELDS` немає (форма пише
  // `bicepLCm`/`bicepRCm`, і саме `extractMeasurementSnapshots`
  // (`fizrukDualWriteState.ts`) коалесує їх у `bicepCm` для адаптера), а
  // частина `MEASURE_FIELDS` (`bodyFatPct`/`neckCm`/`forearm*`/`thigh*`/
  // `calf*`) не має відповідної колонки в `fizruk_measurements`, і pipeline
  // мовчки її відкидає. Невідомий ключ мовчки лягає в базу як NULL
  // (`toRealOrNull(undefined) === null`) — рядок замірів все одно
  // зʼявляється в SQLite (`id`/`measured_at` не-null), просто з
  // порожніми полями: дата без жодного значення, а не порожня секція
  // (L-21, знайдено 2026-08-08).
  writeJSON(FIZRUK_MEASUREMENTS_KEY, [
    {
      id: shortId("demo_m", 1),
      at: toISO(daysAgo(1, 8, 0)),
      weightKg: 78.4,
      waistCm: 82,
      chestCm: 100,
    },
  ]);

  // Два шаблони — рівно щоб «Із шаблону» на хоумі відкривало не порожнечу.
  // Вправи ті самі, що у засіяних тренуваннях, тож демо виглядає як один
  // послідовний план, а не як набір неповʼязаних прикладів.
  // 14 днів віджимань — лічильник «Легкої активності» на сторінці
  // Прогрес. Історично сіявся routine-сідом у `pushupsByDate`; переїхав
  // сюди разом із власністю даних (канон routine.md §10, 2026-08-30).
  const pushups: Record<string, number> = {};
  const pushupPlan = [25, 30, 28, 35, 40, 30, 32, 45, 50, 42, 38, 40, 55, 48];
  for (const [i, count] of pushupPlan.entries()) {
    pushups[dateKey(daysAgo(i))] = count;
  }
  writeJSON(FIZRUK_PUSHUPS_SEED_KEY, pushups);

  writeJSON(FIZRUK_TEMPLATES_KEY, [
    {
      id: shortId("demo_tpl", 1),
      name: "Ноги і спина",
      exerciseIds: ["squat", "deadlift"],
      groups: [],
      updatedAt: toISO(daysAgo(5, 19, 50)),
      lastUsedAt: toISO(daysAgo(1, 18, 30)),
    },
    {
      id: shortId("demo_tpl", 2),
      name: "Верх тіла",
      exerciseIds: ["bench_press", "ohp", "pullup"],
      groups: [],
      updatedAt: toISO(daysAgo(5, 19, 50)),
    },
  ]);
}
