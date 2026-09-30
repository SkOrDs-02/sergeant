/**
 * Last validated: 2026-09-29
 * Status: Active
 *
 * Політика повторів відкриття бази у воркері. Винесена з `sqlite.ts`, щоб
 * порядок «спроба → пауза → спроба → фолбек» тестувався без WASM.
 *
 * Два незалежні види повтору:
 *
 * 1. Конкуренція за OPFS-пул (`isLockContention`) - до
 *    {@link OPFS_LOCK_RETRY_DELAYS_MS}.length коротких пауз.
 * 2. Таймаут відкриття (`SqliteWorkerOpenTimeoutError`) - РІВНО одна
 *    повторна спроба з новим воркером і коротшим таймаутом.
 *
 * AI-CONTEXT: бюджет холодного старту в найгіршому випадку -
 * `OPEN_TIMEOUT_MS` (30 с, перша спроба) + {@link OPEN_TIMEOUT_RETRY_PAUSE_MS}
 * + {@link OPEN_TIMEOUT_RETRY_TIMEOUT_MS} (10 с) = ~40,2 с, і лише тоді
 * memory-фолбек. Це на ~7 с менше за «повтор із повним таймаутом»
 * (~47 с), який раніше прибрали. Скінченність гарантує прапорець: другий
 * таймаут - одразу фолбек, а не третя спроба.
 *
 * AI-CONTEXT: спостереження з планшета (frontend.md § Хвости фіксу
 * SQLite) - після очищення даних сайту свіжий воркер міг висіти так само.
 * Повтор тут - гіпотеза «попередній документ ще тримав пул», а не доведений
 * фікс; якщо вона хибна, ціна - до ~10 с зайвого «Завантаження…».
 */
/**
 * Розпізнаємо за `name`, а не `instanceof`: клас живе в лінивому чанку
 * клієнта воркера, який цей файл навмисно не імпортує.
 */
const OPEN_TIMEOUT_ERROR_NAME = "SqliteWorkerOpenTimeoutError";

function isOpenTimeout(err: unknown): boolean {
  return err instanceof Error && err.name === OPEN_TIMEOUT_ERROR_NAME;
}

/**
 * Паузи між спробами взяти SAH-пул. Дві, і обидві короткі.
 *
 * AI-CONTEXT: пул захоплює `FileSystemSyncAccessHandle` на СВОЇ файли в
 * `SAH_POOL_DIRECTORY`, тож два власники пулу в одному origin виключають
 * один одного. Найчастіший конкурент - воркер ПОПЕРЕДНЬОГО завантаження цієї
 * ж сторінки: браузер звільняє його хендли, лише коли добиває потік. Прод
 * 2026-09-21 (Chrome 151, Android): `createSyncAccessHandle` кидав «Access
 * Handles cannot be created…» через 70 мс після старту, і через одну спробу
 * вся сесія лишалась на kvvfs. Закривати пул на `pagehide` не можна: закриття
 * асинхронне, і сторінка, яку вивантажують, відповіді не дочекається.
 */
export const OPFS_LOCK_RETRY_DELAYS_MS = [150, 400] as const;

/** Пауза між таймаутом і повторним відкриттям: воркер-невдаха встигає померти. */
export const OPEN_TIMEOUT_RETRY_PAUSE_MS = 200;

/** Таймаут повторної спроби - коротший за перший (30 с). */
export const OPEN_TIMEOUT_RETRY_TIMEOUT_MS = 10_000;

export interface WorkerOpenAttemptOptions {
  /** Лише для повторної спроби після таймауту. */
  readonly openTimeoutMs?: number;
}

export interface WorkerOpenRetryHooks {
  isLockContention(err: unknown): boolean;
  onRetry(info: {
    reason: "lock" | "timeout";
    attempt: number;
    delayMs: number;
  }): void;
  /** Викликається перед поверненням `null`: рішення про фолбек ухвалює виклик. */
  onGiveUp(err: unknown): void;
  sleep?(ms: number): Promise<void>;
}

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function openWithRetry<T>(
  attempt: (options: WorkerOpenAttemptOptions) => Promise<T>,
  hooks: WorkerOpenRetryHooks,
): Promise<T | null> {
  const sleep = hooks.sleep ?? defaultSleep;
  let lockRetries = 0;
  let timeoutRetried = false;
  let options: WorkerOpenAttemptOptions = {};
  for (let n = 1; ; n++) {
    try {
      return await attempt(options);
    } catch (err) {
      const lockDelay = OPFS_LOCK_RETRY_DELAYS_MS[lockRetries];
      if (lockDelay !== undefined && hooks.isLockContention(err)) {
        lockRetries++;
        hooks.onRetry({ reason: "lock", attempt: n, delayMs: lockDelay });
        await sleep(lockDelay);
        continue;
      }
      if (isOpenTimeout(err) && !timeoutRetried) {
        timeoutRetried = true;
        options = { openTimeoutMs: OPEN_TIMEOUT_RETRY_TIMEOUT_MS };
        hooks.onRetry({
          reason: "timeout",
          attempt: n,
          delayMs: OPEN_TIMEOUT_RETRY_PAUSE_MS,
        });
        await sleep(OPEN_TIMEOUT_RETRY_PAUSE_MS);
        continue;
      }
      hooks.onGiveUp(err);
      return null;
    }
  }
}
