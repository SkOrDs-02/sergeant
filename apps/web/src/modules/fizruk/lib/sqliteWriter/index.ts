import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";
import type { DualWriteOutcome } from "@sergeant/dualwrite-core";
import { logger as webLogger } from "@shared/lib";

import {
  recordDualWriteOutcome,
  recordParityCheck,
  recordReadFallback,
} from "../../../../core/observability/dualWriteTelemetry.js";
import { refreshFizrukSqliteState } from "../sqliteReader.js";
import {
  __closeFizrukSqliteMutationWindow,
  __openFizrukSqliteMutationWindow,
  notifyFizrukSqliteCacheRefresh,
} from "../sqliteReadGate.js";
import {
  applyFizrukDualWriteOps,
  type ApplyDualWriteResult,
  type DualWriteLogger,
} from "./adapter.js";
import {
  diffFizrukDualWriteOps,
  type FizrukDualWriteOp,
  type FizrukDualWriteState,
} from "./diff/index.js";
import { probeFizrukParity } from "./parity.js";
import {
  journalDualWrite,
  pendingDualWrites,
  settleDualWriteEntry,
} from "../../../../core/durability/dualWriteJournal.js";
import { outboxCheckpoint } from "../../../../core/syncEngine/outboxCheckpoint.js";

/**
 * Orchestrator for the Fizruk dual-write layer.
 *
 * Stage 4 PR #028 of `https://github.com/Skords-01/Sergeant/blob/d068c73a2f21881d5c1305544fe99f3ea8be81f4/docs/90-work/planning/archive/storage-roadmap.md`. Mirrors the
 * routine dual-write orchestrator pattern from PR #024.
 *
 * Glues together:
 *
 *  - the **identity** resolver (`getUserId()`);
 *  - the **SQLite** resolver (`getMigrationClient()`);
 *  - and the **adapter** (`applyFizrukDualWriteOps`).
 *
 * Stage 8 PR #056f removed `isEnabled()` from the context — the
 * legacy `feature.fizruk.sqlite_v2.dual_write` flag was default-on
 * with no toggle path remaining. SQLite mirror is now unconditional
 * whenever a dual-write context is registered.
 *
 * Registration pattern: the hooks that write to localStorage sit below
 * the auth + sqlite singletons in the dependency graph. Pulling those
 * in directly creates a cycle. The registration pattern lets the boot
 * wiring file install the dependencies once.
 *
 * Best-effort guarantees:
 *
 *  - The orchestrator's promise NEVER rejects.
 *  - When `getUserId()` or `getMigrationClient()` return null the
 *    call is a no-op.
 */

export interface FizrukDualWriteContext {
  getUserId(): string | null;
  getMigrationClient(): Promise<SqliteMigrationClient | null>;
  getNow(): string;
  logger?: DualWriteLogger;
}

let registeredContext: FizrukDualWriteContext | null = null;
/** Усі живі реєстрації в порядку появи — див. AI-DANGER нижче. */
const liveContexts: FizrukDualWriteContext[] = [];

/**
 * AI-DANGER: реєстрантів БІЛЬШЕ НІЖ ОДИН, і це навмисно — тому teardown
 * ПОВЕРТАЄ попередній контекст, а не обнуляє слот.
 *
 * Як воно ламалось (знахідка PR-R1, аудит 2026-09-13). Слот був один, а
 * teardown робив `if (registeredContext === ctx) registeredContext = null`.
 * Реєструються двоє: глобальний boot-кластер (змонтований завжди через
 * `RootLayout`) і сам модуль. Модуль реєструється пізніше й перекриває
 * кластерний контекст; на анмаунті модуля його teardown бачить СВІЙ
 * контекст у слоті й обнуляє його — а кластер більше нічого не
 * реєструє, бо його ефект залежить від `[userId]`. Далі
 * `is…DualWriteRegistered()` вертає `false`, і dual-write мовчки стає
 * no-op до кінця сесії: запис із чату доїжджає лише до localStorage.
 *
 * Чому саме стек, а не «прибрати другого реєстранта». У Фініку кластер
 * гейтиться на `user || isDemoActive()`, тож для анонімного відвідувача
 * він не рендериться взагалі — і модульна реєстрація там єдина робоча
 * (замір 2026-08-06: без неї кожна витрата аноніма жила лише в теплому
 * кеші й зникала на перезавантаженні). Тобто другий реєстрант потрібен;
 * поламаний був сам реєстр.
 *
 * `liveContexts` тримає всі живі реєстрації в порядку появи, а
 * `registeredContext` — завжди остання з них. Teardown прибирає СВІЙ
 * запис зі стека (де б він не стояв) і перераховує поточний. Порядок
 * анмаунтів тому не має значення.
 */
