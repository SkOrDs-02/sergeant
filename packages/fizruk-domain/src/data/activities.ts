/**
 * Last validated: 2026-09-01
 * Status: Active
 *
 * Каталог занять для короткого запису «активність + тривалість».
 *
 * Другий вхід у журнал поруч із детальним: людина з групового заняття не
 * памʼятає підходи й повтори, вона памʼятає «силове, 45 хвилин». MET-числа
 * взяті з Compendium of Physical Activities - вони потрібні не заради
 * каталогу, а заради формули витрат (`computeKcalBurned`), яка без MET
 * вироджується в плоскі «ккал/хв» і бреше на краях ваги.
 *
 * Зони мʼязів лежать тут же, бо простий запис не має вправ, з яких модель
 * відновлення виводить навантаження: без зони Фізрук показав би «свіжий»
 * одразу після важкого заняття.
 */

// Каталог імпортується напряму, а не через `./index.js`: цей модуль сам
// реекспортується з індексу, тож похід за `MUSCLES_BY_PRIMARY_GROUP` туди
// замкнув би цикл - і зони порахувались би до ініціалізації мапи.
import exercisesCatalog from "./exercises.gymup.json";

const MUSCLES_BY_GROUP: Record<string, string[]> =
  (
    exercisesCatalog as {
      labels?: { musclesByPrimaryGroup?: Record<string, string[]> };
    }
  ).labels?.musclesByPrimaryGroup ?? {};

/** Категорія заняття - лише для групування у списку вибору. */
export type ActivityCategory = "strength" | "cardio" | "flexibility" | "group";

/** Зона тіла, яку навантажило заняття. */
export type ActivityMuscleZone = "upper" | "lower" | "full";

/** Рівень зусилля; множить і MET, і навантаження на відновлення. */
export type ActivityIntensity = "easy" | "normal" | "hard";

/** Запис каталогу занять. */
export interface ActivityDef {
  id: string;
  nameUk: string;
  met: number;
  category: ActivityCategory;
}

/**
 * Множники інтенсивності. До MET - заради ккал, до `durationSec` - заради
 * навантаження на відновлення (щоб не чіпати саму формулу `loadPointsForItem`).
 */
export const ACTIVITY_INTENSITY_MULTIPLIERS: Record<ActivityIntensity, number> =
  {
    easy: 0.8,
    normal: 1.0,
    hard: 1.25,
  };

export const ACTIVITY_CATEGORIES_UK: Record<ActivityCategory, string> = {
  strength: "Силове",
  cardio: "Кардіо",
  flexibility: "Гнучкість",
  group: "Групове",
};

export const ACTIVITY_INTENSITIES_UK: Record<ActivityIntensity, string> = {
  easy: "Легко",
  normal: "Середньо",
  hard: "Важко",
};

export const ACTIVITY_MUSCLE_ZONES_UK: Record<ActivityMuscleZone, string> = {
  upper: "Верх тіла",
  lower: "Низ тіла",
  full: "Все тіло",
};

/** Primary-групи каталогу вправ, з яких складається кожна зона. */
const ZONE_PRIMARY_GROUPS: Record<ActivityMuscleZone, string[]> = {
  upper: ["chest", "back", "shoulders", "biceps", "triceps", "forearms"],
  lower: ["quadriceps", "hamstrings", "calves", "glutes"],
  full: [
    "chest",
    "back",
    "shoulders",
    "biceps",
    "triceps",
    "forearms",
    "core",
    "quadriceps",
    "hamstrings",
    "calves",
    "glutes",
  ],
};

function musclesForGroups(groups: string[]): string[] {
  const out: string[] = [];
  for (const group of groups) {
    for (const muscle of MUSCLES_BY_GROUP[group] ?? []) {
      if (!out.includes(muscle)) out.push(muscle);
    }
  }
  return out;
}

/**
 * Мʼязи кожної зони. Будуються з `MUSCLES_BY_PRIMARY_GROUP`, а не пишуться
 * руками: два списки id розʼїхались би на першій же правці каталогу.
 */
