/**
 * Регресійний корпус верифікатора чисел: реальні відповіді моделей разом із
 * «поданим», яке вони бачили. Джерела:
 *
 *   1. `docs/work/specs/planning/model-eval-2026-08-25.md` - відповіді
 *      `-real` і baseline пайплайнів `chat`/`analysis` (`evalDocAnswers.ts`),
 *      вхід відновлено з `pipelines.finance.ts` (`evalDocScenarios.ts`);
 *   2. касети стенду вибору інструментів (`cassetteAnswers.ts`).
 *
 * Номери рядків кожного випадку - у полі `source` і в самих файлах даних.
 */

import { DATA_BLOCK } from "../../toolEval/dataBlock.js";
import { CASSETTE_ANSWERS, CASSETTE_DIR } from "./cassetteAnswers.js";
import { EVAL_DOC_ANSWERS, EVAL_DOC_FILE } from "./evalDocAnswers.js";
import { EVAL_DOC_SCENARIOS } from "./evalDocScenarios.js";
import type { RealCase } from "./types.js";

function evalDocCases(): RealCase[] {
  return EVAL_DOC_ANSWERS.map((a) => {
    const scenario = EVAL_DOC_SCENARIOS[a.scenario];
    if (!scenario) throw new Error(`Немає сценарію ${a.scenario}`);
    return {
      id: `eval-L${a.lines[0]}`,
      source: `${EVAL_DOC_FILE}:${a.lines.join(",")}`,
      occurrences: a.lines.length,
      answer: a.answer,
      given: {
        userMessages: [scenario.question],
        toolResults: [
          `<tool_output tool="${scenario.tool}">${scenario.output}</tool_output>`,
        ],
      },
    };
  });
}

function cassetteCases(): RealCase[] {
  return CASSETTE_ANSWERS.map((a) => ({
    id: `cassette-L${a.textLine}-${a.file.startsWith("injections") ? "inj" : "main"}`,
    source: `${CASSETTE_DIR}${a.file}:${a.textLine}`,
    occurrences: 1,
    answer: a.answer,
    given: {
      contexts: [DATA_BLOCK],
      userMessages: [a.user],
      toolResults: a.fed === null ? [] : [a.fed],
    },
  }));
}

export const EVAL_DOC_CASES: readonly RealCase[] = evalDocCases();
export const CASSETTE_CASES: readonly RealCase[] = cassetteCases();
export const REAL_CASES: readonly RealCase[] = [
  ...EVAL_DOC_CASES,
  ...CASSETTE_CASES,
];

/** Кейс за id: для іменованих перевірок на конкретних відповідях. */
export function realCase(id: string): RealCase {
  const found = REAL_CASES.find((c) => c.id === id);
  if (!found) throw new Error(`Немає кейса ${id}`);
  return found;
}
