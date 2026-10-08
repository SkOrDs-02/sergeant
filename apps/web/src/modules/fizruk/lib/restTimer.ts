import type { RestTimerState } from "../hooks/useFizrukRestSound";

/**
 * Чиста арифметика таймера відпочинку. Істина — `endsAt` (мс епохи), а не
 * лічильник тіків: JS у фоні/на заблокованому екрані призупиняється, тож
 * `remaining - 1` на тік відстає на весь час блокування (аудит 2026-10-01,
 * `logic-10`). `remaining` — похідне для відображення.
 */

/** Секунд до `endsAt`, округлено вгору (00:00 показуємо лише по закінченню). */
export function restRemainingSeconds(
  endsAt: number,
  now: number = Date.now(),
): number {
  return Math.max(0, Math.ceil((endsAt - now) / 1000));
}

/** Новий таймер на `sec` секунд, що закінчується через `sec` від `now`. */
export function startRestTimerState(
  sec: number,
  now: number = Date.now(),
): RestTimerState {
  return { remaining: sec, total: sec, endsAt: now + sec * 1000 };
}

/**
 * Зсув таймера на `seconds` (± кнопки «+15 / −15»): рухає `endsAt`, а не
 * лише `remaining`, інакше перерахунок за годинником скасував би зсув. Підлога
 * — 1 с до кінця; `total` не меншає.
 */
export function adjustRestTimerState(
  current: RestTimerState,
  seconds: number,
  now: number = Date.now(),
): RestTimerState {
  const endsAt = Math.max(current.endsAt + seconds * 1000, now + 1000);
  const remaining = restRemainingSeconds(endsAt, now);
  return { remaining, total: Math.max(current.total, remaining), endsAt };
}
