/**
 * Спільний бюджет нагадувань: скільки пушів на добу і коли саме.
 *
 * Спека: docs/work/specs/reward-loop-and-reminders.md, § Рішення дизайну.
 *
 * Звички, тренування, їжа і нудж Сержанта раніше слали пуші незалежно, тож
 * людина з пʼятьма звичками на різні години отримувала пʼять сповіщень.
 * Тепер усі приводи дня йдуть через один план: не більше `cap` відправок на
 * київську добу, а приводи понад стелю НЕ губляться, а згортаються в одне
 * сповіщення, яке перелічує всі.
 *
 * Тут немає ні БД, ні пушу: лише чисті функції над уже зібраними приводами,
 * як і в сусідньому `./due.ts`.
 */

import { QUIET_HOURS_END_KYIV, QUIET_HOURS_START_KYIV } from "./nudge.js";
import type { DueReminder } from "./due.js";

/** Одна запланована відправка: коли і які часи приводів вона покриває. */
export interface SendSlot {
  /** Київський `HH:MM`, у який sweep відправить це сповіщення. */
  sendAt: string;
  /** Часи приводів (`DueReminder.at`), згорнуті в цю відправку. */
  times: string[];
}

function toMinutes(hm: string): number {
  const [h = 0, m = 0] = hm.split(":").map(Number);
  return h * 60 + m;
}

function toHm(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function isQuietHm(hm: string): boolean {
  const hour = Math.floor(toMinutes(hm) / 60);
  return hour >= QUIET_HOURS_START_KYIV || hour < QUIET_HOURS_END_KYIV;
}

/**
 * Час відправки згорнутої групи: середина між першим і останнім приводом.
 *
 * Це свідомий компроміс зі спеки: ранкова звичка і вечірнє тренування в
 * одному пуші означають, що комусь із них час не підходить, і альтернатива
 * (пріоритет) губила б привід.
 *
 * Тихі години: середина, яку обрав продукт, не має права впасти в
 * [22:00, 08:00), навіть якщо обидва краї поза вікном не лежать поруч
 * (наприклад 07:00 і 23:30). Тоді беремо найближчий до середини час, який
 * людина обрала сама і який лежить поза вікном; якщо таких нема, людина
 * сама поставила все в ніч, і лишається її перший час.
 */
export function compromiseTime(times: readonly string[]): string {
  const sorted = [...times].sort();
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  const mid = toHm(Math.floor((toMinutes(first) + toMinutes(last)) / 2));
  if (!isQuietHm(mid)) return mid;
  const awake = sorted.filter((t) => !isQuietHm(t));
  if (awake.length === 0) return first;
  const target = toMinutes(mid);
  return awake.reduce((best, t) =>
    Math.abs(toMinutes(t) - target) < Math.abs(toMinutes(best) - target)
      ? t
      : best,
  );
}

/**
 * План відправок на добу.
 *
 * Поки різних часів не більше за стелю, кожен час лишається власною
 * відправкою рівно тоді, коли людина його поставила. Понад стелю часи
 * ріжуться на `cap` суцільних груп по найбільших проміжках між сусідами:
 * так ранкові приводи лишаються разом із ранковими, а вечірні з вечірніми,
 * і компромісний час зсуває кожен привід якнайменше.
 */
export function planSends(times: readonly string[], cap: number): SendSlot[] {
  if (cap <= 0) return [];
  const unique = [...new Set(times)].sort();
  if (unique.length <= cap) {
    return unique.map((t) => ({ sendAt: t, times: [t] }));
  }
  const cuts = unique
    .slice(1)
    .map((t, i) => ({
      after: i,
      gap: toMinutes(t) - toMinutes(unique[i]!),
    }))
    // При рівних проміжках ріжемо раніше: детермінізм важливіший за вибір,
    // бо план перераховується щохвилини і має давати той самий результат.
    .sort((a, b) => b.gap - a.gap || a.after - b.after)
    .slice(0, cap - 1)
    .map((c) => c.after)
    .sort((a, b) => a - b);

  const slots: SendSlot[] = [];
  let start = 0;
  for (const cut of [...cuts, unique.length - 1]) {
    const group = unique.slice(start, cut + 1);
    slots.push({
      sendAt: group.length === 1 ? group[0]! : compromiseTime(group),
      times: group,
    });
    start = cut + 1;
  }
  return slots;
}

/** Ключ слота бюджету в `push_reminder_log`: `k`-та відправка доби. */
export function budgetSlotKey(dayKey: string, k: number): string {
  return `push-budget-${dayKey}-${k}`;
}

export interface CollapsedPush {
  title: string;
  body: string;
  tag: string;
  url: string;
  module: string;
}

/**
 * Одне сповіщення з кількох приводів.
 *
 * Один привід їде як є: той самий `tag`, що ставить клієнтський таймер
 * відкритої вкладки, тож банери склеюються, як і до бюджету. Кілька
 * приводів перелічуються в тілі; нудж Сержанта, якщо він серед них, веде
 * заголовок, бо його текст особистий, а решта це список справ.
 */
export function collapseReminders(
  reasons: readonly DueReminder[],
  dayKey: string,
  sendAt: string,
): CollapsedPush {
  const [only] = reasons;
  if (reasons.length === 1 && only) {
    return {
      title: only.title,
      body: only.body,
      tag: only.dedupKey,
      url: only.url,
      module: only.module,
    };
  }
  const nudge = reasons.find((r) => r.module === "sergeant");
  const labels = [
    ...new Set(
      reasons.filter((r) => r.module !== "sergeant").map((r) => r.label),
    ),
  ];
  const list = labels.length > 0 ? `Сьогодні: ${labels.join(", ")}.` : "";
  return {
    title: nudge ? nudge.title : "Нагадування",
    body: nudge ? [nudge.body, list].filter(Boolean).join("\n") : list,
    tag: `reminders-${dayKey}-${sendAt}`,
    url: "/",
    module: "reminders",
  };
}
