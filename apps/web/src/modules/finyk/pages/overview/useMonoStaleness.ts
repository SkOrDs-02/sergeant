/**
 * Last validated: 2026-07-25
 * Status: Active
 *
 * Staleness банку для Overview — з власним годинником.
 *
 * AI-CONTEXT: винесено з `Overview.tsx` не заради охайності, а тому що
 * тут був баг. Перша версія рахувала staleness у `useMemo` з
 * залежностями `[lastEventAt, webhookActive]` — тобто лише від
 * sync-метаданих. На довго відкритій вкладці (а це PWA, її тримають
 * відкритою тижнями) жодна з них не змінюється, поки банк мовчить: сама
 * відсутність подій і є умовою, яку ми детектуємо. Значення, пораховане
 * на 6-й день, лишалось у кеші й на 8-й, і банер не зʼявлявся **ніколи**
 * саме в тому сценарії, заради якого написаний. Доменний тест цього не
 * ловив — він викликає чисту функцію напряму, минаючи мемоізацію.
 *
 * Тому годинник тут власний: тік раз на годину рухає `now` і змушує
 * перерахунок. Година — з великим запасом: поріг має добову
 * гранулярність, тож навіть у найгіршому разі банер спізнюється на
 * годину, а не на добу. Частіше — марне будження вкладки.
 */
import { useEffect, useMemo, useState } from "react";

import { FinykDomain } from "@sergeant/finyk-domain";

/** Як часто пересуваємо годинник. Доба / 24 — з запасом під добовий поріг. */
export const MONO_STALENESS_TICK_MS = 60 * 60 * 1000;

export interface UseMonoStalenessInput {
  readonly lastEventAt: string | null;
  readonly webhookActive: boolean;
  /** Перевизначення інтервалу тіку — лише для тестів. */
  readonly tickMs?: number;
}

/**
 * Повертає поточний staleness-стан і сама перераховує його з плином
 * часу, а не лише коли змінились дані синку.
 */
export function useMonoStaleness(
  input: UseMonoStalenessInput,
): FinykDomain.MonoStalenessResult {
  const { lastEventAt, webhookActive } = input;
  const tickMs = input.tickMs ?? MONO_STALENESS_TICK_MS;

  // WHY `Date.now()`: рахуємо РІЗНИЦЮ двох моментів («скільки минуло від
  // останньої події»), а не «який сьогодні день у Києві». Київські
  // хелпери дають день-ключ, непридатний для віднімання, і зробили б
  // результат залежним від години, о якій впала подія.

  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => {
      setNowMs(Date.now());
    }, tickMs);
    return () => window.clearInterval(id);
  }, [tickMs]);

  return useMemo(
    () =>
      FinykDomain.evaluateMonoStaleness({
        lastEventAt,
        webhookActive,
        now: new Date(nowMs),
      }),
    [lastEventAt, webhookActive, nowMs],
  );
}
