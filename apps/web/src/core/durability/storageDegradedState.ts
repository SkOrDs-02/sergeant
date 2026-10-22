/**
 * Last validated: 2026-10-20
 * Status: Active
 *
 * Деградація сховища посеред сесії: SQL-запис упав (SQLITE_IOERR / FULL / BUSY,
 * квота), хоча база відкрилась нормально.
 *
 * AI-CONTEXT: аудит 2026-10-01, data-05. Адаптери dual-write ловлять виняток
 * кожного опа й лише рахують `errored`; журнал тепер не знімається (запис
 * дограється на наступному буті), але людина досі не знала, що зараз пишеться
 * не все. `MemoryOnlyStorageBanner` ловить лише «база відкрилась у памʼяті»,
 * а цей стан інший: база жива, тільки конкретний запис не ліг. Тому окремий
 * легкий стор без жодних імпортів (як `storageBackendState`): його читають UI
 * поверхні, а писар (`recordDualWriteOutcome`) про UI не знає.
 */

export interface StorageDegradedSnapshot {
  /** Є невдалий запис, після якого не було чистого. */
  readonly active: boolean;
  /** Росте з кожним новим збоєм: банер, який закрили, зʼявляється знову. */
  readonly seq: number;
  /**
   * `seq` збою, який людина закрила. Живе тут, а не в `useState` банера:
   * `ModuleShell` розмонтовується при переході між модулями, і локальний стан
   * повертав закритий банер без нового збою.
   */
  readonly dismissedSeq: number;
}

let snapshot: StorageDegradedSnapshot = {
  active: false,
  seq: 0,
  dismissedSeq: 0,
};
const listeners = new Set<() => void>();

function publish(next: StorageDegradedSnapshot): void {
  snapshot = next;
  for (const listener of listeners) listener();
}

/** Підписка для `useSyncExternalStore`. */
export function subscribeStorageDegraded(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function readStorageDegraded(): StorageDegradedSnapshot {
  return snapshot;
}

/** SQL відхилив `errored` опів пачки. Кожен збій піднімає `seq`. */
export function noteStorageWriteFailed(): void {
  publish({ ...snapshot, active: true, seq: snapshot.seq + 1 });
}

/**
 * Пачка лягла без жодного збою: сховище знову приймає записи (звільнили місце,
 * інша вкладка віддала пул), тож банер зникає сам.
 */
export function noteStorageWriteRecovered(): void {
  if (!snapshot.active) return;
  publish({ ...snapshot, active: false });
}

/**
 * Людина закрила банер саме для збою `seq`. Наступний збій (більший `seq`)
 * покаже його знову; `dismissedSeq` лише росте.
 */
export function dismissStorageDegraded(seq: number): void {
  if (seq <= snapshot.dismissedSeq) return;
  publish({ ...snapshot, dismissedSeq: seq });
}

/** Лише для тестів. */
export function __resetStorageDegradedForTests(): void {
  snapshot = { active: false, seq: 0, dismissedSeq: 0 };
  listeners.clear();
}
