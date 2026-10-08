import type { SyncV2PullOp, SyncV2PullResponse } from "@sergeant/api-client";
import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";

import { applyPullOp } from "./applyPullOp.js";
import { readPullSinceCursor, writePullSinceCursor } from "./syncOpCursor.js";
import { refreshCachesAfterPull } from "./refreshCachesAfterPull.js";
import { classifyTickError, readOnlineStatus } from "./tickErrorReport.js";
import {
  markInitialPullComplete,
  reconcileInitialPull,
  resetInitialPull,
} from "./initialPullState.js";

// data-04: стан «початковий pull завершено» живе в окремому модулі без
// імпортів (його читає lazy-чанк Їжі), а звідси лише реекспортується.
export {
  getInitialPullVersion,
  hasCompletedInitialPull,
  subscribeInitialPull,
} from "./initialPullState.js";

export interface SyncEnginePullResult {
  readonly pulled: number;
  readonly applied: number;
  readonly skipped: number;
  /**
   * Опи, які `applyPullOp` відхилив термінально. Жоден споживач `pullOnce`
   * це поле не читає, і це свідомо: сигнал іде в Sentry негайно, з місця
   * події — див. `reportPullRejection`. Не покладайся на це число як на
   * канал сповіщення; додаєш споживача — додавай і те, що він із ним
   * робить.
   */
  readonly rejected: number;
  readonly lastOpId: number;
}

export interface SyncEngineReaderRuntime {
  start(): void;
  stop(): void;
  pullOnce(): Promise<SyncEnginePullResult>;
}

export interface SyncEngineReaderDeps {
  readonly pull: (
    since: number,
    options: { limit: number; originDeviceId: string },
  ) => Promise<SyncV2PullResponse>;
  readonly resolveClient: () => Promise<SqliteMigrationClient>;
  readonly resolveUserId: () => Promise<string | null>;
  readonly originDeviceId: string;
  readonly setInterval: (handler: () => void, ms: number) => unknown;
  readonly clearInterval: (handle: unknown) => void;
  readonly eventTarget: {
    addEventListener: (
      type: string,
      listener: () => void,
      options?: { passive?: boolean },
    ) => void;
    removeEventListener: (type: string, listener: () => void) => void;
  };
  readonly intervalMs: number;
  readonly limit: number;
  /**
   * Канал обсервабіліті тіка. Крім помилок самого тіка сюди їде КОЖНЕ
   * термінальне відхилення опа на застосуванні (`reportPullRejection`) —
   * без цього невідома таблиця означала мовчазну втрату даних.
   */
  readonly captureException?: (
    error: unknown,
    context?: Record<string, unknown>,
  ) => void;
}

/**
 * Термінальне відхилення на PULL-шляху — у Sentry, іменем таблиці й опа.
 *
 * Чому саме звіт, а не «не просувати курсор». Розглядались два варіанти.
 *
 *   (а) Тримати `maxOpId` по останньому суцільному ЗАСТОСОВАНОМУ префіксу,
 *       тобто не переступати через `rejected`. Коректніше на папері — і
 *       рівно тому небезпечно тут. `rejected` на pull-шляху означає
 *       передусім «таблиці немає в `CLIENT_PULL_SUPPORTED_TABLES` ЦЬОГО
 *       білда» (`applyPullOp`), а це стан клієнта, старшого за сервер. Такий
 *       оп не стане застосовним ніколи, тож курсор застрягне на ньому
 *       НАЗАВЖДИ і пристрій перестане тягнути взагалі все — повна зупинка
 *       синку замість часткової. Обидва відомі інциденти
 *       (`fizruk_custom_activities`, `fizruk_injuries` — див. коментарі в
 *       `applyPullOp.ts`) були рівно цим випадком, тобто варіант (а) там не
 *       врятував би дані, а вимкнув би синк цілком.
 *   (б) Лишити просування і зробити відхилення ГУЧНИМ. Обидва інциденти
 *       існували не тому, що дані не доїхали, а тому, що ніхто не знав, що
 *       вони не доїхали: `SyncEnginePullResult.rejected` не читає жоден
 *       споживач (`useAppEffects`, `singleton`, `useBulkImport`,
 *       `anonymousDataMigration` — усі ігнорують результат). Один
 *       `captureException` із `table`/`op` знімає саме цю сліпоту, і саме
 *       він закрив би обидва інциденти в день появи.
 *
 * Обрано (б) — дзеркало `reportTerminalRejection` із push-шляху
 * (`singleton.ts`). Таблиця й тип операції йдуть у ЗАГОЛОВОК помилки, а не
 * лише в теги: Sentry групує issue за текстом, тож без цього відхилення
 * різних сутностей злипаються в одну issue без предмета.
 *
 * `row` (payload) сюди НЕ потрапляє навмисно: там суми, назви й нотатки
 * користувача, а це прямий шлях у Sentry повз redaction (Hard Rule #21).
 */
