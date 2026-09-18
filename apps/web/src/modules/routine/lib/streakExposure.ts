/**
 * Last validated: 2026-07-25
 * Status: Active
 * Owner: @Skords-01
 *
 * Леджер експозиції стріку — device-local запис «коли користувач востаннє
 * бачив свій стрік на поверхні, яка НЕ є `InsightCard`».
 *
 * Писар один: `RoutineCalendarHero` (полумʼя героя). Читач один:
 * `useRoutineAppState` — дописує чекіну поля `saw_streak_surface` /
 * `streak_days_at_checkin` / `ms_since_streak_shown`
 * (контракт — `packages/shared/src/lib/analyticsEvents.valueLoops.ts` §2/§4).
 *
 * ## Межі, які тут навмисно проведені
 *
 * - **streak-record-карточка сюди НЕ пише.** Вона рендериться через
 *   `InsightCard`, тож її показ уже покритий `value_signal_shown`. Другий
 *   запис подвоїв би покази і вдвічі занизив конверсію петлі.
 * - **Дедуплікація показу — по `(день пристрою, surface)`.** Список звичок
 *   ре-рендериться на КОЖЕН toggle; наївний emit роздув би знаменник у
 *   десятки разів. `claimStreakShownOnce()` віддає `true` рівно раз на
 *   поверхню на день у межах життя вкладки.
 * - **Мітка часу оновлюється на кожній експозиції, подія — ні.** Леджер
 *   відповідає на питання «коли полумʼя востаннє було на екрані», а не
 *   «коли його показали вперше».
 * - **Вікно N у код не зашите.** Емітимо сирий `ms_since_streak_shown`; «дія
 *   протягом N» рахується в PostHog-запиті, тож N переглядається заднім
 *   числом без релізу (та сама доктрина, що й у `valueSignalAttribution.ts`).
 * - **День — за пристроєм (ADR-0078).** `dateKeyFromDate(new Date())`, ніякого
 *   UTC і ніякого крос-девайсного порівняння timestamps.
 *
 * ## Чому зріз «бачив полумʼя vs ні» сам по собі нічого не доводить
 *
 * `useStreakFlame` ховає полумʼя при `streakDays === 0`, а сам герой живе на
 * тому ж екрані, що й чекбокси. Тому «бачив полумʼя» ≈ «стрік > 0»: це
 * порівняння двох РІЗНИХ КОГОРТ, а не тест стимулу. Поле `saw_streak_surface`
 * існує, щоб розрізняти ПОВЕРХНІ, а не щоб схлопуватись у булеан. Чесну
 * варіацію дає лише streak-record-карточка (`surface: "module"` у
 * `value_signal_shown`). Ніколи не агрегувати обидві поверхні в один прапорець.
 */

import { dateKeyFromDate } from "@sergeant/routine-domain";
import {
  safeReadStringSS,
  safeWriteSS,
  safeRemoveSS,
} from "@shared/lib/storage/storage";

const STORAGE_KEY = "sergeant.v2.routine.streakExposure";

/**
 * Межа протухання запису. НЕ «вікно N»: реальне вікно обирається у PostHog.
 * Первинний гейт — збіг дня пристрою; TTL лише страхує від годинника, що
 * стрибнув, і від дзеркала, яке пережило зміну доби.
 */
const TTL_MS = 24 * 60 * 60 * 1000;

/** Поверхні показу стріку ПОЗА `InsightCard` (контракт `routine_streak_shown`). */
export type StreakSurface = "hero_flame" | "stats_pill" | "hub_badge";

export interface StreakExposureRecord {
  surface: StreakSurface;
  /** `derived.streakMax` — максимум по ВСІХ звичках, не per-habit. */
  streakDays: number;
  /** День пристрою на момент показу, `YYYY-MM-DD` (ADR-0078). */
  dayKey: string;
  /** `Date.now()` моменту показу — device-local. */
  at: number;
}

/**
 * Поля атрибуції в тому вигляді, в якому вони їдуть у payload
 * `routine_habit_checked`. Імена snake_case — це property-и PostHog.
 */
export interface StreakExposureAttribution {
  saw_streak_surface: StreakSurface | null;
  streak_days_at_checkin: number | null;
  ms_since_streak_shown: number | null;
}

