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
   * Дні, коли записи є у двох сферах. Поки картка живе до першого запису
   * (спека, В-1 (А)), це 0 за визначенням, тож хаб передає 0, а не будує
   * ряди метрик заради нуля.
   */
  sharedDays: number;
}

/** Порядок: від найближчого до найдальшого (одразу → кінець тижня → 10 днів). */
export function buildNewcomerTimeline({
  activeModules,
  signedIn,
  sharedDays,
}: NewcomerTimelineInput): NewcomerTimelineRow[] {
  const rows: NewcomerTimelineRow[] = [];
  // Monobank підключається лише з акаунтом; FTUX-хаб гостя не кличе входити
  // (канон hub-coach, журнал 2026-11-17), тож рядок просто не показуємо.
  if (signedIn && activeModules.includes("finyk")) {
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
