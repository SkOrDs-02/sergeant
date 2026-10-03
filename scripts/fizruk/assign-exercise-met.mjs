#!/usr/bin/env node
/**
 * Last validated: 2026-09-01
 * Status: Active
 *
 * Проставляє `met` кожній вправі вбудованого каталогу
 * (`packages/fizruk-domain/src/data/exercises.gymup.json`), щоб детальні
 * тренування теж давали оцінку витрат, а не лише короткі записи занять.
 *
 * Число виводиться з `primaryGroup` (кардіо високо, ізоляція низько) з
 * поправкою на обладнання: штанга й тренажер тягнуть більше за резинку.
 * Це оцінка порядку величини, а не вимір - точкові винятки правляться
 * руками після прогону, і саме тому за замовчуванням скрипт заповнює лише
 * ПОРОЖНІ поля. `--force` перезаписує все (і стирає ручні правки).
 *
 * Запуск: `node scripts/fizruk/assign-exercise-met.mjs [--force]`
 * Після прогону: `npx prettier --write <шлях до JSON>`.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const CATALOG_PATH = resolve(
  HERE,
  "../../packages/fizruk-domain/src/data/exercises.gymup.json",
);

/** Базовий MET за основною групою. */
const BASE_BY_PRIMARY_GROUP = {
  cardio: 8.0,
  full_body: 6.0,
  chest: 5.0,
  back: 5.0,
  quadriceps: 5.0,
  hamstrings: 5.0,
  glutes: 5.0,
  shoulders: 4.5,
  core: 3.8,
  biceps: 3.5,
  triceps: 3.5,
  forearms: 3.0,
  calves: 3.3,
};
const DEFAULT_BASE = 4.5;

/** Поправка за обладнанням; береться максимальна серед вказаних. */
const EQUIPMENT_DELTA = {
  barbell: 1.0,
  kettlebell: 1.0,
  machine: 0.5,
  dumbbell: 0.5,
  cable: 0.3,
  bodyweight: 0,
  bench: 0,
  other: 0,
  band: -0.5,
};

const MET_MIN = 2.0;
const MET_MAX = 12.0;

export function metForExercise(exercise) {
  const base = BASE_BY_PRIMARY_GROUP[exercise?.primaryGroup] ?? DEFAULT_BASE;
  const equipment = Array.isArray(exercise?.equipment)
    ? exercise.equipment
    : [];
  const deltas = equipment
    .map((eq) => EQUIPMENT_DELTA[eq])
    .filter((d) => typeof d === "number");
  const delta = deltas.length > 0 ? Math.max(...deltas) : 0;
  const met = Math.min(MET_MAX, Math.max(MET_MIN, base + delta));
  return Math.round(met * 10) / 10;
}

function main() {
  const force = process.argv.includes("--force");
  const catalog = JSON.parse(readFileSync(CATALOG_PATH, "utf8"));
  const exercises = Array.isArray(catalog.exercises) ? catalog.exercises : [];
  let written = 0;

  catalog.exercises = exercises.map((exercise) => {
    const hasMet =
      typeof exercise.met === "number" &&
      Number.isFinite(exercise.met) &&
      exercise.met > 0;
    if (hasMet && !force) return exercise;
    written += 1;
    // Порядок ключів: `met` одразу після `primaryGroup` - там, де його
    // шукає око, коли читає групу.
    const next = {};
    for (const [key, value] of Object.entries(exercise)) {
      next[key] = value;
      if (key === "primaryGroup") next.met = metForExercise(exercise);
    }
    if (!("met" in next)) next.met = metForExercise(exercise);
    return next;
  });

  writeFileSync(CATALOG_PATH, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
  console.log(
    `met проставлено: ${written} з ${exercises.length} вправ${force ? " (--force)" : ""}`,
  );
}

main();
