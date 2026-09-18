import type { SyncV2PullOp, SyncV2PullResponse } from "@sergeant/api-client";
import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";

import { applyPullOp } from "./applyPullOp.js";
import { readPullSinceCursor, writePullSinceCursor } from "./syncOpCursor.js";
import { refreshCachesAfterPull } from "./refreshCachesAfterPull.js";
import { classifyTickError, readOnlineStatus } from "./tickErrorReport.js";

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

export function createSyncEngineReaderRuntime(
  deps: SyncEngineReaderDeps,
): SyncEngineReaderRuntime {
  let intervalHandle: unknown = null;
  let inflight: Promise<SyncEnginePullResult> | null = null;
  let started = false;

  const pullOnce = async (): Promise<SyncEnginePullResult> => {
    if (inflight) return inflight;

    inflight = (async () => {
      const userId = await deps.resolveUserId();
      if (!userId) {
        return {
          pulled: 0,
          applied: 0,
          skipped: 0,
          rejected: 0,
          lastOpId: 0,
        };
      }

      const client = await deps.resolveClient();
      let since = await readPullSinceCursor(client, userId);
      let pulled = 0;
      let applied = 0;
      let skipped = 0;
      let rejected = 0;
      let maxOpId = since;
      const affectedTables = new Set<string>();

      for (;;) {
        const page = await deps.pull(since, {
          limit: deps.limit,
          originDeviceId: deps.originDeviceId,
        });

        for (const op of page.ops) {
          pulled += 1;
          maxOpId = Math.max(maxOpId, op.id);
          const outcome = await applyPullOp(
            client,
            op,
            userId,
            deps.originDeviceId,
          );
          if (outcome === "applied") {
            applied += 1;
            affectedTables.add(op.table);
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

      if (applied > 0) {
        await refreshCachesAfterPull(client, userId, affectedTables);
      }

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
      if (intervalHandle !== null) {
        deps.clearInterval(intervalHandle);
        intervalHandle = null;
      }
      deps.eventTarget.removeEventListener("visibilitychange", onVisibility);
    },
    pullOnce,
  };
}
