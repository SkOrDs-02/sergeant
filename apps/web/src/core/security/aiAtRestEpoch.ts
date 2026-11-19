// Епоха стирання і барʼєр запису AI-слотів. Тривіальний модуль без
// залежностей: його можуть тягнути eager-шляхи (вихід, зміна особи,
// перевірка анонімних залишків), не підтягуючи сам aiAtRest.
let epoch = 0;

/** Кличеться при масовому стиранні сирих ключів поза слотами. */
export function bumpAtRestWipeEpoch(): void {
  epoch += 1;
}

export function getAtRestWipeEpoch(): number {
  return epoch;
}

// ── барʼєр запису ───────────────────────────────────────────────────────────
//
// Шифрований запис слота доходить до сховища асинхронно. Якщо за цей час
// активна SQLite-партиція тимчасово стала чужою (перевірка анонімних
// залишків на виході перемикає її на `anon` і назад), запис акаунта A ліг би
// в анонімний kv_store. Ключ один на профіль, тож там він розшифровний.
// Тому на час такого вікна запис тримається: шифрування йде, а фізичний
// запис чекає зняття барʼєра.

let holds = 0;
let waiters: Array<() => void> = [];

/** Тримає фізичні записи слотів; повертає ідемпотентне «відпустити». */
export function holdAtRestWrites(): () => void {
  holds += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holds -= 1;
    if (holds === 0) {
      const ready = waiters;
      waiters = [];
      for (const fn of ready) fn();
    }
  };
}

/** Резолвиться, щойно барʼєр знято (одразу, якщо його немає). */
export function atRestWritesReleased(): Promise<void> {
  if (holds === 0) return Promise.resolve();
  return new Promise((resolve) => waiters.push(resolve));
}

/** Синхронно: чи тримається зараз барʼєр. */
export function atRestWritesHeld(): boolean {
  return holds > 0;
}
