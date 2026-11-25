/**
 * rel-34: стеля Voyage-ембеддингів профілю на одного користувача за UTC-добу.
 *
 * Навіщо. Бюджет Voyage (`voyageBudget.ts`) глобальний на процес: після
 * soft-cap пропускається non-critical ingest для ВСІХ, після hard-cap — ще й
 * recall/RAG. `PUT /api/me/profile` дзеркалить `memoryBank` у `ai_memories`,
 * і кожен змінений текст факту дає новий embed. Тобто один акаунт зі
 * скриптом, що щоразу міняє текст фактів, міг вигорити добовий бюджет і
 * вимкнути памʼять AI всім до UTC-півночі. Рішення власника 2026-11-21:
 * стеля `AI_MEMORY_PROFILE_EMBED_DAILY_CAP` (дефолт 50) на користувача.
 *
 * Понад стелю ембеддинг тихо пропускається (warn-лог + метрика), без помилки
 * для людини: профіль однаково зберігається, а пропущені факти дотягне
 * перший PUT після UTC-півночі (діф у `profileMirror.ts` побачить їх як
 * відсутні в `ai_memories`).
 *
 * In-process, як і сам `voyageBudget.ts`: на рестарті лічильник
 * обнуляється, на кількох репліках у кожної свій. Мета — не точний облік, а
 * щоб один користувач не міг з'їсти спільний бюджет.
 *
 * Що саме списується (rel-34-r2, після відхиленого першого підходу). Перша
 * версія списувала кожного кандидата діфу, і це карало чесних людей двічі:
 *   1. Факт, який до Voyage НЕ дійде (health-категорія без
 *      `healthDataConsent`, якої за замовчуванням немає, або будь-який факт
 *      без згоди `ai_memory`), назавжди лишається «відсутнім» в
 *      `ai_memories` і списувався на КОЖНОМУ дзеркаленні, зʼїдаючи стелю
 *      справжнім фактам. Такі кандидати сюди взагалі не приходять — їх
 *      відсікає `profileMirror.ts` перевіркою згоди.
 *   2. Факт, уже поставлений у чергу, але ще не записаний, повторне
 *      дзеркалення бачило відсутнім і списувало ще раз, хоча BullMQ
 *      другий job із тим самим jobId однаково відкидає. Тому лічильник
 *      памʼятає ключі (`sourceRef` + відбиток тексту), списані сьогодні й ще
 *      не побачені в `ai_memories`: такий ключ дозволяється без списання.
 *      Щойно дзеркалення бачить його записаним (`settleProfileEmbeds`), ключ
 *      знімається, тож повернення до старого тексту пізніше списується
 *      чесно, а не проходить безкоштовно.
 */

import { env } from "../../env.js";

interface UserCapState {
  used: number;
  /** Ключі, списані сьогодні, але ще не побачені в `ai_memories`. */
  pending: Set<string>;
}

interface CapState {
  dayKey: string;
  byUser: Map<string, UserCapState>;
}

const state: CapState = { dayKey: "", byUser: new Map() };

function utcDayKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}

function rollDay(now: Date): void {
  const key = utcDayKey(now);
  if (state.dayKey !== key) {
    // Нова доба — попередній день більше не потрібен; Map не росте вічно.
    state.dayKey = key;
    state.byUser.clear();
  }
}

/**
 * Дозвіл на ембеддинг для кожного ключа (масив паралельний `keys`). Ключ,
 * уже списаний сьогодні й ще не записаний, проходить без списання; новий
 * ключ списує одиницю, поки є залишок стелі. `pending` росте не більше ніж
 * на стелю за добу, бо туди потрапляють лише списані ключі.
 */
export function grantProfileEmbeds(
  userId: string,
  keys: readonly string[],
  now: Date = new Date(),
): boolean[] {
  if (keys.length === 0) return [];
  rollDay(now);
  const cap = env.AI_MEMORY_PROFILE_EMBED_DAILY_CAP;
  let user = state.byUser.get(userId);
  return keys.map((key) => {
    if (user?.pending.has(key)) return true;
    if ((user?.used ?? 0) >= cap) return false;
    if (!user) {
      user = { used: 0, pending: new Set() };
      state.byUser.set(userId, user);
    }
    user.used += 1;
    user.pending.add(key);
    return true;
  });
}

/**
 * Ключі, які дзеркалення бачить уже записаними в `ai_memories`: вони
 * більше не «в дорозі», і наступний запит того самого змісту — новий
 * ембеддинг, який списується. Списане за день не повертається.
 */
export function settleProfileEmbeds(
  userId: string,
  keys: Iterable<string>,
  now: Date = new Date(),
): void {
  rollDay(now);
  const user = state.byUser.get(userId);
  if (!user || user.pending.size === 0) return;
  for (const key of keys) user.pending.delete(key);
}

/** Лише для тестів. */
export function __resetProfileEmbedCapState(): void {
  state.dayKey = "";
  state.byUser.clear();
}
