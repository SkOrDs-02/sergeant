/**
 * Last validated: 2026-11-21
 * Status: Active
 *
 * Прапор «початковий pull завершено» для поточного користувача (data-04).
 *
 * AI-CONTEXT: на новому пристрої локальний SQLite-бут завершується з ПОРОЖНЬОЮ
 * базою ще до першого pull, тож «кеш прогрітий» (`refreshedAt !== null`) не
 * означає «дані акаунта вже тут». Whole-blob рядки (`nutrition_prefs`, список
 * покупок, вода) сервер замінює цілком за LWW по `client_ts`, а запис із
 * дефолтів на холодному кеші має свіжий `client_ts` і перемагає справжній
 * рядок на всіх пристроях. Єдиний чесний сигнал «нічого не пропущено» — pull
 * дійшов до `next_cursor === null` (`syncEngineReader.pullOnce`).
 *
 * AI-DANGER: цей файл НЕ має імпортів (крім типів) навмисно. Його читає
 * lazy-чанк Їжі і пише reader у eager-шляху: будь-який зайвий імпорт тут
 * перекроює чанки (див. коментар про TDZ у `syncableUserId.ts`).
 *
 * Прапор прив'язаний до пари (userId, client): інший користувач, нова
 * партиція бази (logout → `wipeSqliteDb` віддає новий handle, а отже новий
 * client) або logout (`pullOnce` без сесії) скидають його.
 */

interface CompletedPull {
  readonly userId: string;
  /** Опак: порівнюється лише за ідентичністю. */
  readonly client: unknown;
}

let completed: CompletedPull | null = null;
let version = 0;

/**
 * Що показувати замість порожнього стану модуля, поки копія ще жодного разу
 * не наздогнала акаунт (data-59/60): `idle` — нічого (аноніми, копія вже
 * наповнена попереднім pull-ом, pull завершено), `loading` — перший pull іде
 * або чекає повтору, `failed` — повтори вичерпано, показуємо помилку з «Ще раз».
 *
 * AI-CONTEXT: на відміну від `completed`, це про ВІДОБРАЖЕННЯ, а не про гейти
 * запису. Наповнена копія (`replicaBootstrap` = done) лишається `idle` навіть
 * офлайн: її порожній стан правдивий, і заклик «Додай першу…» там доречний.
 */
export type FirstPullPhase = "idle" | "loading" | "failed";

let firstPullPhase: FirstPullPhase = "idle";
let firstPullFailures = 0;

function setFirstPullPhase(next: FirstPullPhase): void {
  if (firstPullPhase === next) return;
  firstPullPhase = next;
  bump();
}
const listeners = new Set<() => void>();

function bump(): void {
  version += 1;
  for (const listener of [...listeners]) {
    try {
      listener();
    } catch {
      /* підписник не має ламати шлях читання */
    }
  }
}

/**
 * Початковий pull для `userId` на `client` дійшов до кінця оп-логу.
 * Викликати лише після виходу з циклу на `next_cursor === null`.
 */
export function markInitialPullComplete(userId: string, client: unknown): void {
  if (
    completed !== null &&
    completed.userId === userId &&
    completed.client === client
  ) {
    return;
  }
  completed = { userId, client };
  firstPullFailures = 0;
  firstPullPhase = "idle";
  bump();
}

/**
 * Звірити прапор з поточним станом на початку тіка: інший користувач, інший
 * client або відсутня сесія (`userId === null`, logout) скидають його.
 */
export function reconcileInitialPull(
  userId: string | null,
  client: unknown,
): void {
  if (completed === null) return;
  if (
    userId !== null &&
    completed.userId === userId &&
    completed.client === client
  ) {
    return;
  }
  resetInitialPull();
}

/** Скинути прапор (logout, зупинка reader-а, тести). */
export function resetInitialPull(): void {
  firstPullFailures = 0;
  if (completed === null && firstPullPhase === "idle") return;
  completed = null;
  firstPullPhase = "idle";
  bump();
}

/** Тік почав тягнути копію, яку ще жодного разу не наповнював повний pull. */
export function markFirstPullPending(): void {
  setFirstPullPhase("loading");
}

/** Копія вже наповнена або сесії немає: порожній стан модуля правдивий. */
export function markFirstPullSettled(): void {
  firstPullFailures = 0;
  setFirstPullPhase("idle");
}

/**
 * Тік першого pull упав. Повертає номер невдачі (1, 2, …); після
 * `maxRetries` повторів фаза стає `failed`. Поза першим pull (`idle`) нічого
 * не рахує і повертає 0: звичайний збій тіка чекає наступного інтервалу.
 */
export function noteFirstPullFailure(maxRetries: number): number {
  if (firstPullPhase === "idle") return 0;
  firstPullFailures += 1;
  if (firstPullFailures > maxRetries) setFirstPullPhase("failed");
  return firstPullFailures;
}

export function getFirstPullPhase(): FirstPullPhase {
  return firstPullPhase;
}

/**
 * Чи завершився початковий pull. З `userId` — саме для цього користувача;
 * без нього — для будь-якого (використовується, поки auth ще резолвиться і
 * id невідомий).
 */
export function hasCompletedInitialPull(userId?: string): boolean {
  if (completed === null) return false;
  return userId === undefined || completed.userId === userId;
}

/** Монотонний лічильник змін прапора: `useSyncExternalStore`-снапшот. */
export function getInitialPullVersion(): number {
  return version;
}

export function subscribeInitialPull(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test-only: повний скид стану разом із підписниками. */
export function __resetInitialPullStateForTests(): void {
  completed = null;
  version = 0;
  firstPullPhase = "idle";
  firstPullFailures = 0;
  listeners.clear();
}
