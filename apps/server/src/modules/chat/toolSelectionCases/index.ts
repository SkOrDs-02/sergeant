/**
 * Барель кейсів стенду вибору інструментів.
 *
 * Кейси розкладені по доменах, а не звалені в один масив, з двох причин:
 * доменні файли можна писати незалежно один від одного, і при падінні
 * стенду одразу видно, який шар промахується.
 *
 * Повнота реєстру перевіряється механічно - `toolCoverage.test.ts` вимагає,
 * щоб кожен інструмент із `TOOLS` був названий бодай в одному `accept`.
 * Це не міряє якість вибору; це не дає додати інструмент і забути кейс.
 */

import type { ToolCase } from "./types.js";
import { BASELINE_CASES, IMPLICIT_FACT_CASES } from "./baseline.js";
import { FINYK_CASES } from "./finyk.js";
import { FIZRUK_CASES } from "./fizruk.js";
import { NUTRITION_CASES } from "./nutrition.js";
import { ROUTINE_CASES } from "./routine.js";
import { CROSS_MODULE_CASES } from "./crossModule.js";

export type { ToolCase } from "./types.js";
export { IMPLICIT_FACT_CASES } from "./baseline.js";

/** Усі кейси стенду, крім блоку неявної памʼяті (він рахується окремо). */
export const ALL_CASES: ToolCase[] = [
  ...BASELINE_CASES,
  ...FINYK_CASES,
  ...FIZRUK_CASES,
  ...NUTRITION_CASES,
  ...ROUTINE_CASES,
  ...CROSS_MODULE_CASES,
];

/** Кожен інструмент, названий бодай в одному кейсі. */
export function coveredToolNames(): Set<string> {
  const covered = new Set<string>();
  for (const c of [...ALL_CASES, ...IMPLICIT_FACT_CASES]) {
    for (const name of c.accept) covered.add(name);
  }
  return covered;
}
