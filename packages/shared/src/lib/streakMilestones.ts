/**
 * Last validated: 2026-09-13
 * Status: Active
 *
 * Віхи стріку: ОДИН набір порогів і ОДНА функція перетину на весь продукт.
 *
 * До цього модуля пороги жили в чотирьох місцях і три з них розходились:
 * `dashboardCards.tsx` (аналітика хаба), `StreakFlame.tsx` (пульс іконки),
 * `useStreakFlame.ts` (тири кольору) і мертвий `AnimatedCheckbox.showConfetti`.
 * Розходження ніхто не гейтив, тож «віха» означала різне залежно від того,
 * який файл читати.
 *
 * НАБОРІВ ДВА, І ЦЕ НАВМИСНО:
 *
 *   `CELEBRATED_STREAK_MILESTONES` — 7/30/100, рішення власника 2026-09-11.
 *     Те, що людина БАЧИТЬ: тиха плашка на 4 с.
 *   `TRACKED_STREAK_MILESTONES` — вісім порогів, що були в хабі до цього
 *     модуля. Те, що йде в АНАЛІТИКУ. Ширший набір дає воронці роздільність
 *     (14/21/60/90/365), якої три пороги не дають, а зводити його до трьох
 *     означало б мовчки переписати історичний ряд у PostHog.
 *
 * Тобто святкуємо рідше, ніж міряємо. Зміниш один набір — не чіпай другий
 * автоматично: вони відповідають на різні питання.
 *
 * AI-DANGER: усі пороги тут — У ДНЯХ. Не подавай сюди тижневий стрік
 * (Фізрук: `computeWeeklyStreakWeeks`). Змішування вже коштувало мовчазного
 * псування воронки — `Math.max` брав 5 тижнів як «більше» за 5 днів, і в
 * аналітику летіло `days: 7` за сім ТИЖНІВ підряд (аудит L-8, 2026-08-07).
 */
import { readJSON, writeJSON, type KVStore } from "../storage/kv";

/** Пороги, які людина бачить як святкування. Рішення власника 2026-09-11. */
export const CELEBRATED_STREAK_MILESTONES = [7, 30, 100] as const;

/** Пороги, які йдуть в аналітику. Ширші за святкові — див. докстрінг. */
export const TRACKED_STREAK_MILESTONES = [
  7, 14, 21, 30, 60, 90, 100, 365,
] as const;

/**
 * Найвища віха, перетнута переходом `previous → current`.
 *
 * «Перетнута» означає `previous < m <= current` — тобто повернення до того
 * самого числа після паузи/skip перетином НЕ є.
 */
export function highestMilestoneCrossed(
  current: number,
  previous: number,
  milestones: readonly number[] = TRACKED_STREAK_MILESTONES,
): number | null {
  for (let i = milestones.length - 1; i >= 0; i--) {
    const m = milestones[i];
    if (m !== undefined && current >= m && previous < m) return m;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Дедуп святкувань — device-local
// ---------------------------------------------------------------------------

const CLAIMED_KEY = "streak_milestones_claimed_v1";

interface ClaimedMap {
  /** `"<scope>:<days>"` → true. */
  [key: string]: boolean;
}

const claimKey = (scope: string, days: number) => `${scope}:${days}`;
const seededKey = (scope: string) => `${scope}:__seeded`;

/**
 * Чи є вже незанята віха для поточного стріку — і одразу її зайняти.
 *
 * Повертає віху, яку треба відсвяткувати, або `null`.
 *
 * ЧОМУ ЗАЙНЯТТЯ, А НЕ ПОРІВНЯННЯ З ПОПЕРЕДНІМ ЗНАЧЕННЯМ. Стрік читається на
 * кожен рендер, не приходить подією, і має щонайменше три способи
 * повернутись до того самого числа: grace-бюджет, skip і холодний старт, на
 * якому SQLite-кеш гріється вже ПІСЛЯ sync-pull (стрік стрибає 0 → 45 за
 * один рендер). Порівняння з реф-ом це не ловить — рівно на цьому стояв
 * детектор у хабі, і рівно на цьому вже раз обпікся `useFirstEntryCelebration`
 * (LOG-8, 2026-09-01).
 *
 * ПЕРШИЙ ЗАПУСК ЗАСІВАЄ, А НЕ СВЯТКУЄ. Людина зі стріком 45 на момент
 * релізу вже пройшла 7 і 30 — вітати її з ними означало б святкувати те,
 * чого вона щойно не робила (рішення власника 2026-09-13). Тому перший
 * виклик для scope позначає всі віхи `<= current` зайнятими й віддає `null`.
 *
 * ЗАЙМАЄ ВСЕ, ЩО НИЖЧЕ. Якщо стрік приїхав із сусіднього пристрою одразу
 * великим, святкуємо найвищу досягнуту й гасимо нижчі — інакше 7 вистрелила
 * б наступним рендером після 30.
 *
 * Сховище — пристрій (`KVStore` → localStorage). Це свідомо: сервер про
 * справжній день-стрік не знає взагалі (`applySync.ts` тримає лічильник
 * КЛІКІВ, не днів), а день-ключ і так device-local (ADR-0078). Ціна теж
 * свідома: новий пристрій = порожня мапа = засів на поточному стріку,
 * тобто людина не побачить віху, яку перетнула саме там.
 */
export function claimStreakMilestone(
  store: KVStore,
  scope: string,
  currentStreak: number,
  milestones: readonly number[] = CELEBRATED_STREAK_MILESTONES,
): number | null {
  const map = readJSON<ClaimedMap>(store, CLAIMED_KEY) ?? {};

  if (map[seededKey(scope)] !== true) {
    map[seededKey(scope)] = true;
    for (const m of milestones) {
      if (currentStreak >= m) map[claimKey(scope, m)] = true;
    }
    writeJSON(store, CLAIMED_KEY, map);
    return null;
  }

  let reached: number | null = null;
  for (let i = milestones.length - 1; i >= 0; i--) {
    const m = milestones[i];
    if (m === undefined || currentStreak < m) continue;
    if (map[claimKey(scope, m)] !== true) {
      reached = m;
      break;
    }
  }
  if (reached === null) return null;

  for (const m of milestones) {
    if (m <= reached) map[claimKey(scope, m)] = true;
  }
  writeJSON(store, CLAIMED_KEY, map);
  return reached;
}
