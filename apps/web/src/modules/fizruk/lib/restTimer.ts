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

/**
 * Слот таймера в sessionStorage (аудит 2026-10-01, `logic-10`): reload
 * вкладки чи повторне монтування `RestTimerProvider` раніше губили відпочинок,
 * бо стан жив лише в `useState`. Пишемо тільки `endsAt` і `total`, `remaining`
 * завжди перераховується з годинника.
 *
 * Чому sessionStorage, а не localStorage: відпочинок триває хвилини й
 * належить цій вкладці. Друга вкладка не має підхоплювати чужий відлік, а
 * таймер, що «прокинувся» наступного дня з localStorage, був би шумом.
 * Убитий ОС PWA слот втрачає разом із sessionStorage, і це свідомо: сигнал у
 * фоні (Notification / Web Push) — окреме відкрите рішення.
 *
 * Префікс `fizruk_` — щоб `purgeAppOwnedSessionStorage` стер слот на виході з
 * акаунта.
 */
export const REST_TIMER_SESSION_KEY = "fizruk_rest_timer_v1"; // gitleaks:allow

/**
 * Відновлює таймер зі слота. `null` — слота немає, він битий або відпочинок
 * уже скінчився, поки сторінки не було (сигнал заднім числом не граємо:
 * людина його вже не чекає, а звук посеред завантаження лише лякає).
 */
export function readPersistedRestTimer(
  raw: string | null,
  now: number = Date.now(),
): RestTimerState | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { endsAt?: unknown; total?: unknown };
    const endsAt = Number(parsed.endsAt);
    const total = Number(parsed.total);
    if (!Number.isFinite(endsAt) || !Number.isFinite(total) || total <= 0) {
      return null;
    }
    const remaining = restRemainingSeconds(endsAt, now);
    if (remaining <= 0) return null;
    return { remaining, total: Math.max(total, remaining), endsAt };
  } catch {
    return null;
  }
}

/** Рядок для слота: лише те, з чого `readPersistedRestTimer` відновлює стан. */
export function serializeRestTimer(
  state: Pick<RestTimerState, "endsAt" | "total">,
): string {
  return JSON.stringify({ endsAt: state.endsAt, total: state.total });
}