/**
 * Install the dual-write context. Call from the platform bootstrap
 * file when the React Query client and sqlite singletons are available.
 *
 * Returns a teardown function that clears the registration.
 */
export function registerFizrukDualWriteContext(
  ctx: FizrukDualWriteContext,
): () => void {
  liveContexts.push(ctx);
  registeredContext = ctx;
  replayFizrukJournal(ctx);
  return () => {
    const at = liveContexts.lastIndexOf(ctx);
    if (at === -1) return;
    liveContexts.splice(at, 1);
    registeredContext = liveContexts[liveContexts.length - 1] ?? null;
  };
}

/** Test-only escape hatch — clears any registered context. */
export function __clearFizrukDualWriteContextForTests(): void {
  registeredContext = null;
  liveContexts.length = 0;
  dualWriteQueue = Promise.resolve();
  replayedJournalIds.clear();
}

/**
 * Returns `true` while a context is currently registered. Used by
 * the LS write layer to decide whether to read the previous state.
 */
export function isFizrukDualWriteRegistered(): boolean {
  return registeredContext !== null;
}

/**
 * Run the dual-write pipeline for a `prev → next` LS-state transition.
 *
 * The function is `async` but the LS-write call site fires it
 * fire-and-forget through {@link triggerFizrukDualWrite}.
 *
 * Every call records its terminal outcome through
 * `recordDualWriteOutcome("fizruk", …)` so the Stage 8 decision-gate
 * tags stay current on the global Sentry scope — see
 * `apps/web/src/core/observability/dualWriteTelemetry.ts`.
 */
export async function dualWriteFizrukState(
  prev: FizrukDualWriteState,
  next: FizrukDualWriteState,
): Promise<DualWriteOutcome> {
  const ctx = registeredContext;
  const outcome = ctx
    ? await runFizrukOps(
        ctx,
        diffFizrukDualWriteOps(prev, next),
        ctx.getNow(),
        next,
      )
    : ({ status: "skipped", reason: "context-unset" } as const);
  recordDualWriteOutcome("fizruk", outcome);
  return outcome;
}

/**
 * `clientTs` ззовні з тієї ж причини, що й у Фініку: реплей журналу йде з
 * міткою первинного запуску. `next` null для реплею (паритет пропускаємо).
 */
async function runFizrukOps(
  ctx: FizrukDualWriteContext,
  ops: readonly FizrukDualWriteOp[],
  clientTs: string,
  next: FizrukDualWriteState | null,
): Promise<DualWriteOutcome> {
  if (ops.length === 0) return { status: "skipped", reason: "no-ops" };

  const userId = ctx.getUserId();
  if (!userId) {
    logSafe(ctx, "warn", "dual-write skipped: user id unavailable", {
      ops: ops.length,
    });
    return { status: "skipped", reason: "user-id-missing" };
  }

  let client: SqliteMigrationClient | null = null;
  try {
    client = await ctx.getMigrationClient();
  } catch (err) {
    logSafe(ctx, "warn", "dual-write skipped: sqlite unavailable", {
      error: err instanceof Error ? err.message : String(err),
    });
    return { status: "skipped", reason: "sqlite-unavailable" };
  }
  if (!client) {
    logSafe(ctx, "warn", "dual-write skipped: sqlite returned null", {});
    return { status: "skipped", reason: "sqlite-unavailable" };
  }

  const result = await applyFizrukDualWriteOps(client, ops, {
    userId,
    clientTs,
    logger: ctx.logger,
  });

  try {
    await refreshFizrukSqliteState(client, userId);
    notifyFizrukSqliteCacheRefresh();
  } catch (err) {
    recordReadFallback(
      "fizruk",
      err instanceof Error
        ? `cache-refresh-failed: ${err.message}`
        : "cache-refresh-failed",
    );
  }

  // Stage 8 parity probe — best-effort: never throws, never disturbs
  // the dual-write outcome. A failed probe-read is tagged distinctly
  // (`recordReadFallback`) so triage can tell `SELECT failing` apart
  // from a real LS↔SQLite divergence (`recordParityCheck("…",
  // "mismatch", …)`).
  if (!next) return { status: "applied", result };
  try {
    const parity = await probeFizrukParity(client, userId, next);
    recordParityCheck("fizruk", parity.result, parity.details);
  } catch (err) {
    recordReadFallback(
      "fizruk",
      err instanceof Error
        ? `parity-probe-failed: ${err.message}`
        : "parity-probe-failed",
    );
  }

  return { status: "applied", result };
}

