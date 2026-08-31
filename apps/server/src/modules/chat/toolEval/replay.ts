/**
 * Відтворення касети: оцінювання записаного прогону без жодного запиту назовні.
 *
 * Це і є блокувальний шар. Він міряє НЕ модель - модель у касеті зафіксована -
 * а код навколо неї: системний промпт, схеми інструментів, самі судді. Якщо
 * тут почервоніло при валідному маніфесті, зламали ми, а не постачальник.
 */

import { SYSTEM_PREFIX } from "../tools.js";
import type { ToolCase } from "../toolSelectionCases/index.js";
import { DATA_BLOCK } from "./dataBlock.js";
import type { Cassette, RecordedCase } from "./cassette.js";
import {
  hallucinatedIds,
  pickedFrom,
  reachedFinalTurn,
  scoreCase,
  scoreTurn,
} from "./scoring.js";
import {
  expectedArgViolations,
  schemaViolations,
  type ArgViolation,
} from "./argChecks.js";

export interface ReplayedCase {
  name: string;
  /** Вердикт по кожному ходу: перший - `scoreCase`, далі - очікування ланцюжка. */
  turnHits: boolean[];
  /** Виклики моделі по ходах. */
  pickedByTurn: string[][];
  /** Вигадані id по всіх ходах разом. */
  hallucinated: string[];
  /**
   * Порушення аргументів по всіх ходах разом.
   *
   * Навмисно НЕ входять у `correct`: вибір інструмента і якість аргументів -
   * два різні виміри, і злиття їх в одне число зробило б неможливим сказати,
   * що саме просіло. Гейт дивиться на них окремими порогами.
   */
  argViolations: ArgViolation[];
  /** Модель дійшла до цільового виклику раніше, ніж сценарій дозволяв. */
  shortCircuited: boolean;
  correct: boolean;
  error?: string;
}

export interface ReplaySummary {
  total: number;
  correct: number;
  invented: number;
  errors: number;
  multiTurnCases: number;
  multiTurnCorrect: number;
  /** Кейси, у яких є бодай одне порушення аргументів. */
  argFailedCases: number;
  /** Порушення по типах - щоб просідання було видно за причиною, а не сумою. */
  argByKind: Record<string, number>;
}

/**
 * Оцінити один записаний кейс.
 *
 * Контекст накопичується по ходах: кожен відданий `tool_result` доїжджає в
 * haystack перевірки вигаданих id. Інакше id, чесно взятий із результату
 * першого ходу, на другому рахувався б як вигаданий - тобто перевірка карала б
 * рівно за ту поведінку, якої від моделі домагаються.
 */
export function replayCase(
  toolCase: ToolCase,
  recorded: RecordedCase,
): ReplayedCase {
  const expectedTurns = toolCase.turns ?? [];
  let context = `${SYSTEM_PREFIX}${DATA_BLOCK}\n${toolCase.user}`;
  const turnHits: boolean[] = [];
  const pickedByTurn: string[][] = [];
  const hallucinated: string[] = [];
  const argViolations: ArgViolation[] = [];
  let shortCircuited = false;

  recorded.turns.forEach((turn, index) => {
    if (turn.fedResult !== null) context += `\n${turn.fedResult}`;
    const picked = pickedFrom(turn.blocks);
    pickedByTurn.push(picked);
    hallucinated.push(...hallucinatedIds(turn.blocks, context));
    argViolations.push(
      ...schemaViolations(turn.blocks),
      ...expectedArgViolations(toolCase, turn.blocks),
    );
    const expected = expectedTurns[index - 1];
    turnHits.push(
      index === 0
        ? scoreCase(toolCase, picked)
        : scoreTurn(expected?.accept ?? [], picked),
    );
    if (index === 0 && expectedTurns.length > 0) {
      shortCircuited = reachedFinalTurn(toolCase, picked);
    }
  });

  // Обірваний ланцюжок - це провал ненаписаних ходів, а не їх відсутність:
  // модель перестала викликати інструменти там, де сценарій ще чекав дії.
  // Виняток - коротке замикання: цільового виклику досягнуто раніше.
  const expectedLength = shortCircuited
    ? turnHits.length
    : expectedTurns.length + 1;
  while (turnHits.length < expectedLength) turnHits.push(false);

  return {
    name: toolCase.name,
    turnHits,
    pickedByTurn,
    hallucinated,
    argViolations,
    shortCircuited,
    correct: recorded.error ? false : turnHits.every(Boolean),
    ...(recorded.error === undefined ? {} : { error: recorded.error }),
  };
}

export function replayAll(
  cases: ToolCase[],
  cassette: Cassette,
): ReplayedCase[] {
  const byName = new Map(cassette.cases.map((c) => [c.name, c]));
  return cases.map((c) =>
    replayCase(c, byName.get(c.name) ?? { name: c.name, turns: [] }),
  );
}

export function summarize(
  cases: ToolCase[],
  replayed: ReplayedCase[],
): ReplaySummary {
  const multiTurn = new Set(
    cases.filter((c) => (c.turns?.length ?? 0) > 0).map((c) => c.name),
  );
  const argByKind: Record<string, number> = {};
  for (const r of replayed) {
    for (const v of r.argViolations) {
      argByKind[v.kind] = (argByKind[v.kind] ?? 0) + 1;
    }
  }
  return {
    argFailedCases: replayed.filter((r) => r.argViolations.length > 0).length,
    argByKind,
    total: replayed.length,
    correct: replayed.filter((r) => r.correct).length,
    invented: replayed.filter((r) => r.hallucinated.length > 0).length,
    errors: replayed.filter((r) => r.error).length,
    multiTurnCases: multiTurn.size,
    multiTurnCorrect: replayed.filter((r) => multiTurn.has(r.name) && r.correct)
      .length,
  };
}
