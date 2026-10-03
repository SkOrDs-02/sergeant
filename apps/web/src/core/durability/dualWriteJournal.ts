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
import { addSentryBreadcrumb, captureException } from "../observability/sentry";

export type DualWriteJournalModule =
  "finyk" | "nutrition" | "routine" | "fizruk";

export interface DualWriteJournalEntry<P = unknown> {
  readonly id: string;
  readonly module: DualWriteJournalModule;
  readonly userId: string;
  readonly payload: P;
  /**
   * `true`, якщо запис «застосовано» в базі `:memory:` (див. {@link ackDualWrite}).
   * Такий запис знято з порожньої/негідрованої бази, тож модуль, який його
   * реплеїть на справжній базі, не має трактувати його як повну заміну
   * (data-10).
   */
  readonly appliedInMemory?: true;
  /**
   * Скільки разів запис дійшов до SQL і впав (`result.errored > 0`). Лише
   * невдачі: відтворення «в памʼять» чи без SQLite лічильник не чіпає, інакше
   * здоровий запис карантинувся б через кілька бутів на `:memory:`.
   */
  readonly attempts?: number;
}

export const DUAL_WRITE_JOURNAL_KEY = "sergeant.dual_write_journal_v1";
/** Запис, що вичерпав {@link MAX_DUAL_WRITE_FAILED_ATTEMPTS}: лежить тут для ручного розбору. */
export const DUAL_WRITE_QUARANTINE_KEY = "sergeant.dual_write_quarantine_v1";

/**
 * Скільки разів запис журналу може впасти в SQL, перш ніж його покладуть у
 * карантин. Постійна помилка (схема, constraint) інакше реплеїлась би на
 * кожному буті вічно, а відсікала б її лише стеля {@link MAX_ENTRIES}.
 */
export const MAX_DUAL_WRITE_FAILED_ATTEMPTS = 5;
const MAX_QUARANTINED = 20;

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
  if (readActiveSqliteVfs() === "memory") {
    markAppliedInMemory(id);
    return;
  }
  try {
    const entries = readAll();
    const next = entries.filter((e) => e.id !== id);
    if (next.length !== entries.length) writeAll(next);
  } catch {
    /* див. journalDualWrite */
  }
}

/**
 * data-10: позначити запис як застосований у memory-базі. Лишається в журналі
 * (див. AI-DANGER вище), але реплей на справжній базі бачить прапор.
 */
function markAppliedInMemory(id: string): void {
  try {
    const entries = readAll();
    let changed = false;
    const next = entries.map((e) => {
      if (e.id !== id || e.appliedInMemory) return e;
      changed = true;
      return { ...e, appliedInMemory: true as const };
    });
    if (changed) writeAll(next);
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

/** Звужена форма `DualWriteOutcome`, яку розуміє журнал. */
export interface DualWriteOutcomeLike {
  readonly status: string;
  readonly result?: { readonly errored?: number };
}

/**
 * `true`, коли SQL справді прийняв УСІ операції. `status: "applied"` цього не
 * гарантує: `createApplyOps.applyBestEffort` ловить виняток кожного опа,
 * лише рахує `errored` і повертає «applied». Тому ack і «durable»-підтвердження
 * UI мусять дивитись і на `errored` (аудит 2026-10-01, data-05).
 */
export function isDualWriteOutcomeClean(
  outcome: DualWriteOutcomeLike,
): boolean {
  return outcome.status === "applied" && (outcome.result?.errored ?? 0) === 0;
}

/**
 * Зафіксувати невдалу спробу запису журналу. Запис лишається для реплею на
 * наступному буті, доки не вичерпає {@link MAX_DUAL_WRITE_FAILED_ATTEMPTS}:
 * тоді він переїжджає в карантин, а в Sentry летить подія (без payload: там
 * дані користувача). Повертає `true`, якщо запис щойно карантинився.
 */
export function recordDualWriteFailure(
  module: DualWriteJournalModule,
  id: string,
): boolean {
  try {
    const entries = readAll();
    const idx = entries.findIndex((e) => e.id === id);
    const entry = entries[idx];
    if (!entry) return false;
    const attempts = (entry.attempts ?? 0) + 1;
    if (attempts < MAX_DUAL_WRITE_FAILED_ATTEMPTS) {
      entries[idx] = { ...entry, attempts };
      writeAll(entries);
      return false;
    }
    writeAll(entries.filter((e) => e.id !== id));
    quarantine({ ...entry, attempts });
    captureException(
      new Error(
        `dual-write journal entry quarantined after ${attempts} failed attempts`,
      ),
      { tags: { module, dualWriteQuarantine: "1" }, extra: { id, attempts } },
    );
    return true;
  } catch {
    /* див. journalDualWrite */
    return false;
  }
}

function quarantine(entry: DualWriteJournalEntry): void {
  const store = resolveLsStore();
  if (!store) return;
  let existing: unknown[] = [];
  try {
    const parsed: unknown = JSON.parse(
      store.getString(DUAL_WRITE_QUARANTINE_KEY) ?? "[]",
    );
    if (Array.isArray(parsed)) existing = parsed;
  } catch {
    /* зіпсований карантин перезаписуємо */
  }
  existing.push(entry);
  store.setString(
    DUAL_WRITE_QUARANTINE_KEY,
    JSON.stringify(existing.slice(-MAX_QUARANTINED)),
  );
}

/**
 * Підсумок спроби запису журналу: єдине місце, де оркестратори вирішують
 * «зняти чи лишити». Знімає лише чистий результат після того, як ліг рядок
 * outbox; `errored > 0` лишає запис для реплею (та сама `clientTs`, строгий
 * LWW `>` у адаптерах: уже застосовані опи стають no-op, впалі доїжджають) і
 * рахує невдачу. `skipped` (SQLite недоступна) журнал не чіпає.
 */
export function settleDualWriteEntry(
  module: DualWriteJournalModule,
  journalId: string | null,
  outcome: DualWriteOutcomeLike,
  outboxSettled: () => Promise<boolean>,
): void {
  if (!journalId) return;
  if (isDualWriteOutcomeClean(outcome)) {
    void outboxSettled().then((ok) => ok && ackDualWrite(journalId));
  } else if (outcome.status === "applied") {
    if (recordDualWriteFailure(module, journalId)) {
      addSentryBreadcrumb({
        category: "storage",
        level: "error",
        message: `dualwrite ${module} journal entry quarantined`,
        data: { module },
      });
    }
  }
}
