/**
 * Тіньовий режим верифікації чисел (ADR-0097): обчислити, порахувати метрики,
 * залогувати БЕЗ чисел і тексту. Відповідь людині не змінюється ні на байт.
 *
 * Єдине місце серії, де бібліотека (`index.ts`, чиста) зустрічається з env,
 * метриками й логом. `chat.ts` і `chatStream.ts` роблять сюди один тонкий
 * виклик і більше нічого про верифікацію не знають.
 *
 * AI-CONTEXT: до PR3 серії `CHAT_NUMBER_VERIFY=enforce` приймається, але
 * поводиться рівно як `shadow`: повторної генерації й вирізання цифр ще
 * немає. Тому метрика `mode` несе РЕАЛЬНО виконаний режим, а не заданий:
 * `enforce` у дашборді зʼявиться лише тоді, коли воно справді щось робитиме.
 */

import { env } from "../../../env.js";
import { logger } from "../../../obs/logger.js";
import {
  chatNumberHoldMs,
  chatNumberTokensTotal,
  chatNumberVerifyTotal,
} from "../../../obs/metrics.js";
import type { GivenSources } from "./givenCorpus.js";
import { type VerifyResult, verifyAnswerNumbers } from "./index.js";

export type NumberVerifyMode = "off" | "shadow" | "enforce";
export type NumberVerifyTurn = "first" | "synthesis";

/** Режим, який виконується насправді. До PR3 `enforce` це `shadow`. */
export function effectiveNumberVerifyMode(
  configured: NumberVerifyMode = env.CHAT_NUMBER_VERIFY,
): "off" | "shadow" {
  return configured === "off" ? "off" : "shadow";
}

export interface ShadowVerifyInput {
  turn: NumberVerifyTurn;
  /** Ідентифікатор моделі: лише в лог, не в мітки метрик. */
  model: string;
  /** Текст, який побачить людина (після `replaceLongDash`). */
  answer: string;
  /**
   * Подане модель на вході. Функція, а не значення: в режимі `off` її не
   * викликають, тож і збирати нічого не доводиться.
   */
  given: GivenSources | (() => GivenSources);
}

function recordMetrics(
  turn: NumberVerifyTurn,
  result: VerifyResult,
  elapsedMs: number,
): void {
  chatNumberHoldMs.observe({ turn }, elapsedMs);
  chatNumberVerifyTotal.inc({ turn, mode: "shadow", outcome: result.outcome });
  for (const { kind, explained } of result.scoped) {
    chatNumberTokensTotal.inc({ kind, explained });
  }
  if (result.unscopedCount > 0) {
    chatNumberTokensTotal.inc(
      { kind: "unscoped", explained: "na" },
      result.unscopedCount,
    );
  }
}

/**
 * Звіряє числа відповіді з поданим і пише метрики/лог. Нічого не повертає й
 * ніколи не кидає: збій звірки не має права зачепити відповідь.
 *
 * Лог несе лише хід, модель і ВИДИ незʼясованих чисел (`money`, `mass`,
 * `energy`): ані самих чисел, ані тексту, ані поданого (Hard Rule #21).
 */
export function shadowVerifyNumbers(
  input: ShadowVerifyInput,
  configured?: NumberVerifyMode,
): void {
  if (effectiveNumberVerifyMode(configured) === "off") return;
  if (input.answer.trim() === "") return;

  const startedAt = performance.now();
  try {
    const given =
      typeof input.given === "function" ? input.given() : input.given;
    const result = verifyAnswerNumbers(input.answer, given);
    recordMetrics(input.turn, result, performance.now() - startedAt);

    if (result.outcome === "mismatch") {
      const kinds = [...new Set(result.unexplained.map((u) => u.kind))].sort();
      logger.warn({
        msg: "chat_number_mismatch",
        turn: input.turn,
        model: input.model,
        kinds,
      });
    }
  } catch (e) {
    chatNumberVerifyTotal.inc({
      turn: input.turn,
      mode: "shadow",
      outcome: "error",
    });
    logger.warn({
      msg: "chat_number_verify_failed",
      turn: input.turn,
      model: input.model,
      // Лише імʼя класу помилки: текст винятку міг би нести шматок відповіді.
      reason: e instanceof Error ? e.name : "unknown",
    });
  }
}
