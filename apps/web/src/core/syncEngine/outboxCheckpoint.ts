/**
 * Чекпоінт для записів у `sync_op_outbox`, які адаптери ставлять
 * fire-and-forget.
 *
 * AI-CONTEXT: журнал модулів (`core/durability/dualWriteJournal.ts`)
 * знімав запис, щойно SQLite застосувала операцію, а рядок outbox для
 * сервера на той момент міг ще не лягти. Вкладка, закрита в цьому вікні,
 * лишала запис тільки локальним: журналу вже нема, outbox порожній
 * (ревʼю Codex, аудит 2026-09-28). Тепер модуль бере чекпоінт до запуску
 * і знімає журнал лише тоді, коли всі поставлені з того моменту записи
 * outbox завершились без помилки.
 */

let pending: Promise<unknown> = Promise.resolve();
let failures = 0;

/** Зареєструвати запис outbox, на який має почекати наступний чекпоінт. */
export function trackOutboxWrite(write: Promise<unknown>): void {
  pending = Promise.all([
    pending,
    write.then(undefined, () => {
      failures++;
    }),
  ]);
}

/**
 * Зняти мітку до запису. Повернена функція резолвиться `true`, коли всі
 * записи outbox, поставлені до її виклику, завершились і жоден не впав
 * відтоді, як мітку знято. Збій чужого модуля в тому ж вікні теж дає
 * `false`: запис лишиться в журналі, а повтор безпечний.
 */
export function outboxCheckpoint(): () => Promise<boolean> {
  const before = failures;
  return () => pending.then(() => failures === before);
}
