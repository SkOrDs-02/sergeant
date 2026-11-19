/**
 * Last validated: 2026-11-18
 * Status: Active
 *
 * Рядки картки «Що зʼявиться і коли» на порожньому хабі (С-4 (а), П-20 (А),
 * спека `docs/work/specs/hub-newcomer-card-and-insights.md`). Чиста функція:
 * кожен рядок має лише ту умову, за якої він правдивий для цієї людини, і
 * жодного нового порогу — число звʼязків це `CORRELATION_MIN_N`.
 */
import { CORRELATION_MIN_N } from "@sergeant/shared";

export type NewcomerTimelineRowId = "bankFacts" | "weekReport" | "links";

export interface NewcomerTimelineRow {
  id: NewcomerTimelineRowId;
  /** Числовий прогрес умови, коли він є (лише звʼязки). */
  progress?: { value: number; max: number } | undefined;
}

export interface NewcomerTimelineInput {
  activeModules: readonly string[];
  /** Людина увійшла: Monobank і звіт тижня потребують акаунта. */
  signedIn: boolean;
  /**
   * Monobank уже підключено (є мітка підключення або дзеркало банку): рядок
   * «одразу після підключення» тоді не про майбутнє, і його немає.
   */
  bankConnected?: boolean | undefined;
  /**
   * Дні, коли записи є у двох сферах (`newcomerLinkProgress.ts`). До
   * першого запису це 0 за визначенням, тож хаб передає 0, а не будує ряди
   * метрик заради нуля.
   */
  sharedDays: number;
}

export interface NewcomerTimelineVisibility {
  hasRealEntry: boolean;
  /** Перший тиждень (`isWithinChecklistWindow`, `CHECKLIST_MAX_AGE_DAYS`). */
  inFirstWeek: boolean;
  /** Знайдено помітний звʼязок; `null` — ще не пораховано. */
  linkFound: boolean | null;
}

/**
 * Скільки живе картка (В-1 → (Б), рішення founder-а 2026-11-18): до першого
 * запису — як смуга, яку вона замінила; після нього — увесь перший тиждень
 * або до першого знайденого звʼязку, і перший запис її більше не прибирає.
 * Поки звʼязки ще рахуються (`null`), картка чекає, щоб не мигнути.
 */
export function isNewcomerTimelineVisible({
  hasRealEntry,
  inFirstWeek,
  linkFound,
}: NewcomerTimelineVisibility): boolean {
  if (!hasRealEntry) return true;
  return inFirstWeek && linkFound === false;
}

/** Порядок: від найближчого до найдальшого (одразу → кінець тижня → 10 днів). */
export function buildNewcomerTimeline({
  activeModules,
  signedIn,
  bankConnected = false,
  sharedDays,
}: NewcomerTimelineInput): NewcomerTimelineRow[] {
  const rows: NewcomerTimelineRow[] = [];
  // Monobank підключається лише з акаунтом; FTUX-хаб гостя не кличе входити
  // (канон hub-coach, журнал 2026-11-17), тож рядок просто не показуємо.
  if (signedIn && !bankConnected && activeModules.includes("finyk")) {
    rows.push({ id: "bankFacts" });
  }
  // Автозвіт тижня гостю не генерується (журнал 2026-11-18, С-3 (а)).
  if (signedIn) rows.push({ id: "weekReport" });
  // Звʼязок це пара сфер: з одним модулем він не зʼявиться ніколи.
  if (activeModules.length >= 2) {
    rows.push({
      id: "links",
      progress: {
        value: Math.min(Math.max(0, sharedDays), CORRELATION_MIN_N),
        max: CORRELATION_MIN_N,
      },
    });
  }
  return rows;
}
