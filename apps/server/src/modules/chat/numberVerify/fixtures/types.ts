/**
 * Типи фікстур регресійного корпусу верифікатора чисел.
 *
 * Фікстури лише з реальних відповідей моделей (ADR-0097: «виконавець збирає
 * фікстури з живих логів, не вигадує їх»). Жодної відповіді тут не написано
 * вручну: кожна має посилання на файл і рядок, звідки її взято.
 */

import type { GivenSources } from "../givenCorpus.js";

/** Питання й результат інструмента, які бачила модель на стенді. */
export interface EvalScenario {
  /** `файл:рядки` у `pipelines.finance.ts`. */
  source: string;
  question: string;
  tool: string;
  output: string;
}

export interface EvalDocAnswer {
  scenario: string;
  /** Підпис кандидата в звіті стенду (`premium-real`, `baseline`...). */
  candidate: string;
  /** Рядки першого символу відповіді в документі; кілька, якщо текст повторено. */
  lines: readonly number[];
  answer: string;
}

export interface CassetteAnswer {
  /** Файл касети в `__fixtures__/number-verify/cassettes-2026-10-01/`. */
  file: string;
  caseName: string;
  turn: number;
  /** Рядок `"text": ...` у файлі касети. */
  textLine: number;
  /** Рядок `"fedResult": ...`, якщо хід другий. */
  fedLine: number | null;
  /** `файл:рядок` кейса з питанням користувача. */
  userSrc: string;
  user: string;
  fed: string | null;
  answer: string;
}

/** Один випадок корпусу: відповідь, її «подане» й звідки вона. */
export interface RealCase {
  id: string;
  /** `файл:рядок` першоджерела відповіді. */
  source: string;
  /** Скільки разів відповідь трапилась у джерелі (дублі зведено). */
  occurrences: number;
  answer: string;
  given: GivenSources;
}
