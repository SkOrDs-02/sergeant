/**
 * Режим повернення для підказки наступного підходу в активному тренуванні — pure.
 *
 * AI-CONTEXT (аудит 2026-10-01, `logic-04`): картка підказки
 * (`WorkoutItemNextSetHint`) бачила лише ОСТАННЮ сесію вправи і рахувала
 * старіння від неї самої: пік = найкращий підхід останньої сесії, давність =
 * давність останньої сесії. Одне легке заняття після пів року паузи робило
 * цю сесію «свіжою», режим повернення вимикався, і вже на наступному
 * тренуванні підказка піднімала вагу, хоча сторінка вправи (і борд прогресу)
 * для тієї ж вправи далі показували «Повертаєшся після перерви» (≥90%
 * зниженого піка ще не набрано). Тут обидва погляди зведені: режим
 * повернення вмикає БУДЬ-ЯКИЙ із них.
 *
 * AI-DANGER: `suggestNextSet` застосовує `reductionPct` до ваги ОСТАННЬОГО
 * підходу, а `computeOneRmAging` міряє зниження від ПІКА. Тому зниження з
 * історії перераховується на останній підхід (`1 − reference1rm / lastBest1rm`)
 * і береться СУВОРІШЕ з двох. Без перерахунку легка сесія повернення
 * (76 при піку 140, орієнтир 105) знижувалась би вдруге — на 25% від уже
 * зниженої ваги; без `max` давність від останньої сесії (яка й так нижча за
 * пік) губила б своє зниження. Помилка «занизька вага» коштує одного легкого
 * підходу, «завищена» — травми.
 */

import {
  computeOneRmAging,
  type OneRmSessionPoint,
  type ReturnReason,
} from "./oneRmAging.js";

export interface NextSetAgingInput {
  /** e1RM найкращого підходу ОСТАННЬОЇ сесії — від нього рахує підказка. */
  readonly lastBest1rm: number;
  /** ISO останньої сесії з цією вправою. */
  readonly lastSessionAt?: string | null;
  /**
   * Усі силові сесії вправи (без поточного тренування). Без них поведінка
   * рівно як раніше: старіння лише від останньої сесії.
   */
  readonly sessions?: readonly OneRmSessionPoint[] | undefined;
  readonly now?: Date | number | undefined;
  readonly staleAfterDays?: number | undefined;
}

/** Форма `ReturnModeHint` для `suggestNextSet`. */
export interface NextSetAging {
  readonly returnMode: boolean;
  readonly returnReason: ReturnReason | null;
  /** Зниження від ваги ОСТАННЬОГО підходу, у відсотках. */
  readonly reductionPct: number;
}

export function computeNextSetAging(input: NextSetAgingInput): NextSetAging {
  const lastBest1rm = Number.isFinite(input.lastBest1rm)
    ? Math.max(0, input.lastBest1rm)
    : 0;
  const shared = {
    lastSessionAt: input.lastSessionAt ?? null,
    now: input.now,
    staleAfterDays: input.staleAfterDays,
  };

  // Погляд останньої сесії: давність від неї, зниження від її ж підходу.
  const local = computeOneRmAging({ ...shared, peak1rm: lastBest1rm });

  const sessions = input.sessions ?? [];
  let peak1rm = lastBest1rm;
  for (const s of sessions) {
    if (Number.isFinite(s.best1rm)) peak1rm = Math.max(peak1rm, s.best1rm);
  }
  // Погляд історії: пік за всю історію і незавершене повернення після паузи.
  const history =
    sessions.length > 0
      ? computeOneRmAging({ ...shared, peak1rm, sessions })
      : null;

  const localPct = local.returnMode ? local.reductionPct : 0;
  const historyPct =
    history?.returnMode && lastBest1rm > 0
      ? Math.max(0, Math.round((1 - history.reference1rm / lastBest1rm) * 100))
      : 0;

  const returnMode = local.returnMode || Boolean(history?.returnMode);
  return {
    returnMode,
    returnReason: !returnMode
      ? null
      : (history?.returnReason ?? local.returnReason ?? "layoff"),
    reductionPct: Math.max(localPct, historyPct),
  };
}
