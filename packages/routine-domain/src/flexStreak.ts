/**
 * Гнучкий стрік — pure.
 *
 * AI-CONTEXT: канон [`routine.md §4`] дослівно обіцяє «гнучкий всюди —
 * додати заморозки», а `streakForHabit` реалізує ПРОТИЛЕЖНЕ: `break` на
 * першому дні без відмітки. Аудит називає цей розрив головним у модулі
 * (напруга 1, E-3, G1). Тут — обіцяна семантика; старий `streakForHabit`
 * лишається недоторканим, доки всі споживачі не перемкнені.
 *
 * Три механізми мʼякості, і вони НЕ взаємозамінні:
 *
 * 1. **Планована пауза** (`Habit.pauseIntervals`) — дні випадають із
 *    розкладу взагалі: не ламають стрік і не подовжують його. Це те, що
 *    founder називає «дні не рахуються».
 * 2. **Пропуск із причиною** (`state.skips`) — день був запланований,
 *    людина не змогла й сказала чому. Нейтральний: стрік переживає,
 *    але не росте. «Не зміг» ≠ провал (канон §5).
 * 3. **Grace-бюджет** — мовчазний пропуск, який стрік усе одно переживає.
 *    Це єдиний із трьох, що прощає БЕЗ участі користувача, тому він
 *    єдиний обмежений квотою.
 *
 * ⚠️ **Числа квоти — інженерний дефолт, не рішення founder-а.** Канон
 * вимагає бюджет, але жодної цифри не називає, і в § «На роздум власнику»
 * цього питання немає. Значення нижче обрані так, щоб бюджет не міг
 * намалювати стрік із повітря (див. доку кожної константи), і мають бути
 * ратифіковані окремо. Зміна будь-якої з них рухає видиме число, тож іде
 * разом із бампом `METRICS_VERSION`.
 */

import { dateKeyFromDate, parseDateKey } from "./dateKeys.js";
import {
  dateKeyInPauseInterval,
  habitCountsTowardMetrics,
  habitScheduledOnDate,
} from "./schedule.js";
import type { Habit, HabitSkip } from "./types.js";

/**
 * Скільки виконаних днів «оплачують» одну заморозку.
 *
 * Бюджет заробляється самим стріком, а не видається наперед: у стріку
 * коротшому за 7 днів заморозок НЕМАЄ взагалі. Інакше механізм прощення
 * дозволяв би тримати «стрік» майже нічого не роблячи — а це рівно та
 * брехня, проти якої написана вся Хвиля 4.
 */
export const GRACE_EARN_EVERY_DAYS = 7;

/**
 * Стеля бюджету незалежно від довжини стріку.
 *
 * Без стелі річний стрік накопичив би ~52 заморозки й перестав би щось
 * означати: людина могла б не робити нічого місяць і зберегти цифру.
 */
export const MAX_GRACE_BUDGET = 4;

/**
 * Скільки мовчазних пропусків підряд бюджет ще прощає.
 *
 * Один — це збій дня. Два підряд — це зупинка, і саме так її треба
 * назвати. Правило діє ДО бюджету: навіть із чотирма невитраченими
 * заморозками два порожні дні поспіль ламають стрік.
 */
export const MAX_CONSECUTIVE_GRACE = 1;

/** Стан одного дня всередині вікна стріку. */
export type StreakDayKind =
  /** запланований і відмічений */
  | "done"
  /** запланований, є позначка «не зміг з причиною» */
  | "skip"
  /** день заявленої паузи */
  | "pause"
  /** не запланований розкладом (вихідний звички) */
  | "off"
  /** запланований, порожній, у минулому */
  | "miss"
  /** сьогодні: заплановано, ще не відмічено — день не закінчився */
  | "pending";

export interface FlexibleStreakOptions {
  /** Пропуски цієї звички: `dateKey → HabitSkip`. */
  skipsForHabit?: Record<string, HabitSkip> | undefined;
  /** Перевизначення квоти — лише для тестів і what-if. */
  graceEarnEveryDays?: number | undefined;
  maxGraceBudget?: number | undefined;
}

/** Один день вікна серії — дата + тип, готовий для рендеру «полотна». */
export interface FlexibleStreakDayCell {
  /** `YYYY-MM-DD`. */
  key: string;
  kind: StreakDayKind;
}

