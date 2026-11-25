import type {
  SyncV2PullOp,
  SyncV2PullResponse,
  SyncV2SnapshotOptions,
  SyncV2SnapshotResponse,
} from "@sergeant/api-client";
import { isSyncCursorExpiredError } from "@sergeant/api-client";
import { restoreFromSnapshot } from "./snapshotRestore.js";
import {
  markReplicaBootstrapDone,
  REPLICA_BOOTSTRAP_ORIGIN,
  resolvePullMode,
  skipDuringBootstrap,
} from "./replicaBootstrap.js";
import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";

import { applyPullOp } from "./applyPullOp.js";
import { readPullSinceCursor, writePullSinceCursor } from "./syncOpCursor.js";
import {
  backfillTxNotesOnce,
  markTxNotesBackfillDone,
} from "./txNotesBackfill.js";
import { refreshCachesAfterPull } from "./refreshCachesAfterPull.js";
import { classifyTickError, readOnlineStatus } from "./tickErrorReport.js";
import {
  getFirstPullPhase,
  markFirstPullPending,
  markFirstPullSettled,
  markInitialPullComplete,
  noteFirstPullFailure,
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

/**
 * Паузи між повторами першого pull (data-59/60, рішення власника 2026-11-21).
 *
 * AI-CONTEXT: без них невдалий перший pull на новому пристрої чекав
 * наступного інтервалу (~60 с ±20%), а модулі тим часом показували заклик
 * «Додай першу…», і людина вводила наново те, що вже є на сервері. Після
 * останнього повтору фаза стає `failed`, і порожній стан модуля показує
 * помилку з «Ще раз». Діє лише для копії, яку ще не наповнював повний pull:
 * звичайний збій тіка, як і раніше, чекає інтервалу.
 */
export const FIRST_PULL_RETRY_DELAYS_MS: readonly number[] = [
  2_000, 5_000, 15_000,
];

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
  /**
   * Бар'єр для перемикання активної SQLite-партиції (`data-46`): дочікується
   * pull-а, що вже йде, і до виклику повернутої функції `pullOnce` нічого не
   * пише. Інакше pull, що стартував у вікні перемикання, взяв би `userId`
   * сесії, а клієнта вже іншої партиції, і записав би чужі рядки. Паузи
   * вкладаються; стан початкового pull і таймер не чіпаються, на відміну від
   * `stop()`.
   */
  pause(): Promise<() => void>;
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
  /** Таймер повтору першого pull; за замовчуванням глобальний `setTimeout`. */
  readonly setTimeout?: (handler: () => void, ms: number) => unknown;
  readonly clearTimeout?: (handle: unknown) => void;
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
   * Знімок стану сервера (`GET /api/v2/sync/snapshot`). Потрібен, коли pull
   * відповідає `410 sync_cursor_expired`: журнал обрізано нижче курсора, і
   * дочитати його вже неможливо (`snapshotRestore.ts`). Без цієї залежності
   * 410 лишається звичайною помилкою тіка.
   */
  readonly snapshot?: (
    opts: SyncV2SnapshotOptions,
  ) => Promise<SyncV2SnapshotResponse>;
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
 * Термінальне порушення constraint у `applyPullOp` — у Sentry, іменем
 * таблиці й опа, і з текстом помилки.
 *
 * AI-CONTEXT (rel-11): без цього виняток вилітав із циклу сторінки, курсор
 * не писався, і наступний тік брав ту саму сторінку та падав на тому ж опі:
 * пристрій назавжди переставав отримувати зміни, а неідемпотентні опи ДО
 * отруйного (`routine_streaks` `increment`) застосовувались повторно щотіку.
 * Такий оп рахується як `rejected` (той самий принцип «просуваємось і
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

/** Only a deterministic constraint violation can be skipped permanently. */
function isConstraintFailure(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const { code, resultCode } = error as {
    code?: unknown;
    resultCode?: unknown;
  };
  return (
    (typeof code === "string" && code.startsWith("SQLITE_CONSTRAINT")) ||
    (typeof resultCode === "number" && (resultCode & 0xff) === 19)
  );
}

/**
 * Скільки разів один `pullOnce` згоден перечекати рейт-ліміт.
 *
 * AI-CONTEXT: догін порожнього курсора йде сторінками через увесь
 * `sync_op_log` акаунта, і на дорослому акаунті це сотні запитів підряд
 * проти бюджету `api:v2:sync:pull` (60/хв, окремий від push, `apps/server/src/routes/sync.ts`).
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
  // AI-CONTEXT (bv-first-pull-gaps): на першому pull 503 не перечікуємо в
  // тіку. Інакше кожен тік ковтав по три паузи, і до «Не вдалося» людина
  // чекала ~16 запитів за хвилину з порожнім станом, а 500 давав це за 4.
  // Тепер 503 одразу йде в бюджет повторів першого pull, а `Retry-After`
  // шанує `scheduleFirstPullRetry`. 429 і далі перечікуємо: це справжній
  // рейт-ліміт, і довгий догін має доходити до кінця.
  if (status === 503 && getFirstPullPhase() === "loading") return null;
  const requested =
    typeof retryAfterMs === "number" && retryAfterMs > 0
      ? retryAfterMs
      : DEFAULT_RATE_LIMIT_WAIT_MS;
  return Math.min(requested, MAX_RATE_LIMIT_WAIT_MS);
}

/** `Retry-After` з помилки (мс, зі стелею), або 0, якщо сервер його не дав. */
function retryAfterFloorMs(error: unknown): number {
  if (typeof error !== "object" || error === null) return 0;
  const { retryAfterMs } = error as { retryAfterMs?: unknown };
  if (typeof retryAfterMs !== "number" || retryAfterMs <= 0) return 0;
  return Math.min(retryAfterMs, MAX_RATE_LIMIT_WAIT_MS);
}

export function createSyncEngineReaderRuntime(
  deps: SyncEngineReaderDeps,
): SyncEngineReaderRuntime {
  let intervalHandle: unknown = null;
  let retryHandle: unknown = null;
  let inflight: Promise<SyncEnginePullResult> | null = null;
  let started = false;
  let pauses = 0;

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
    if (pauses > 0) {
      return { pulled: 0, applied: 0, skipped: 0, rejected: 0, lastOpId: 0 };
    }

    inflight = (async () => {
      const userId = await deps.resolveUserId();
      if (!userId) {
        // Немає сесії (logout): прапор попереднього користувача не чинний.
        reconcileInitialPull(null, null);
        markFirstPullSettled();
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
      // Розділ без позначки «відновлено» один раз тягне ВСЕ від нуля, разом
      // із власними оп-ами пристрою (`replicaBootstrap.ts`): інакше скинута
      // копія ніколи не отримала б назад того, що записала сама.
      const resolved = await resolvePullMode(
        client,
        userId,
        await readPullSinceCursor(client, userId),
      );
      const bootstrap = resolved.mode === "bootstrap";
      // data-59/60: копія без жодного повного pull (новий пристрій, евікція
      // сховища) показує «Завантажую з хмари» замість порожнього стану.
      // Примусовий повтор наповненої копії (`sync-lost-ops-repull`) — ні.
      if (bootstrap && resolved.firstReplica) markFirstPullPending();
      else markFirstPullSettled();
      const pullOriginId = bootstrap
        ? REPLICA_BOOTSTRAP_ORIGIN
        : deps.originDeviceId;
      let since = resolved.since;
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

      // Лічильник чекань рейт-ліміту спільний для догону й основного циклу.
      let rateLimitWaits = 0;
      const fetchPage = async (from: number): Promise<SyncV2PullResponse> => {
        for (;;) {
          try {
            return await deps.pull(from, {
              limit: deps.limit,
              originDeviceId: pullOriginId,
            });
          } catch (error) {
            const waitMs = rateLimitWaitMs(error);
            if (waitMs === null || rateLimitWaits >= MAX_RATE_LIMIT_WAITS)
              throw error;
            rateLimitWaits += 1;
            await new Promise((resolve) => setTimeout(resolve, waitMs));
          }
        }
      };

      const startedFresh = since === 0;

      // Догін нотаток до операцій для пристроїв зі старого бандла (див.
      // `txNotesBackfill.ts`). Збій не має блокувати основний pull: звітуємо
      // й ідемо далі, наступний тік продовжить із збереженого прогресу.
      // Відновлення від нуля й так охоплює нотатки: догін не потрібен.
      // Журнал обрізано нижче прогресу догону (410, ADR-0105): тоді нотатки
      // довезе знімок, і основний цикл починає саме з нього.
      let expiredBeforePull: unknown = null;
      if (!bootstrap)
        try {
          await backfillTxNotesOnce({
            client,
            userId,
            originDeviceId: deps.originDeviceId,
            mainCursor: since,
            fetchPage,
            affectedTables,
            isConstraintFailure,
          });
        } catch (error) {
          if (isSyncCursorExpiredError(error) && deps.snapshot)
            expiredBeforePull = error;
          else
            try {
              // Офлайн основний pull нижче впаде сам і буде класифікований.
              if (readOnlineStatus() !== false)
                deps.captureException?.(error, {
                  scope: "sync-v2-tx-notes-backfill",
                  tags: { area: "sync", sync_direction: "pull" },
                });
            } catch {
              /* обсервабіліті ніколи не має ламати шлях читання */
            }
        }

      // Основний pull отримує власний бюджет чекань рейт-ліміту, навіть коли
      // догін вичерпав свій.
      rateLimitWaits = 0;

      // Знімок із тим самим повтором на рейт-ліміт, що й сторінки pull.
      const fetchSnapshot = async (
        opts: SyncV2SnapshotOptions,
      ): Promise<SyncV2SnapshotResponse> => {
        const snapshot = deps.snapshot;
        if (!snapshot) throw new Error("sync reader: snapshot is not wired");
        for (;;) {
          try {
            return await snapshot(opts);
          } catch (error) {
            const waitMs = rateLimitWaitMs(error);
            if (waitMs === null || rateLimitWaits >= MAX_RATE_LIMIT_WAITS)
              throw error;
            rateLimitWaits += 1;
            await new Promise((resolve) => setTimeout(resolve, waitMs));
          }
        }
      };

      for (;;) {
        let page: SyncV2PullResponse;
        try {
          if (expiredBeforePull !== null) {
            const expired = expiredBeforePull;
            expiredBeforePull = null;
            throw expired;
          }
          page = await fetchPage(since);
        } catch (error) {
          // Журнал обрізано нижче курсора (ADR-0105): дочитати неможливо,
          // копію відновлює знімок, далі pull від `as_of_op_id`.
          if (!isSyncCursorExpiredError(error) || !deps.snapshot) throw error;
          const restored = await restoreFromSnapshot({
            client,
            userId,
            fetchSnapshot,
            isConstraintFailure,
            healTombstoneTie: bootstrap,
            onRejected: (op, cause) => reportPullApplyFailure(deps, op, cause),
          });
          // Черга ще не доїхала: знімок перебив би правку. Тік закінчується
          // без мітки «pull завершено», наступний спробує знову.
          if (restored.status === "postponed") {
            return { pulled, applied, skipped, rejected, lastOpId: maxOpId };
          }
          applied += restored.applied;
          rejected += restored.rejected;
          for (const table of restored.affectedTables)
            affectedTables.add(table);
          since = restored.asOfOpId;
          maxOpId = Math.max(maxOpId, since);
          continue;
        }

        for (const op of page.ops) {
          pulled += 1;
          maxOpId = Math.max(maxOpId, op.id);
          let outcome: Awaited<ReturnType<typeof applyPullOp>>;
          if (bootstrap && skipDuringBootstrap(op, deps.originDeviceId)) {
            skipped += 1;
            continue;
          }
          try {
            outcome = await applyPullOp(client, op, userId, pullOriginId, {
              healTombstoneTie: bootstrap,
            });
          } catch (error) {
            // BUSY/IOERR/full disk/closed worker must retry this cursor.
            // Advancing it would permanently omit a valid server record.
            if (!isConstraintFailure(error)) throw error;
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

      // Повний pull з нуля вже охопив і нотатки: догін не потрібен.
      if (startedFresh || bootstrap) {
        await markTxNotesBackfillDone(client, userId);
      }
      if (bootstrap) await markReplicaBootstrapDone(client, userId);

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
        scheduleFirstPullRetry(error);
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

  const clearFirstPullRetry = (): void => {
    if (retryHandle === null) return;
    (deps.clearTimeout ?? ((h) => clearTimeout(h as number)))(retryHandle);
    retryHandle = null;
  };

  /**
   * Короткий повтор невдалого першого pull (2/5/15 с), далі фаза `failed`.
   * Сервер, що попросив довшу паузу (`Retry-After`), її отримує.
   */
  function scheduleFirstPullRetry(error: unknown): void {
    const failures = noteFirstPullFailure(FIRST_PULL_RETRY_DELAYS_MS.length);
    const base = FIRST_PULL_RETRY_DELAYS_MS[failures - 1];
    if (!started || base === undefined) return;
    const delay = Math.max(base, retryAfterFloorMs(error));
    clearFirstPullRetry();
    retryHandle = (deps.setTimeout ?? ((h, ms) => setTimeout(h, ms)))(() => {
      retryHandle = null;
      scheduleTick();
    }, delay);
  }

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
      clearFirstPullRetry();
      resetInitialPull();
      if (intervalHandle !== null) {
        deps.clearInterval(intervalHandle);
        intervalHandle = null;
      }
      deps.eventTarget.removeEventListener("visibilitychange", onVisibility);
    },
    pullOnce,
    async pause() {
      pauses += 1;
      const running = inflight;
      if (running) await running.catch(() => undefined);
      let released = false;
      return () => {
        if (released) return;
        released = true;
        pauses -= 1;
      };
    },
  };
}