/**
 * Fire-and-forget entry point used by Fizruk LS-write hooks.
 * Resolves immediately so the LS-write call site doesn't pay any
 * latency on the happy path.
 */
// DCRUD-007 single-flight queue: concurrent fire-and-forget dual-writes
// used to interleave apply → refresh → notify, so a refresh whose
// snapshot predated a newer local mutation could be the LAST notify —
// and the read overlay would clobber the fresh UI state with the stale
// cache. Serializing the pipeline + exposing the pending count lets the
// overlay skip replacements while writes are in flight. Mirrors the
// finyk dual-write orchestrator.
let dualWriteQueue: Promise<unknown> = Promise.resolve();

export function triggerFizrukDualWrite(
  prev: FizrukDualWriteState,
  next: FizrukDualWriteState,
): void {
  const ctx = registeredContext;
  if (!ctx) return;
  // Diff, мітку часу і журнал беремо синхронно, ДО асинхронної межі нижче:
  // див. `core/durability/dualWriteJournal.ts`.
  const ops = diffFizrukDualWriteOps(prev, next);
  const clientTs = ctx.getNow();
  const userId = ctx.getUserId();
  const journalId =
    ops.length > 0 && userId
      ? journalDualWrite<FizrukJournalPayload>("fizruk", userId, {
          ops,
          clientTs,
        })
      : null;
  enqueueFizrukRun(ctx, ops, clientTs, next, journalId);
}

interface FizrukJournalPayload {
  readonly ops: readonly FizrukDualWriteOp[];
  readonly clientTs: string;
}

/** Реплей відбувається раз на запис, хоч реєстрантів контексту кілька. */
const replayedJournalIds = new Set<string>();

function replayFizrukJournal(ctx: FizrukDualWriteContext): void {
  const userId = ctx.getUserId();
  if (!userId) return;
  for (const entry of pendingDualWrites<FizrukJournalPayload>(
    "fizruk",
    userId,
  )) {
    if (replayedJournalIds.has(entry.id)) continue;
    replayedJournalIds.add(entry.id);
    enqueueFizrukRun(
      ctx,
      entry.payload.ops,
      entry.payload.clientTs,
      null,
      entry.id,
    );
  }
}

function enqueueFizrukRun(
  ctx: FizrukDualWriteContext,
  ops: readonly FizrukDualWriteOp[],
  clientTs: string,
  next: FizrukDualWriteState | null,
  journalId: string | null,
): void {
  __openFizrukSqliteMutationWindow();
  dualWriteQueue = dualWriteQueue
    .then(() => new Promise((resolve) => globalThis.setTimeout(resolve, 0)))
    .then(async () => {
      const outboxSettled = outboxCheckpoint();
      const outcome = await runFizrukOps(ctx, ops, clientTs, next);
      recordDualWriteOutcome("fizruk", outcome);
      // «sqlite недоступна» лишає запис у журналі для наступного буту.
      // Рядок outbox, що ще не ліг, теж лишає запис (див. outboxCheckpoint).
      // Чекаємо поза чергою: завислий outbox не має гальмувати наступні записи.
      settleDualWriteEntry("fizruk", journalId, outcome, outboxSettled);
    })
    .catch((err) => {
      logSafe(ctx, "warn", "dual-write task failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    })
    .then(() => {
      __closeFizrukSqliteMutationWindow();
      // No-op while later writes are still queued (their windows are
      // open); the last write of a burst delivers the visible refresh.
      notifyFizrukSqliteCacheRefresh();
    });
}

function logSafe(
  ctx: FizrukDualWriteContext,
  level: "warn" | "info",
  msg: string,
  meta: Record<string, unknown>,
): void {
  try {
    if (ctx.logger) ctx.logger(level, msg, meta);
    else if (level === "warn")
      webLogger.warn(`[fizruk.dualWrite] ${msg}`, meta);
  } catch {
    /* noop — logging must never throw */
  }
}

// Re-exports for callers that need the lower-level pieces (mostly tests).
export {
  applyFizrukDualWriteOps,
  diffFizrukDualWriteOps,
  type ApplyDualWriteResult,
  type DualWriteLogger,
  type DualWriteOutcome,
  type FizrukDualWriteState,
};