export interface FlexibleStreakBreakdown {
  /**
   * Число, яке показуємо користувачу: **виконані** дні у поточній серії.
   * Дні паузи, пропуски з причиною й прощені бюджетом дні у нього НЕ
   * входять — вони серію зберігають, але не подовжують.
   */
  days: number;
  /** Скільки заморозок серія вже витратила. */
  graceUsed: number;
  /** Скільки лишилось при поточній довжині. */
  graceRemaining: number;
  /** Днів заявленої паузи всередині вікна серії. */
  pauseDays: number;
  /** Днів «не зміг з причиною» всередині вікна серії. */
  skipDays: number;
  /**
   * Сьогодні заплановано й ще не відмічено. Стрік від цього НЕ падає:
   * день не закінчився. Старий `streakForHabit` тут віддавав 0 — тобто
   * до першої відмітки щоранку показував «серія обірвалась».
   */
  todayPending: boolean;
  /** День, на якому серія обірвалась (`null` — дійшли до початку історії). */
  brokenOn: string | null;
  /**
   * Дні поточної серії, у хронологічному порядку (найдавніший → сьогодні) —
   * саме той матеріал, з якого рахуються `days`/`graceUsed`/`pauseDays`/
   * `skipDays` вище. Призначення — UI-полотно з типами дня (кожен
   * `StreakDayKind` — окремий візуальний стан, не лише число). `"miss"`
   * усередині цього вікна за визначенням прощений бюджетом: день, який
   * бюджет не потягнув, стає межею вікна (`brokenOn`) і в нього не
   * потрапляє.
   */
  window: FlexibleStreakDayCell[];
}

function dateKeyMinusDays(baseKey: string, daysBack: number): string {
  const d = parseDateKey(baseKey);
  d.setDate(d.getDate() - daysBack);
  d.setHours(12, 0, 0, 0);
  return dateKeyFromDate(d);
}

/**
 * Розібрана поточна серія звички — з провенансом кожного мʼякого дня.
 *
 * Прохід іде від `todayKey` назад і зупиняється на першому дні, який не
 * переживає навіть максимальний бюджет (два мовчазні пропуски поспіль),
 * або на початку історії звички.
 *
 * Бюджет застосовується ПІСЛЯ проходу, бо він залежить від довжини
 * серії, а довжина — від бюджету. Розвʼязується ітерацією до нерухомої
 * точки: не по кишені найдавніший прощений пропуск ⇒ серія ріжеться на
 * ньому ⇒ вона коротшає ⇒ бюджет меншає ⇒ повторюємо. Кожен крок лише
 * скорочує вікно, тож цикл скінченний.
 */
