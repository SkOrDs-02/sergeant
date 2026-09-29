/**
 * Журнал незастосованих SQLite-записів модулів (write-ahead у localStorage).
 *
 * AI-CONTEXT: запис модуля потрапляє в SQLite асинхронно (черга + воркер),
 * а UI підтверджує дію одразу. Сторінка, яку закрили чи перезавантажили
 * до того, як черга дійшла до SQL, губила запис назавжди (аудит 2026-09-28,
 * D1: на проді 3 з 3 на першому візиті). localStorage пишеться синхронно,
 * тож запис лягає сюди ДО асинхронної межі, знімається після застосування
 * І після того, як його рядок outbox для сервера ліг без помилки
 * (`core/syncEngine/outboxCheckpoint.ts`), а незнятий відтворюється на
 * наступному буті тим самим LWW-шляхом.
 *
 * Відтворення безпечне повторно: операції несуть ту саму `clientTs`, що й
 * первинний запуск, а LWW-захист адаптерів строго `>`, тож уже застосований
 * запис вдруге нічого не змінює. Неідемпотентні операції мусять мати
 * детермінований ключ: id подій комори видається до журналу, дельта стріку
 * Рутини має ключ від відмітки й часу.
 *
 * Ключ починається з `sergeant.`, тож вихід із акаунта
 * (`purgeAppOwnedLocalStorage`) чистить журнал разом з іншим.
 */
import { resolveLsStore } from "@shared/lib/storage/storage";

import { readActiveSqliteVfs } from "../db/storageBackendState";

export type DualWriteJournalModule =
  "finyk" | "nutrition" | "routine" | "fizruk";

export interface DualWriteJournalEntry<P = unknown> {
  readonly id: string;
  readonly module: DualWriteJournalModule;
  readonly userId: string;
  readonly payload: P;
}

export const DUAL_WRITE_JOURNAL_KEY = "sergeant.dual_write_journal_v1";

// ponytail: стеля проти розростання, якщо SQLite недоступна цілу сесію;
// найстаріші записи відкидаються. Нормальний стан журналу 0-2 записи.
const MAX_ENTRIES = 200;

let seq = 0;

function readAll(): DualWriteJournalEntry[] {
  const raw = resolveLsStore()?.getString(DUAL_WRITE_JOURNAL_KEY) ?? null;
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as DualWriteJournalEntry[]) : [];
  } catch {
    return [];
  }
}

function writeAll(entries: DualWriteJournalEntry[]): void {
  const store = resolveLsStore();
  if (!store) return;
  if (entries.length === 0) store.remove(DUAL_WRITE_JOURNAL_KEY);
  else store.setString(DUAL_WRITE_JOURNAL_KEY, JSON.stringify(entries));
}

/** Синхронно записати операцію до асинхронної межі. Повертає id для {@link ackDualWrite}. */
export function journalDualWrite<P>(
  module: DualWriteJournalModule,
  userId: string,
  payload: P,
): string {
  const id = `${Date.now().toString(36)}-${(seq++).toString(36)}`;
  try {
    const entries = readAll();
    entries.push({ id, module, userId, payload });
    writeAll(entries.slice(-MAX_ENTRIES));
  } catch {
    // Квота чи приватний режим: запис однаково піде асинхронним шляхом,
    // просто без страховки.
  }
  return id;
}

/**
 * Зняти запис після того, як SQLite його застосувала.
 *
 * AI-DANGER: база `:memory:` застосовує запис формально успішно, але він
 * помирає разом зі сторінкою. Знімати запис тоді означало б тихо його
 * загубити (планшет 2026-09-29: воркер мовчав 30 с після очищення даних
 * сайту, OPFS не відкрився, вода й прийом зникли після reload). Лишаємо в
 * журналі, і наступний бут з OPFS/kvvfs дограє його тим самим LWW-шляхом.
 * Guard стоїть тут, а не в модулях, бо через цю функцію йдуть усі чотири.
 */
export function ackDualWrite(id: string): void {
  if (readActiveSqliteVfs() === "memory") return;
  try {
    const entries = readAll();
    const next = entries.filter((e) => e.id !== id);
    if (next.length !== entries.length) writeAll(next);
  } catch {
    /* див. journalDualWrite */
  }
}

/** Незастосовані записи модуля для цієї людини, у порядку появи. */
export function pendingDualWrites<P>(
  module: DualWriteJournalModule,
  userId: string,
): DualWriteJournalEntry<P>[] {
  return readAll().filter(
    (e): e is DualWriteJournalEntry<P> =>
      e.module === module && e.userId === userId,
  );
}
