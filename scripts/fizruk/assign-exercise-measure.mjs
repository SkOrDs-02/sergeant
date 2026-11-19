#!/usr/bin/env node
/**
 * Last validated: 2026-11-18
 * Status: Active
 *
 * Проставляє `measure` (тип виміру за замовчуванням) кожній вправі
 * вбудованого каталогу (`packages/fizruk-domain/src/data/exercises.gymup.json`).
 * Спека: `docs/work/specs/fizruk-exercise-measure-type.md`.
 *
 * Дефолти — доручення founder-а 2026-11-18 («зробити типу під вправи наші
 * дефолти але можна змінювати», § 11.9 розбору), людина міняє тип у сесії.
 * Правила, зверху вниз:
 *   1. Явні винятки `BY_ID` (утримання, переноски, кардіо без дистанції).
 *   2. `cardio` → дистанція × час (чинна евристика вебу до цієї фічі).
 *   3. Обладнання лише `bodyweight` → лише повтори.
 *   4. Решта → вага × повтори.
 * Переноски міряються часом, а не дистанцією: план програм уже задає їм
 * 30–60 с на підхід (`PROGRAM_TIMED_SEC_RANGES.carry`).
 *
 * За замовчуванням заповнює лише ПОРОЖНІ поля, `--force` перезаписує все.
 * Запуск: `node scripts/fizruk/assign-exercise-measure.mjs [--force]`
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

const BY_ID = {
  plank: "time",
  side_plank: "time",
  hollow_hold: "time",
  wall_sit: "time",
  dead_hang: "time",
  towel_hang: "time",
  jump_rope: "time",
  battle_ropes: "time",
  stairclimber: "time",
  farmers_walk: "weight_time",
  farmers_hold: "weight_time",
  sled_push: "weight_distance",
  burpee: "reps",
  box_jump: "reps",
};

export function measureFor(ex) {
  if (BY_ID[ex.id]) return BY_ID[ex.id];
  if (ex.primaryGroup === "cardio") return "distance_time";
  const eq = Array.isArray(ex.equipment) ? ex.equipment : [];
  if (eq.length === 1 && eq[0] === "bodyweight") return "reps";
  return "weight_reps";
}

/** Вставляє `measure` одразу після `met` (або в кінець), не міняючи решту порядку. */
function withMeasure(ex, measure) {
  const out = {};
  let placed = false;
  for (const [k, v] of Object.entries(ex)) {
    if (k === "measure") continue;
    out[k] = v;
    if (k === "met") {
      out.measure = measure;
      placed = true;
    }
  }
  if (!placed) out.measure = measure;
  return out;
}

function main() {
  const force = process.argv.includes("--force");
  const catalog = JSON.parse(readFileSync(CATALOG_PATH, "utf8"));
  let changed = 0;
  catalog.exercises = catalog.exercises.map((ex) => {
    if (ex.measure && !force) return ex;
    changed += 1;
    return withMeasure(ex, measureFor(ex));
  });
  writeFileSync(CATALOG_PATH, `${JSON.stringify(catalog, null, 2)}\n`);
  console.log(`measure: оновлено ${changed} з ${catalog.exercises.length}`);
}

main();