export const ACTIVITY_MUSCLE_ZONE_MUSCLES: Record<
  ActivityMuscleZone,
  string[]
> = {
  upper: musclesForGroups(ZONE_PRIMARY_GROUPS.upper),
  lower: musclesForGroups(ZONE_PRIMARY_GROUPS.lower),
  full: musclesForGroups(ZONE_PRIMARY_GROUPS.full),
};

/**
 * Вбудований каталог. MET за Compendium of Physical Activities (Ainsworth
 * et al.); «Інше силове» / «Інше кардіо» - запасний вихід, щоб людина не
 * впиралась у відсутню позицію й не кидала запис.
 */
export const ACTIVITIES: ActivityDef[] = [
  // Силове
  {
    id: "strength_general",
    nameUk: "Силове тренування",
    met: 6.0,
    category: "strength",
  },
  {
    id: "strength_light",
    nameUk: "Силове, легке",
    met: 3.5,
    category: "strength",
  },
  {
    id: "strength_heavy",
    nameUk: "Силове, важке",
    met: 8.0,
    category: "strength",
  },
  {
    id: "circuit_training",
    nameUk: "Кругове тренування",
    met: 7.5,
    category: "strength",
  },
  { id: "crossfit", nameUk: "Кросфіт", met: 8.0, category: "strength" },
  {
    id: "bodyweight_training",
    nameUk: "Вправи з власною вагою",
    met: 5.0,
    category: "strength",
  },
  { id: "kettlebell", nameUk: "Гирі", met: 8.0, category: "strength" },
  {
    id: "powerlifting",
    nameUk: "Пауерліфтинг",
    met: 6.0,
    category: "strength",
  },
  { id: "calisthenics", nameUk: "Калістеніка", met: 6.5, category: "strength" },
  {
    id: "strength_other",
    nameUk: "Інше силове",
    met: 5.0,
    category: "strength",
  },

  // Кардіо
  {
    id: "walking_slow",
    nameUk: "Ходьба, спокійна",
    met: 3.0,
    category: "cardio",
  },
  {
    id: "walking_brisk",
    nameUk: "Ходьба, швидка",
    met: 4.3,
    category: "cardio",
  },
  {
    id: "hiking",
    nameUk: "Похід, пересічена місцевість",
    met: 6.0,
    category: "cardio",
  },
  {
    id: "running_easy",
    nameUk: "Біг, легкий темп",
    met: 8.3,
    category: "cardio",
  },
  {
    id: "running_moderate",
    nameUk: "Біг, середній темп",
    met: 9.8,
    category: "cardio",
  },
  {
    id: "running_fast",
    nameUk: "Біг, швидкий темп",
    met: 11.5,
    category: "cardio",
  },
  { id: "treadmill", nameUk: "Бігова доріжка", met: 8.0, category: "cardio" },
  {
    id: "cycling_leisure",
    nameUk: "Велосипед, прогулянковий",
    met: 5.8,
    category: "cardio",
  },
  {
    id: "cycling_sport",
    nameUk: "Велосипед, спортивний",
    met: 10.0,
    category: "cardio",
  },
  {
    id: "cycling_indoor",
    nameUk: "Велотренажер",
    met: 7.0,
    category: "cardio",
  },
  {
    id: "elliptical",
    nameUk: "Еліптичний тренажер",
    met: 5.0,
    category: "cardio",
  },
  {
    id: "rowing_machine",
    nameUk: "Гребний тренажер",
    met: 7.0,
    category: "cardio",
  },
  {
    id: "stair_climbing",
    nameUk: "Сходи / степер",
    met: 8.8,
    category: "cardio",
  },
  {
    id: "swimming_leisure",
    nameUk: "Плавання, спокійне",
    met: 6.0,
    category: "cardio",
  },
  {
    id: "swimming_laps",
    nameUk: "Плавання, доріжки",
    met: 8.3,
    category: "cardio",
  },
  { id: "jump_rope", nameUk: "Скакалка", met: 11.0, category: "cardio" },
  { id: "hiit", nameUk: "Інтервальне HIIT", met: 8.0, category: "cardio" },
  { id: "skiing", nameUk: "Лижі", met: 7.0, category: "cardio" },
  { id: "skating", nameUk: "Ковзани / ролики", met: 7.0, category: "cardio" },
  { id: "cardio_other", nameUk: "Інше кардіо", met: 6.0, category: "cardio" },

  // Гнучкість
  { id: "stretching", nameUk: "Розтяжка", met: 2.3, category: "flexibility" },
  { id: "yoga", nameUk: "Йога", met: 3.0, category: "flexibility" },
  { id: "yoga_power", nameUk: "Пауер-йога", met: 4.0, category: "flexibility" },
  { id: "pilates", nameUk: "Пілатес", met: 3.0, category: "flexibility" },
  { id: "mobility", nameUk: "Мобіліті", met: 2.8, category: "flexibility" },
  {
    id: "foam_rolling",
    nameUk: "Пінний ролик / міофасція",
    met: 2.3,
    category: "flexibility",
  },
  {
    id: "breathing",
    nameUk: "Дихальні практики",
    met: 1.8,
    category: "flexibility",
  },

  // Групове
  { id: "body_pump", nameUk: "Body Pump", met: 6.0, category: "group" },
  { id: "aerobics", nameUk: "Аеробіка", met: 6.5, category: "group" },
  { id: "step_aerobics", nameUk: "Степ-аеробіка", met: 7.5, category: "group" },
  { id: "zumba", nameUk: "Зумба", met: 6.5, category: "group" },
  { id: "dance", nameUk: "Танці", met: 5.0, category: "group" },
  { id: "spinning", nameUk: "Сайкл / спінінг", met: 8.5, category: "group" },
  { id: "boxing_fitness", nameUk: "Фітнес-бокс", met: 7.8, category: "group" },
  { id: "martial_arts", nameUk: "Єдиноборства", met: 10.3, category: "group" },
  {
    id: "functional_group",
    nameUk: "Функціональне групове",
    met: 7.0,
    category: "group",
  },
  { id: "aqua_aerobics", nameUk: "Аквааеробіка", met: 5.3, category: "group" },
  { id: "tabata", nameUk: "Табата", met: 8.0, category: "group" },
  { id: "football", nameUk: "Футбол", met: 7.0, category: "group" },
  { id: "basketball", nameUk: "Баскетбол", met: 6.5, category: "group" },
  { id: "volleyball", nameUk: "Волейбол", met: 4.0, category: "group" },
  { id: "tennis", nameUk: "Теніс", met: 7.3, category: "group" },
  { id: "badminton", nameUk: "Бадмінтон", met: 5.5, category: "group" },
  { id: "climbing", nameUk: "Скелелазіння", met: 8.0, category: "group" },
];

/** Пошук заняття за id. */
export function findActivityById(
  id: string,
  pool: ActivityDef[] = ACTIVITIES,
): ActivityDef | null {
  if (!id) return null;
  return pool.find((a) => a.id === id) ?? null;
}

/** MET заняття; `null`, якщо такого id немає. */
export function activityMet(
  id: string,
  pool: ActivityDef[] = ACTIVITIES,
): number | null {
  return findActivityById(id, pool)?.met ?? null;
}

/**
 * Злиття користувацьких занять із вбудованими - той самий контракт, що
 * `mergeExerciseCatalog`: свій запис із наявним id перекриває вбудований,
 * решта дописується в кінець.
 */
export function mergeActivityCatalog(
  custom: ActivityDef[] | null | undefined,
  base: ActivityDef[] = ACTIVITIES,
): ActivityDef[] {
  const list = Array.isArray(custom) ? custom.filter((a) => a?.id) : [];
  if (list.length === 0) return base;
  const byId = new Map(list.map((a) => [a.id, a]));
  const merged = base.map((a) => byId.get(a.id) ?? a);
  const baseIds = new Set(base.map((a) => a.id));
  return [...merged, ...list.filter((a) => !baseIds.has(a.id))];
}