const NO_EXPOSURE: StreakExposureAttribution = Object.freeze({
  saw_streak_surface: null,
  streak_days_at_checkin: null,
  ms_since_streak_shown: null,
});

// Module-level стор — джерело правди в межах життя вкладки; sessionStorage
// лише дзеркало на випадок reload-у (PWA-оновлення, повернення з redirect-у).
let lastSeen: StreakExposureRecord | null = null;

// Ключі `${dayKey}::${surface}`, для яких `routine_streak_shown` уже полетів
// у цьому завантаженні сторінки.
const shownOnce = new Set<string>();

function todayKey(): string {
  // ADR-0078: день належить ПРИСТРОЮ, не Києву. Київський day-key тут дав би
  // «учорашню» експозицію мандрівнику, який дивиться на полумʼя о 20:00 за
  // місцевим часом.
  // eslint-disable-next-line no-restricted-syntax -- див. коментар вище (ADR-0078)
  return dateKeyFromDate(new Date());
}

function isRecord(value: unknown): value is StreakExposureRecord {
  if (typeof value !== "object" || value === null) return false;
  const rec = value as Partial<StreakExposureRecord>;
  return (
    (rec.surface === "hero_flame" ||
      rec.surface === "stats_pill" ||
      rec.surface === "hub_badge") &&
    typeof rec.streakDays === "number" &&
    Number.isFinite(rec.streakDays) &&
    typeof rec.dayKey === "string" &&
    typeof rec.at === "number" &&
    Number.isFinite(rec.at)
  );
}

function readMirror(): StreakExposureRecord | null {
  const raw = safeReadStringSS(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Зафіксувати, що стрік зараз на екрані. Fire-and-forget, ніколи не кидає —
 * викликається з `useEffect` рендер-шляху героя.
 */
export function markStreakSeen(input: {
  surface: StreakSurface;
  streakDays: number;
}): void {
  if (!input || typeof input.streakDays !== "number") return;
  if (!Number.isFinite(input.streakDays)) return;
  const record: StreakExposureRecord = {
    surface: input.surface,
    streakDays: input.streakDays,
    dayKey: todayKey(),
    at: Date.now(),
  };
  lastSeen = record;
  try {
    safeWriteSS(STORAGE_KEY, JSON.stringify(record));
  } catch {
    /* дзеркало best-effort — in-memory стор уже оновлено */
  }
}

/**
 * Чи можна емітити `routine_streak_shown` для цієї поверхні прямо зараз.
 *
 * Віддає `true` рівно один раз на `(день пристрою, surface)` у межах життя
 * вкладки і `false` на кожен наступний ре-рендер. Це і є та обовʼязкова
 * дедуплікація, без якої знаменник петлі роздувається на кожен toggle.
 */
export function claimStreakShownOnce(surface: StreakSurface): boolean {
  const key = `${todayKey()}::${surface}`;
  if (shownOnce.has(key)) return false;
  shownOnce.add(key);
  return true;
}

/**
 * Прочитати поля експозиції для `routine_habit_checked`.
 *
 * Не атрибутуємо, якщо: запису немає; він з іншого дня пристрою (ADR-0078 —
 * учорашній показ не мотивує сьогоднішній чекін); дельта відʼємна (зсув
 * годинника) або старша за TTL.
 */
export function readStreakExposure(): StreakExposureAttribution {
  const record = lastSeen ?? readMirror();
  if (!record) return NO_EXPOSURE;
  // Гідратуємо in-memory стор після reload-у, щоб не парсити JSON щоразу.
  lastSeen = record;

  if (record.dayKey !== todayKey()) return NO_EXPOSURE;

  const delta = Date.now() - record.at;
  if (!Number.isFinite(delta) || delta < 0 || delta > TTL_MS) {
    return NO_EXPOSURE;
  }

  return {
    saw_streak_surface: record.surface,
    streak_days_at_checkin: record.streakDays,
    ms_since_streak_shown: delta,
  };
}

/**
 * Скинути леджер і once-guard. Потрібен тестам і будь-якому майбутньому
 * logout/purge-шляху — експозиція одного акаунта не має протікати в
 * наступний на тому ж пристрої.
 */
export function resetStreakExposure(): void {
  lastSeen = null;
  shownOnce.clear();
  safeRemoveSS(STORAGE_KEY);
}