function reportPullRejection(
  deps: SyncEngineReaderDeps,
  op: SyncV2PullOp,
): void {
  if (!deps.captureException) return;
  try {
    deps.captureException(
      new Error(`sync pull op rejected: ${op.table}.${op.op}`),
      {
        scope: "sync-v2-pull-apply",
        tags: {
          area: "sync",
          sync_direction: "pull",
          sync_table: op.table,
          sync_op: op.op,
        },
        opId: op.id,
      },
    );
  } catch {
    /* обсервабіліті ніколи не має ламати шлях читання */
  }
}

/**
 * Виняток із `applyPullOp` (CHECK, NOT NULL, I/O у SQLite) — у Sentry, іменем
 * таблиці й опа, і з текстом помилки.
 *
 * AI-CONTEXT (rel-11): без цього виняток вилітав із циклу сторінки, курсор
 * не писався, і наступний тік брав ту саму сторінку та падав на тому ж опі:
 * пристрій назавжди переставав отримувати зміни, а неідемпотентні опи ДО
 * отруйного (`routine_streaks` `increment`) застосовувались повторно щотіку.
 * Тепер такий оп рахується як `rejected` (той самий принцип «просуваємось і
 * галасуємо», що й у `reportPullRejection`), а курсор іде далі.
 *
 * `row` сюди НЕ потрапляє (Hard Rule #21); текст помилки SQLite називає
 * обмеження чи колонку, але не значення.
 */
function reportPullApplyFailure(
  deps: SyncEngineReaderDeps,
  op: SyncV2PullOp,
  error: unknown,
): void {
  if (!deps.captureException) return;
  const reason = error instanceof Error ? error.message : String(error);
  try {
    deps.captureException(
      new Error(`sync pull op apply threw: ${op.table}.${op.op}: ${reason}`),
      {
        scope: "sync-v2-pull-apply",
        tags: {
          area: "sync",
          sync_direction: "pull",
          sync_table: op.table,
          sync_op: op.op,
        },
        opId: op.id,
      },
    );
  } catch {
    /* обсервабіліті ніколи не має ламати шлях читання */
  }
}

/**
 * Скільки разів один `pullOnce` згоден перечекати рейт-ліміт.
 *
 * AI-CONTEXT: догін порожнього курсора йде сторінками через увесь
 * `sync_op_log` акаунта, і на дорослому акаунті це сотні запитів підряд
 * проти бюджету `api:v2:sync` (60/хв, `apps/server/src/routes/sync.ts`).
 * Прод 2026-09-21: 107 запитів за 1 хв 33 с, далі 429 — і крок
 * `pull-before` анонімної міграції падав, замикаючи людину на блокуючому
 * екрані. Курсор пишеться після КОЖНОЇ сторінки, тож прогрес не губиться
 * і без цих пауз; вони потрібні, щоб один прохід ДОХОДИВ до кінця, а не
 * віддавав помилку тому, хто на нього чекає.
 *
 * Стеля скінченна навмисно: заклинити тік на невизначений час гірше, ніж
 * віддати помилку — наступний тік продовжить із збереженого курсора.
 */