export function flexibleStreakBreakdown(
  habit: Habit,
  completionsForHabit: string[] | undefined,
  todayKey: string,
  opts: FlexibleStreakOptions = {},
): FlexibleStreakBreakdown {
  const done = new Set(completionsForHabit || []);
  const skips = opts.skipsForHabit || {};
  const earnEvery = opts.graceEarnEveryDays ?? GRACE_EARN_EVERY_DAYS;
  const maxGrace = opts.maxGraceBudget ?? MAX_GRACE_BUDGET;

  const empty: FlexibleStreakBreakdown = {
    days: 0,
    graceUsed: 0,
    graceRemaining: 0,
    pauseDays: 0,
    skipDays: 0,
    todayPending: false,
    brokenOn: null,
    window: [],
  };

  // `once` серії не має за визначенням (канон §7 п.2, рішення 2026-08-30):
  // разова подія — не послідовність днів, тож і полотну нема чого показати.
  if (!habitCountsTowardMetrics(habit)) return empty;

  // Нижня межа проходу — найдавніша відома дата звички. Без неї рідкі
  // рекурентності (monthly) крутили б цикл до safety-cap.
  let earliest: string | null = null;
  for (const k of done) if (earliest === null || k < earliest) earliest = k;
  for (const k of Object.keys(skips)) {
    if (earliest === null || k < earliest) earliest = k;
  }
  if (done.size === 0 && Object.keys(skips).length === 0) {
    // Немає жодної відмітки — але сьогоднішній запланований день усе одно
    // «в очікуванні», а не провал.
    return {
      ...empty,
      todayPending: habitScheduledOnDate(habit, todayKey),
    };
  }
  const startKey = habit.startDate || earliest || todayKey;
  const minKey = earliest && earliest < startKey ? earliest : startKey;

  const kinds: StreakDayKind[] = [];
  const keys: string[] = [];
  let brokenOn: string | null = null;
  let consecutiveMiss = 0;

  // Той самий safety-cap на биті дати, що й у `streakForHabit`.
  for (let i = 0, dayOffset = 0; i < 20 * 366; i++, dayOffset++) {
    const key = dateKeyMinusDays(todayKey, dayOffset);
    if (key < minKey) break;

    if (dateKeyInPauseInterval(habit.pauseIntervals, key)) {
      kinds.push("pause");
      keys.push(key);
      continue;
    }
    if (!habitScheduledOnDate(habit, key)) {
      kinds.push("off");
      keys.push(key);
      continue;
    }
    if (done.has(key)) {
      kinds.push("done");
      keys.push(key);
      consecutiveMiss = 0;
      continue;
    }
    if (skips[key]) {
      kinds.push("skip");
      keys.push(key);
      consecutiveMiss = 0;
      continue;
    }
    if (dayOffset === 0) {
      // Сьогодні ще не закінчилось — це не пропуск.
      kinds.push("pending");
      keys.push(key);
      continue;
    }
    consecutiveMiss += 1;
    if (consecutiveMiss > MAX_CONSECUTIVE_GRACE) {
      brokenOn = key;
      break;
    }
    kinds.push("miss");
    keys.push(key);
  }

  // Позиції мовчазних пропусків, від найсвіжішого до найдавнішого.
  const missPositions: number[] = [];
  for (let i = 0; i < kinds.length; i++) {
    if (kinds[i] === "miss") missPositions.push(i);
  }

  let cut = kinds.length;
  for (;;) {
    let daysInside = 0;
    for (let i = 0; i < cut; i++) if (kinds[i] === "done") daysInside += 1;
    const affordable = Math.min(
      maxGrace,
      earnEvery > 0 ? Math.floor(daysInside / earnEvery) : 0,
    );
    const inside = missPositions.filter((p) => p < cut);
    if (inside.length <= affordable) break;
    // Найдавніший пропуск, який уже не по кишені, обриває серію на собі.
    const firstUnaffordable = inside[affordable];
    if (firstUnaffordable === undefined) break;
    brokenOn = keys[firstUnaffordable] ?? brokenOn;
    cut = firstUnaffordable;
  }

  // Сьогоднішнє очікування живе поза вікном серії: воно стосується дня,
  // який ще не має результату, а не того, що серія накопичила.
  const todayPending = kinds[0] === "pending";

  // Хвіст без жодної відмітки у вікно серії не входить. Без цього обрізання
  // прохід, що дійшов до початку історії, «витрачав» заморозку на порожнечу
  // ДО першої відмітки — число `days` від цього не мінялось, але `graceUsed`
  // показував витрату, якої користувач не робив.
  let lastDone = -1;
  for (let i = cut - 1; i >= 0; i--) {
    if (kinds[i] === "done") {
      lastDone = i;
      break;
    }
  }
  cut = lastDone + 1;

  let days = 0;
  let graceUsed = 0;
  let pauseDays = 0;
  let skipDays = 0;
  for (let i = 0; i < cut; i++) {
    const k = kinds[i];
    if (k === "done") days += 1;
    else if (k === "miss") graceUsed += 1;
    else if (k === "pause") pauseDays += 1;
    else if (k === "skip") skipDays += 1;
  }

  // Серія обірвалась рівно там, де вікно впирається в мовчазний пропуск.
  // Якщо за вікном — початок історії звички, обриву не було.
  brokenOn = kinds[cut] === "miss" ? (keys[cut] ?? null) : null;

  const earned = Math.min(
    maxGrace,
    earnEvery > 0 ? Math.floor(days / earnEvery) : 0,
  );

  // Той самий [0, cut) зріз, з якого щойно порахували `days`/`graceUsed`/…,
  // але для UI-полотна — хронологічно, найдавніший день ліворуч.
  const window: FlexibleStreakDayCell[] = [];
  for (let i = cut - 1; i >= 0; i--) {
    const k = keys[i];
    const kind = kinds[i];
    if (k !== undefined && kind !== undefined) window.push({ key: k, kind });
  }

  return {
    days,
    graceUsed,
    graceRemaining: Math.max(0, earned - graceUsed),
    pauseDays,
    skipDays,
    todayPending,
    brokenOn,
    window,
  };
}

/** Гнучкий аналог `streakForHabit` — лише число серії. */
export function flexibleStreakForHabit(
  habit: Habit,
  completionsForHabit: string[] | undefined,
  todayKey: string,
  opts: FlexibleStreakOptions = {},
): number {
  return flexibleStreakBreakdown(habit, completionsForHabit, todayKey, opts)
    .days;
}

/** Гнучкий аналог `maxActiveStreak` по всіх неархівних звичках. */
export function flexibleMaxActiveStreak(
  habits: Habit[],
  completions: Record<string, string[]>,
  todayKey: string,
  skips: Record<string, Record<string, HabitSkip>> = {},
): number {
  let m = 0;
  for (const h of habits) {
    if (h.archived) continue;
    m = Math.max(
      m,
      flexibleStreakForHabit(h, completions[h.id] || [], todayKey, {
        skipsForHabit: skips[h.id],
      }),
    );
  }
  return m;
}
