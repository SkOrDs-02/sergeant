/**
 * Гейт на самопояснювальність суддів стенду.
 *
 * WHY. Судді складені («≥2 рецепти І без арахісу», «≥3 позиції І помідор
 * нормалізовано»), а колонка у звіті була булева. Кейс «алерген у
 * виключеннях» показував ❌ там, де арахісу в відповіді не було взагалі:
 * модель просто віддала один рецепт. Вісім таких випадків прочиталися як
 * брехня судді й коштували ручного перечитування сирих відповідей.
 *
 * Тест фіксує інваріант: складений суддя на провалі зобовʼязаний віддати
 * РЯДОК із причиною, а не голий `false`. Голий `false` знову зробить звіт
 * неоднозначним.
 */

import { describe, expect, it } from "vitest";

import { FINANCE_PIPELINES } from "../../scripts/eval/pipelines.finance.js";
import { NUTRITION_PIPELINES } from "../../scripts/eval/pipelines.nutrition.js";
import { VISION_PIPELINES } from "../../scripts/eval/vision.js";
import type { Pipeline } from "../../scripts/eval/types.js";

/**
 * `classify` і `mono` судяться одним структурним предикатом (`parseCategory`,
 * `parseBatchResponse`), і назва кейса вже каже, що саме не зійшлося. Складати
 * їм рядок нема з чого — виняток свідомий, не забутий.
 */
const SINGLE_PREDICATE_PIPELINES = new Set(["classify", "mono"]);

/** Відповідь, що парситься як JSON, але провалює будь-яку предметну перевірку. */
const EMPTY_JSON =
  '{"items":[],"recipes":[],"meals":[],"days":[],"categories":[]}';

const casesOf = (pipelines: Pipeline[]) =>
  pipelines
    .filter((p) => !SINGLE_PREDICATE_PIPELINES.has(p.key))
    .flatMap((p) =>
      p.cases.map((c) => ({
        id: `${p.key} / ${c.name}`,
        judge: c.judge ?? p.judge,
      })),
    );

describe("судді стенду пояснюють провал", () => {
  // Зорові кейси теж: `photoResult(EMPTY_JSON)` віддає нормалізований
  // порожній результат, тож предметна перевірка так само провалюється.
  const all = [
    ...casesOf(FINANCE_PIPELINES),
    ...casesOf(NUTRITION_PIPELINES),
    ...casesOf(VISION_PIPELINES),
  ];

  it("покриває всі складені кейси стенду", () => {
    expect(all.length).toBeGreaterThanOrEqual(35);
  });

  for (const { id, judge } of all) {
    it(`${id} — провал із причиною, не голий false`, () => {
      const verdict = judge(EMPTY_JSON);
      if (verdict === true) return; // кейс, який порожнеча влаштовує (не буває, але не падаємо)
      expect(typeof verdict, `${id} віддав голий false`).toBe("string");
      expect(String(verdict).length).toBeGreaterThan(3);
    });
  }
});

/**
 * Кандидати не діляться масивом між пайплайнами.
 *
 * `--extra` робить `pipeline.candidates.push(...)`. Один спільний інстанс
 * означав, що шість прапорців `--extra` додають шість копій кожного кандидата
 * в кожен пайплайн — прогін у 6 разів довший і дорожчий за задуманий.
 */
describe("кандидати пайплайнів не діляться масивом", () => {
  it("кожен пайплайн має власний інстанс", () => {
    const all = [
      ...FINANCE_PIPELINES,
      ...NUTRITION_PIPELINES,
      ...VISION_PIPELINES,
    ];
    const seen = new Set<unknown>();
    for (const p of all) {
      expect(seen.has(p.candidates), `${p.key} ділить масив кандидатів`).toBe(
        false,
      );
      seen.add(p.candidates);
    }
  });
});