const MAX_RATE_LIMIT_WAITS = 3;

/** Скільки чекати найдовше, хай що каже `Retry-After`. */
const MAX_RATE_LIMIT_WAIT_MS = 60_000;

/** Дефолт, коли сервер сказав 429, але заголовка не дав. */
const DEFAULT_RATE_LIMIT_WAIT_MS = 5_000;

/**
 * Пауза, яку просить рейт-ліміт, або `null`, якщо помилка не про це.
 *
 * Перевірка структурна: reader не тягне `ApiError` як значення (він тут
 * лише в `import type`), а форма поля стабільна — `retryAfterMs` існує
 * саме для такого targeted backoff.
 */
function rateLimitWaitMs(error: unknown): number | null {
  if (typeof error !== "object" || error === null) return null;
  const { status, retryAfterMs } = error as {
    status?: unknown;
    retryAfterMs?: unknown;
  };
  if (status !== 429 && status !== 503) return null;
  const requested =
    typeof retryAfterMs === "number" && retryAfterMs > 0
      ? retryAfterMs
      : DEFAULT_RATE_LIMIT_WAIT_MS;
  return Math.min(requested, MAX_RATE_LIMIT_WAIT_MS);
}

export function createSyncEngineReaderRuntime(
  deps: SyncEngineReaderDeps,
): SyncEngineReaderRuntime {
  let intervalHandle: unknown = null;
  let inflight: Promise<SyncEnginePullResult> | null = null;
  let started = false;

  /**
   * Таблиці, опи яких уже застосовано в SQLite, але кеші ще їх не бачили.
   *
   * AI-CONTEXT (data-04): множина живе МІЖ тіками. Тік, що впав на 3-й
   * сторінці, уже записав сторінки 1-2 у SQLite і зберіг курсор, але до
   * `refreshCachesAfterPull` не дійшов. Наступний тік продовжує з курсора і
   * бачить лише власні опи; будь-яка локальна множина тіка «забула б» ті
   * таблиці, кеш Їжі лишився б холодним, а `markInitialPullComplete` усе
   * одно спрацював би, і prefs-гейт відкрився б на дефолтах. Чиститься лише
   * ПІСЛЯ успішного refresh; прив'язана до (userId, client) як і сам прапор.
   */
  let pendingRefresh: {
    userId: string;
    client: SqliteMigrationClient;
    tables: Set<string>;
  } | null = null;

  const pullOnce = async (): Promise<SyncEnginePullResult> => {
    if (inflight) return inflight;

    inflight = (async () => {
      const userId = await deps.resolveUserId();
      if (!userId) {
        // Немає сесії (logout): прапор попереднього користувача не чинний.
        reconcileInitialPull(null, null);
        return {
          pulled: 0,
          applied: 0,
          skipped: 0,
          rejected: 0,
          lastOpId: 0,
        };
      }

      const client = await deps.resolveClient();
      // Інший користувач або нова партиція бази = початковий pull знову
      // «не завершено» (див. `initialPullState.ts`).
      reconcileInitialPull(userId, client);
      let since = await readPullSinceCursor(client, userId);
      let pulled = 0;
      let applied = 0;
      let skipped = 0;
      let rejected = 0;
      let maxOpId = since;
      if (
        pendingRefresh === null ||
        pendingRefresh.userId !== userId ||
        pendingRefresh.client !== client
      ) {
        pendingRefresh = { userId, client, tables: new Set<string>() };
      }
      const affectedTables = pendingRefresh.tables;

      let rateLimitWaits = 0;

      for (;;) {
        let page: SyncV2PullResponse;
        try {
          page = await deps.pull(since, {
            limit: deps.limit,
            originDeviceId: deps.originDeviceId,
          });
        } catch (error) {
          const waitMs = rateLimitWaitMs(error);
          if (waitMs === null || rateLimitWaits >= MAX_RATE_LIMIT_WAITS)
            throw error;
          rateLimitWaits += 1;
          await new Promise((resolve) => setTimeout(resolve, waitMs));
          continue;
        }

        for (const op of page.ops) {
          pulled += 1;
          maxOpId = Math.max(maxOpId, op.id);
          let outcome: Awaited<ReturnType<typeof applyPullOp>>;
          try {
            outcome = await applyPullOp(
              client,
              op,
              userId,
              deps.originDeviceId,
            );
          } catch (error) {
            // rel-11: отруйний оп не має заклинювати курсор. Без BEGIN/COMMIT
            // навмисно: спільне з'єднання SQLite пишуть і інші писарі, тож
            // транзакція поглинула б їхні записи.
            rejected += 1;
            reportPullApplyFailure(deps, op, error);
            continue;
          }
          if (outcome === "applied") {
            applied += 1;
            affectedTables.add(op.table);
            // `increment` не ідемпотентний: закриття вкладки посеред сторінки
            // повторило б його при наступному тіку. Курсор одразу після
            // застосування звужує вікно повтору до одного опа (опи сторінки
            // йдуть за зростанням `id`, тож усе до `maxOpId` уже оброблене).
            if (op.op === "increment") {
              await writePullSinceCursor(client, userId, maxOpId);
            }
          } else if (outcome === "skipped") {
            skipped += 1;
          } else {
            rejected += 1;
            reportPullRejection(deps, op);
          }
        }

        if (page.ops.length > 0) {
          since = maxOpId;
          await writePullSinceCursor(client, userId, maxOpId);
        }

        if (page.next_cursor === null) break;
        since = page.next_cursor;
      }

      // Не `applied > 0`: у множині можуть лежати таблиці з попереднього
      // невдалого тіка (див. `pendingRefresh`).
      if (affectedTables.size > 0) {
        await refreshCachesAfterPull(client, userId, new Set(affectedTables));
        affectedTables.clear();
      }

      // Сюди доходимо лише через `break` на `next_cursor === null` (будь-яка
      // помилка вилітає вище). Ставимо ПІСЛЯ оновлення кешів, щоб споживач,
      // який побачив прапор, уже читав прогрітий кеш.
      markInitialPullComplete(userId, client);

      return {
        pulled,
        applied,
        skipped,
        rejected,
        lastOpId: maxOpId,
      };
    })()
      .catch((error: unknown) => {
        // Той самий класифікатор, що й у push-тіку: офлайн — не помилка.
        // Тут немає breadcrumb-каналу в deps, тож офлайн просто не
        // репортиться; лічильники тіка й далі веде викликач.
        const verdict = classifyTickError(
          error,
          "sync-v2-pull-tick",
          readOnlineStatus(),
        );
        if (verdict.report) {
          deps.captureException?.(error, verdict.context);
        }
        throw error;
      })
      .finally(() => {
        inflight = null;
      });

    return inflight;
  };

  const scheduleTick = (): void => {
    void pullOnce().catch(() => {
      /* errors routed via captureException */
    });
  };

  const onVisibility = (): void => {
    if (
      typeof document !== "undefined" &&
      document.visibilityState === "visible"
    ) {
      scheduleTick();
    }
  };

  return {
    start() {
      if (started) return;
      started = true;
      scheduleTick();
      intervalHandle = deps.setInterval(scheduleTick, deps.intervalMs);
      deps.eventTarget.addEventListener("visibilitychange", onVisibility);
    },
    stop() {
      if (!started) return;
      started = false;
      pendingRefresh = null;
      resetInitialPull();
      if (intervalHandle !== null) {
        deps.clearInterval(intervalHandle);
        intervalHandle = null;
      }
      deps.eventTarget.removeEventListener("visibilitychange", onVisibility);
    },
    pullOnce,
  };
}
