/**
 * Built-in Fizruk training programs.
 *
 * Strictly-typed canonical source — `lib/trainingPrograms.ts` re-exports
 * these symbols for backwards compatibility with the web module while
 * the mobile port consumes the strict types directly.
 *
 * Exercise IDs correspond to entries in `data/exercises.gymup.json`.
 * `progressionKg` — kg to add per session for compound lifts.
 */

import type { TrainingProgramDef } from "./types.js";

export const PROGRAM_CATALOGUE: readonly TrainingProgramDef[] = [
  {
    id: "ppl",
    name: "Push Pull Legs",
    description:
      "Класична 6-денна програма. Push (груди/плечі/трицепс), Pull (спина/біцепс), Legs (ноги/сідниці). Відмінно для середнього рівня.",
    days: 6,
    durationWeeks: 8,
    schedule: [
      { day: 1, sessionKey: "push", name: "Push: Груди, плечі, трицепс" },
      { day: 2, sessionKey: "pull", name: "Pull: Спина, біцепс" },
      { day: 3, sessionKey: "legs", name: "Legs: Ноги, сідниці" },
      { day: 4, sessionKey: "push", name: "Push: Груди, плечі, трицепс" },
      { day: 5, sessionKey: "pull", name: "Pull: Спина, біцепс" },
      { day: 6, sessionKey: "legs", name: "Legs: Ноги, сідниці" },
    ],
    sessions: {
      push: {
        name: "Push Day",
        exerciseIds: [
          "bench_press_barbell",
          "overhead_press_barbell",
          "incline_bench_press",
          "lateral_raise",
          "tricep_pushdown",
          "overhead_tricep_extension",
        ],
        progressionKg: 2.5,
        defaultRestSec: 90,
      },
      pull: {
        name: "Pull Day",
        exerciseIds: [
          "deadlift",
          "pullup",
          "barbell_row",
          "cable_face_pull",
          "bicep_curl_barbell",
          "hammer_curl",
        ],
        progressionKg: 2.5,
        defaultRestSec: 90,
      },
      legs: {
        name: "Leg Day",
        exerciseIds: [
          "squat_barbell",
          "romanian_deadlift",
          "leg_press",
          "leg_curl",
          "leg_extension",
          "calf_raise_standing",
        ],
        progressionKg: 5,
        defaultRestSec: 120,
      },
    },
  },
  {
    id: "upper_lower",
    name: "Upper / Lower",
    description:
      "4-денна програма: два тренування на верх тіла та два на низ. Оптимальна частота для кожної групи. Підходить для початківців та середнього рівня.",
    days: 4,
    durationWeeks: 8,
    schedule: [
      { day: 1, sessionKey: "upper_a", name: "Upper A: Верх тіла (сила)" },
      { day: 2, sessionKey: "lower_a", name: "Lower A: Низ тіла (сила)" },
      { day: 4, sessionKey: "upper_b", name: "Upper B: Верх тіла (обʼєм)" },
      { day: 5, sessionKey: "lower_b", name: "Lower B: Низ тіла (обʼєм)" },
    ],
    sessions: {
      upper_a: {
        name: "Upper A (сила)",
        exerciseIds: [
          "bench_press_barbell",
          "barbell_row",
          "overhead_press_barbell",
          "pullup",
          "bicep_curl_barbell",
          "tricep_pushdown",
        ],
        progressionKg: 2.5,
        defaultRestSec: 90,
      },
      lower_a: {
        name: "Lower A (сила)",
        exerciseIds: [
          "squat_barbell",
          "romanian_deadlift",
          "leg_press",
          "leg_curl",
          "calf_raise_standing",
        ],
        progressionKg: 5,
        defaultRestSec: 120,
      },
      upper_b: {
        name: "Upper B (обʼєм)",
        exerciseIds: [
          "incline_bench_press",
          "cable_seated_row",
          "lateral_raise",
          "cable_face_pull",
          "bicep_curl_dumbbell",
          "overhead_tricep_extension",
        ],
        progressionKg: 2.5,
        defaultRestSec: 75,
      },
      lower_b: {
        name: "Lower B (обʼєм)",
        exerciseIds: [
          "deadlift",
          "leg_press",
          "leg_extension",
          "leg_curl",
          "calf_raise_standing",
        ],
        progressionKg: 5,
        defaultRestSec: 90,
      },
    },
  },
  {
    id: "full_body",
    name: "Full Body 3×тиждень",
    description:
      "Три повних тренування тіла на тиждень (Пн/Ср/Пт). Ідеально для початківців та тих, хто має обмежений час. Максимальна частота стимуляції мʼязів.",
    days: 3,
    durationWeeks: 6,
    schedule: [
      { day: 1, sessionKey: "full_a", name: "Full Body A" },
      { day: 3, sessionKey: "full_b", name: "Full Body B" },
      { day: 5, sessionKey: "full_a", name: "Full Body A" },
    ],
    sessions: {
      full_a: {
        name: "Full Body A",
        exerciseIds: [
          "squat_barbell",
          "bench_press_barbell",
          "barbell_row",
          "overhead_press_barbell",
          "deadlift",
        ],
        progressionKg: 2.5,
        defaultRestSec: 90,
      },
      full_b: {
        name: "Full Body B",
        exerciseIds: [
          "deadlift",
          "incline_bench_press",
          "pullup",
          "lateral_raise",
          "squat_barbell",
        ],
        progressionKg: 2.5,
        defaultRestSec: 90,
      },
    },
  },
  {
    id: "starting_strength",
    name: "Лінійна прогресія",
    description:
      "3-денна програма на основі базових багатосуглобових рухів. Щотренування +2.5 кг на штанзі. Найкраще для новачків: швидкий набір сили.",
    days: 3,
    durationWeeks: 12,
    schedule: [
      { day: 1, sessionKey: "ss_a", name: "Workout A" },
      { day: 3, sessionKey: "ss_b", name: "Workout B" },
      { day: 5, sessionKey: "ss_a", name: "Workout A" },
    ],
    sessions: {
      ss_a: {
        name: "Workout A",
        exerciseIds: ["squat_barbell", "bench_press_barbell", "deadlift"],
        progressionKg: 2.5,
        defaultRestSec: 180,
      },
      ss_b: {
        name: "Workout B",
        exerciseIds: ["squat_barbell", "overhead_press_barbell", "deadlift"],
        progressionKg: 2.5,
        defaultRestSec: 180,
      },
    },
  },
  {
    id: "home_bodyweight",
    name: "Дім без обладнання",
    description:
      "Три тренування на тиждень із власною вагою: жодної штанги, гантелей і тренажерів. Для тижнів без залу — вдома або на майданчику.",
    days: 3,
    durationWeeks: 6,
    schedule: [
      { day: 1, sessionKey: "home_push", name: "Дім A: жим і прес" },
      { day: 3, sessionKey: "home_pull", name: "Дім B: тяга і корпус" },
      { day: 5, sessionKey: "home_legs", name: "Дім C: ноги" },
    ],
    sessions: {
      home_push: {
        name: "Дім A",
        exerciseIds: [
          "pushup",
          "pike_pushup",
          "diamond_pushup",
          "decline_pushup",
          "plank",
          "hollow_hold",
        ],
        progressionKg: 0,
        defaultRestSec: 60,
      },
      home_pull: {
        name: "Дім B",
        exerciseIds: [
          "pullup",
          "inverted_row",
          "pullup_negative",
          "superman",
          "dead_hang",
          "bird_dog",
        ],
        progressionKg: 0,
        defaultRestSec: 75,
      },
      home_legs: {
        name: "Дім C",
        exerciseIds: [
          "squat_bodyweight",
          "split_squat",
          "glute_bridge",
          "nordic_curl",
          "calf_raise_stairs",
          "wall_sit",
        ],
        progressionKg: 0,
        defaultRestSec: 60,
      },
    },
  },
  {
    id: "two_day_minimum",
    name: "Мінімум: 2 дні",
    description:
      "Два повних тренування на тиждень — рівно поріг, за яким тижневий стрік тримається. Для тижнів, коли часу мало, а випадати з ритму не хочеться.",
    days: 2,
    durationWeeks: 8,
    schedule: [
      { day: 2, sessionKey: "min_a", name: "День A: верх у пріоритеті" },
      { day: 5, sessionKey: "min_b", name: "День B: низ у пріоритеті" },
    ],
    sessions: {
      min_a: {
        name: "День A",
        exerciseIds: [
          "bench_press_barbell",
          "barbell_row",
          "overhead_press_dumbbell",
          "romanian_deadlift",
          "plank",
        ],
        progressionKg: 2.5,
        defaultRestSec: 120,
      },
      min_b: {
        name: "День B",
        exerciseIds: [
          "squat_barbell",
          "pullup",
          "incline_dumbbell_press",
          "hip_thrust",
          "farmers_walk",
        ],
        progressionKg: 5,
        defaultRestSec: 120,
      },
    },
  },
  {
    id: "five_day_split",
    name: "5-денний спліт",
    description:
      "Класичний спліт по групах: груди, спина, ноги, плечі, руки. Для того, хто вже тримає ритм і має п'ять вечорів на тиждень.",
    days: 5,
    durationWeeks: 8,
    schedule: [
      { day: 1, sessionKey: "chest_day", name: "Груди" },
      { day: 2, sessionKey: "back_day", name: "Спина" },
      { day: 3, sessionKey: "legs_day", name: "Ноги" },
      { day: 5, sessionKey: "shoulders_day", name: "Плечі" },
      { day: 6, sessionKey: "arms_day", name: "Руки" },
    ],
    sessions: {
      chest_day: {
        name: "Груди",
        exerciseIds: [
          "bench_press_barbell",
          "incline_dumbbell_press",
          "dips_chest",
          "cable_crossover",
          "dumbbell_pullover",
        ],
        progressionKg: 2.5,
        defaultRestSec: 90,
      },
      back_day: {
        name: "Спина",
        exerciseIds: [
          "pullup",
          "pendlay_row",
          "cable_lat_pulldown",
          "chest_supported_row",
          "hyperextension",
        ],
        progressionKg: 2.5,
        defaultRestSec: 90,
      },
      legs_day: {
        name: "Ноги",
        exerciseIds: [
          "squat_barbell",
          "romanian_deadlift",
          "leg_press",
          "seated_leg_curl",
          "calf_raise_standing",
        ],
        progressionKg: 5,
        defaultRestSec: 120,
      },
      shoulders_day: {
        name: "Плечі",
        exerciseIds: [
          "overhead_press_barbell",
          "lateral_raise",
          "rear_delt_machine",
          "cable_face_pull",
          "shrugs",
        ],
        progressionKg: 2.5,
        defaultRestSec: 75,
      },
      arms_day: {
        name: "Руки",
        exerciseIds: [
          "ez_bar_curl",
          "close_grip_bench_press",
          "cable_rope_hammer_curl",
          "rope_pushdown",
          "wrist_curl",
        ],
        progressionKg: 2.5,
        defaultRestSec: 60,
      },
    },
  },
  {
    id: "strength_5x5",
    name: "Силовий 5×5",
    description:
      "Три дні на тиждень, по три базові рухи, п'ять підходів по п'ять повторень. Мало вправ, багато ваги — для тих, хто хоче саме сили.",
    days: 3,
    durationWeeks: 12,
    schedule: [
      { day: 1, sessionKey: "fivexfive_a", name: "5×5 A" },
      { day: 3, sessionKey: "fivexfive_b", name: "5×5 B" },
      { day: 5, sessionKey: "fivexfive_a", name: "5×5 A" },
    ],
    sessions: {
      fivexfive_a: {
        name: "5×5 A",
        exerciseIds: ["squat_barbell", "bench_press_barbell", "barbell_row"],
        progressionKg: 2.5,
        defaultRestSec: 180,
      },
      fivexfive_b: {
        name: "5×5 B",
        exerciseIds: ["squat_barbell", "overhead_press_barbell", "deadlift"],
        progressionKg: 2.5,
        defaultRestSec: 180,
      },
    },
  },
];

/**
 * Back-compat alias used by existing web consumers
 * (`import { BUILTIN_PROGRAMS } from "@sergeant/fizruk-domain"`).
 */
export const BUILTIN_PROGRAMS = PROGRAM_CATALOGUE;
