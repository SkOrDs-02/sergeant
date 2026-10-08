/**
 * Last validated: 2026-10-08
 * Status: Active
 *
 * Одноразовий стартовий тік для Tier-A полерів (`setInterval` + `unref()`).
 *
 * ЧОМУ це існує (аудит 2026-10-01, rel-19). Полер, що має лише
 * `setInterval(…, intervalMs)`, вперше спрацьовує через ПОВНИЙ інтервал
 * після старту процесу. Контейнер же рестартує на кожен деплой (ENTRYPOINT,
 * кілька деплоїв на день), тож годинний інтервал скидається щоразу, і в дні
 * активних деплоїв GDPR-черга, добивач видалень акаунтів, retention та
 * архів логів зсуваються на години; Plata-звірка на 24 год не виконується
 * взагалі. `SilpoSyncPoller` цю хворобу лікує першим тіком із затримкою —
 * тут той самий прийом, винесений в один хелпер.
 *
 * Затримка з jitter (за замовчуванням 30-90 с), а не негайно: на старті
 * пул і міграції ще прогріваються, а кілька реплік / серія деплоїв не
 * мають бити в БД синхронно.
 *
 * Контракт `startDelayMs` в опціях полерів: `undefined` → випадкова затримка
 * з діапазону за замовчуванням; `0` або від'ємне → стартовий тік вимкнено
 * (так само, як `intervalMs: 0` вимикає сам полер; тести цим користуються).
 */

/** Нижня межа затримки першого тіку за замовчуванням. */
export const DEFAULT_STARTUP_DELAY_MIN_MS = 30_000;
/** Верхня межа затримки першого тіку за замовчуванням. */
export const DEFAULT_STARTUP_DELAY_MAX_MS = 90_000;

export interface StartupDelayRange {
  minMs: number;
  maxMs: number;
}

const DEFAULT_RANGE: StartupDelayRange = {
  minMs: DEFAULT_STARTUP_DELAY_MIN_MS,
  maxMs: DEFAULT_STARTUP_DELAY_MAX_MS,
};

/**
 * Затримка першого тіку в мс; `0` означає «не планувати».
 *
 * `explicit` з опцій полера має пріоритет (у тому числі `0` / від'ємне як
 * вимкнення); інакше — випадкове число з `range`.
 */
export function resolveStartupDelayMs(
  explicit: number | undefined,
  range: StartupDelayRange = DEFAULT_RANGE,
  random: () => number = Math.random,
): number {
  if (explicit !== undefined) {
    return Number.isFinite(explicit) && explicit > 0 ? explicit : 0;
  }
  const span = Math.max(0, range.maxMs - range.minMs);
  return Math.round(range.minMs + random() * span);
}

/**
 * Запланувати одноразовий тік. Повертає таймер (щоб `stop()` міг його
 * погасити через `clearTimeout`) або `null`, коли вимкнено (`delayMs <= 0`).
 *
 * `tick` має сам ловити помилки: хелпер лише ковтає відхилення промісу, щоб
 * `unhandledRejection` не вбив процес.
 */
export function scheduleStartupTick(
  delayMs: number,
  tick: () => void | Promise<unknown>,
  onError: (err: unknown) => void,
): NodeJS.Timeout | null {
  if (!(delayMs > 0)) return null;
  const timer = setTimeout(() => {
    try {
      void Promise.resolve(tick()).catch(onError);
    } catch (err) {
      onError(err);
    }
  }, delayMs);
  timer.unref?.();
  return timer;
}
