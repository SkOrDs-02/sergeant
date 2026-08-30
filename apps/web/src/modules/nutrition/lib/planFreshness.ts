/**
 * Last validated: 2026-08-10
 * Status: Active
 * Наскільки свіжий збережений план — і чи можна ще звати його «сьогоднішнім».
 *
 * План не протухає навмисно (`planStorage.ts`): тихо прибраний план для
 * користувача не відрізняється від зникнення, яке ми лагодили. Але з цього
 * випливає обовʼязок: якщо план лишається, треба чесно казати, коли його
 * зроблено. Інакше заголовок «Твій план на сьогодні» над учорашнім планом —
 * єдина брехня, яку користувач має шанс помітити.
 *
 * Межа доби — ПРИСТРІЙ, не Київ (ADR-0078): йдеться про особисту добу
 * людини, як і для відмітки звички чи логу їжі.
 */
import { deviceDayKey, previousDeviceDayKey } from "@sergeant/nutrition-domain";

const MONTHS_UK = [
  "січня",
  "лютого",
  "березня",
  "квітня",
  "травня",
  "червня",
  "липня",
  "серпня",
  "вересня",
  "жовтня",
  "листопада",
  "грудня",
] as const;

export interface PlanFreshness {
  /** `true`, якщо план зроблено НЕ сьогодні за годинником пристрою. */
  stale: boolean;
  /** Підпис під заголовком. `null`, коли план сьогоднішній. */
  label: string | null;
}

const FRESH: PlanFreshness = { stale: false, label: null };

/**
 * `savedAt` у мілісекундах, `now` — для тестів. Записи зі старих версій
 * можуть не мати мітки (`0` / `null`) — тоді мовчимо: «згенеровано 1 січня
 * 1970» гірше за відсутність підпису.
 */
export function describePlanFreshness(
  savedAt: number | null | undefined,
  now: Date = new Date(),
): PlanFreshness {
  if (!savedAt || !Number.isFinite(savedAt) || savedAt <= 0) return FRESH;

  const today = deviceDayKey(now);
  const saved = deviceDayKey(new Date(savedAt));
  if (saved === today) return FRESH;

  if (saved === previousDeviceDayKey(today)) {
    return { stale: true, label: "згенеровано вчора" };
  }

  // Рік не показуємо: план, старший за рік, — теоретична межа, а зайве
  // «2026» у підписі щодня коштує уваги на порожньому місці.
  const d = new Date(savedAt);
  /* eslint-disable sergeant-design/prefer-kyiv-time -- ADR-0078: дата в
     підписі мусить збігатися з тим, що людина назве «вчора» на цьому
     телефоні. Це особиста доба, як відмітка звички чи лог їжі, тож день
     належить ПРИСТРОЮ. Київський календар дав би «8 серпня» тому, хто
     ще живе 7-м, — і підпис суперечив би сусідньому «згенеровано вчора»,
     яке рахується через `deviceDayKey` вище. */
  const month = MONTHS_UK[d.getMonth()] ?? "";
  const label = `згенеровано ${d.getDate()} ${month}`;
  /* eslint-enable sergeant-design/prefer-kyiv-time */
  return { stale: true, label };
}
