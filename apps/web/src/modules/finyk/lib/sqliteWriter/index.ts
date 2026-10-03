import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";
import type { DualWriteOutcome } from "@sergeant/dualwrite-core";
import { logger as webLogger } from "@shared/lib";

import {
  recordDualWriteOutcome,
  recordParityCheck,
  recordReadFallback,
} from "../../../../core/observability/dualWriteTelemetry.js";
import { refreshFinykSqliteState } from "../sqliteReader.js";
import {
  __closeFinykSqliteMutationWindow,
  __openFinykSqliteMutationWindow,
  notifyFinykSqliteCacheRefresh,
} from "../sqliteReadGate.js";
import {
  applyFinykDualWriteOps,
  type ApplyDualWriteResult,
  type DualWriteLogger,
} from "./adapter.js";
import {
  diffFinykDualWriteOps,
  EMPTY_FINYK_STATE,
  type FinykDualWriteOp,
  type FinykDualWriteState,
} from "./diff.js";
import { probeFinykParity } from "./parity.js";
import {
  journalDualWrite,
  pendingDualWrites,
  settleDualWriteEntry,
} from "../../../../core/durability/dualWriteJournal.js";
import { outboxCheckpoint } from "../../../../core/syncEngine/outboxCheckpoint.js";

/**
 * Orchestrator for the Finyk SQLite writer layer (formerly dual-write).
 *
 * Stage 4 PR #036 of `https://github.com/Skords-01/Sergeant/blob/d068c73a2f21881d5c1305544fe99f3ea8be81f4/docs/90-work/planning/archive/storage-roadmap.md`. Mirrors the
 * nutrition SQLite-writer orchestrator pattern from PR #032.
 *
 * Glues together:
 *
 *  - the **identity** resolver (`getUserId()`);
 *  - the **SQLite** resolver (`getMigrationClient()`);
 *  - and the **adapter** (`applyFinykDualWriteOps`).
 *
 * Registration pattern: the hooks that write to localStorage sit below
 * the auth + sqlite singletons in the dependency graph. Pulling those
 * in directly creates a cycle. The registration pattern lets the boot
 * wiring file install the dependencies once.
 *
 * Stage 8 PR #056k dropped the `feature.finyk.sqlite_v2.dual_write`
 * gate — the SQLite mirror now fires unconditionally whenever a
 * context is registered. LS/MMKV-write remains source-of-truth until
 * PR #057k.
 *
 * Best-effort guarantees:
 *
 *  - The orchestrator's promise NEVER rejects.
 *  - When `getUserId()` or `getMigrationClient()` return null the
 *    call is a no-op.
 */

export interface FinykDualWriteContext {
  getUserId(): string | null;
  getMigrationClient(): Promise<SqliteMigrationClient | null>;
  getNow(): string;
  logger?: DualWriteLogger;
}

let registeredContext: FinykDualWriteContext | null = null;
/** Усі живі реєстрації в порядку появи — див. AI-DANGER нижче. */
const liveContexts: FinykDualWriteContext[] = [];

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
export function registerFinykDualWriteContext(
  ctx: FinykDualWriteContext,
): () => void {
  liveContexts.push(ctx);
  registeredContext = ctx;
  replayFinykJournal(ctx);
  return () => {
    const at = liveContexts.lastIndexOf(ctx);
    if (at === -1) return;
    liveContexts.splice(at, 1);
    registeredContext = liveContexts[liveContexts.length - 1] ?? null;
  };
}

/** Test-only escape hatch — clears any registered context. */
export function __clearFinykDualWriteContextForTests(): void {
  registeredContext = null;
  liveContexts.length = 0;
  lastIssuedClientTs = null;
  dualWriteQueue = Promise.resolve();
  replayedJournalIds.clear();
}

// DCRUD-108 — last clientTs handed to ANY Finyk dual-write apply, across
// both the single-flight queue below (`triggerFinykDualWrite`) and the
// off-React mirror path (`applyFinykDualWriteOpsViaContext`). `ctx.getNow()`
// is `Date.now()`-resolution (millisecond); a create immediately followed
// by an edit to the SAME row can legitimately dequeue two flushes whose
// `getNow()` calls land in the identical millisecond — more so on CI's
// coarser system-timer resolution than on a dev machine. The adapter's LWW
// guard is strictly-greater-than by design (`WHERE excluded.updated_at >
// table.updated_at` — see adapter.ts; never weaken to `>=`, that would
// blur real concurrent-write detection), so an EQUAL clientTs silently
// no-ops the second write and the edit never reaches the local SQLite
// mirror (root cause of the finyk deep-CRUD E2E regression — the edit is
// visible in React state but lost from the SQLite row the post-reload
// overlay reads). `nextMonotonicClientTs` guarantees every apply gets a
// strictly-increasing clientTs regardless of wall-clock resolution,
// without touching the guard itself.
let lastIssuedClientTs: string | null = null;

function nextMonotonicClientTs(
  ctx: Pick<FinykDualWriteContext, "getNow">,
): string {
  const now = ctx.getNow();
  const nowMs = Date.parse(now);
  const lastMs =
    lastIssuedClientTs === null ? NaN : Date.parse(lastIssuedClientTs);
  if (!Number.isNaN(lastMs) && !Number.isNaN(nowMs) && nowMs <= lastMs) {
    const bumped = new Date(lastMs + 1).toISOString();
    lastIssuedClientTs = bumped;
    return bumped;
  }
  lastIssuedClientTs = now;
  return now;
}

/**
 * Returns `true` while a context is currently registered. Used by
 * the LS write layer to decide whether to read the previous state.
 */
export function isFinykDualWriteRegistered(): boolean {
  return registeredContext !== null;
}

/**
 * Non-hook accessor for the registered context's identity + SQLite
 * resolver. Returns `null` when no context is registered or the user
 * id is unavailable.
 *
 * Used by the chat-action dual-write bridge
 * (`core/lib/chatActions/finykActions/dualWriteBridge.ts`), which runs
 * synchronously outside React and therefore cannot read `useAuth()` or
 * the React Query `me` cache. The registered context's `getUserId()` is
 * the canonical source of the real Better-Auth id the `finyk_*` tables
 * key on (NOT the sanitised SQLite partition key in `core/db/sqlite`).
 */
export function getFinykDualWriteRuntime(): {
  readonly userId: string;
  readonly getMigrationClient: () => Promise<SqliteMigrationClient | null>;
  readonly getNow: () => string;
} | null {
  const ctx = registeredContext;
  if (!ctx) return null;
  const userId = ctx.getUserId();
  if (!userId) return null;
  return {
    userId,
    getMigrationClient: ctx.getMigrationClient,
    getNow: ctx.getNow,
  };
}

/**
 * Run the dual-write pipeline for a `prev → next` LS-state transition and
 * resolve with its terminal outcome.
 *
 * AI-CONTEXT: запис іде ЖУРНАЛЬОВАНИМ шляхом (`journalDualWrite` до
 * асинхронної межі, `settleDualWriteEntry` після), як `triggerFinykDualWrite`
 * і дуалрайт Рутини та Їжі. Єдиний чинний виклик поза тригером - відновлення
 * з файлу (`finykBackup.ts`): воно йшло повз журнал, тож обірваний reload чи
 * `skipped` лишали пристрій без жодного шансу догнати сервер (аудит
 * 2026-10-01, data-07). Помилкові й `skipped` результати журнал не знімає,
 * див. {@link settleDualWriteEntry}.
 *
 * Every call records its terminal outcome through
 * `recordDualWriteOutcome("finyk", …)` so the Stage 8 decision-gate
 * tags stay current on the global Sentry scope — see
 * `apps/web/src/core/observability/dualWriteTelemetry.ts`.
 */
export async function dualWriteFinykState(
  prev: FinykDualWriteState,
  next: FinykDualWriteState,
): Promise<DualWriteOutcome> {
  const ctx = registeredContext;
  if (!ctx) {
    const skipped = { status: "skipped", reason: "context-unset" } as const;
    recordDualWriteOutcome("finyk", skipped);
    return skipped;
  }
  const ops = diffFinykDualWriteOps(prev, next);
  const clientTs = nextMonotonicClientTs(ctx);
  const userId = ctx.getUserId();
  const journalId =
    ops.length > 0 && userId
      ? journalDualWrite<FinykJournalPayload>("finyk", userId, {
          ops,
          clientTs,
        })
      : null;
  const outboxSettled = outboxCheckpoint();
  const outcome = await runFinykOps(ctx, ops, clientTs, next);
  recordDualWriteOutcome("finyk", outcome);
  settleDualWriteEntry("finyk", journalId, outcome, outboxSettled);
  return outcome;
}

/**
 * `clientTs` приходить ззовні, а не береться тут: журнальований запис
 * відтворюється з ТІЄЮ Ж міткою, що й первинний запуск, інакше пізній
 * реплей перебив би новішу правку з іншого пристрою. `next` null для
 * реплею: паритет із повним станом там не має з чим порівнювати.
 */
async function runFinykOps(
  ctx: FinykDualWriteContext,
  ops: readonly FinykDualWriteOp[],
  clientTs: string,
  next: FinykDualWriteState | null,
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

  const result = await applyFinykDualWriteOps(client, ops, {
    userId,
    clientTs,
    logger: ctx.logger,
  });

  try {
    await refreshFinykSqliteState(client, userId);
    notifyFinykSqliteCacheRefresh();
  } catch (err) {
    recordReadFallback(
      "finyk",
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
    const parity = await probeFinykParity(client, userId, next);
    recordParityCheck("finyk", parity.result, parity.details);
  } catch (err) {
    recordReadFallback(
      "finyk",
      err instanceof Error
        ? `parity-probe-failed: ${err.message}`
        : "parity-probe-failed",
    );
  }

  return { status: "applied", result };
}

// DCRUD-007 single-flight queue: concurrent fire-and-forget dual-writes
// used to interleave apply → refresh → notify, so a refresh whose
// snapshot predated a newer local mutation could be the LAST notify —
// and the read overlay would clobber the fresh UI state with the stale
// cache (which then escalated to a spurious blob-delete through the
// diff-writer). Serializing the pipeline + exposing the pending count
// lets the overlay skip replacements while writes are in flight.
let dualWriteQueue: Promise<unknown> = Promise.resolve();

/**
 * Fire-and-forget entry point used by Finyk LS-write hooks.
 * Resolves immediately so the LS-write call site doesn't pay any
 * latency on the happy path. Runs are serialized (single-flight) in
 * enqueue order; the final run of a burst re-notifies subscribers so
 * the overlay applies exactly one causally-latest snapshot.
 */
export function triggerFinykDualWrite(
  prev: FinykDualWriteState,
  next: FinykDualWriteState,
): void {
  const ctx = registeredContext;
  if (!ctx) return;
  // Diff, мітку часу і журнал беремо синхронно, ДО асинхронної межі нижче:
  // див. `core/durability/dualWriteJournal.ts`.
  const ops = diffFinykDualWriteOps(prev, next);
  const clientTs = nextMonotonicClientTs(ctx);
  const userId = ctx.getUserId();
  const journalId =
    ops.length > 0 && userId
      ? journalDualWrite<FinykJournalPayload>("finyk", userId, {
          ops,
          clientTs,
        })
      : null;
  enqueueFinykRun(ctx, ops, clientTs, next, journalId);
}

interface FinykJournalPayload {
  readonly ops: readonly FinykDualWriteOp[];
  readonly clientTs: string;
}

/** Реплей відбувається раз на запис, хоч реєстрантів контексту кілька. */
const replayedJournalIds = new Set<string>();

function replayFinykJournal(ctx: FinykDualWriteContext): void {
  const userId = ctx.getUserId();
  if (!userId) return;
  for (const entry of pendingDualWrites<FinykJournalPayload>("finyk", userId)) {
    if (replayedJournalIds.has(entry.id)) continue;
    replayedJournalIds.add(entry.id);
    enqueueFinykRun(
      ctx,
      entry.payload.ops,
      entry.payload.clientTs,
      null,
      entry.id,
    );
  }
}

function enqueueFinykRun(
  ctx: FinykDualWriteContext,
  ops: readonly FinykDualWriteOp[],
  clientTs: string,
  next: FinykDualWriteState | null,
  journalId: string | null,
): void {
  __openFinykSqliteMutationWindow();
  dualWriteQueue = dualWriteQueue
    .then(() => new Promise((resolve) => globalThis.setTimeout(resolve, 0)))
    .then(async () => {
      const outboxSettled = outboxCheckpoint();
      const outcome = await runFinykOps(ctx, ops, clientTs, next);
      recordDualWriteOutcome("finyk", outcome);
      // «sqlite недоступна» лишає запис у журналі для наступного буту.
      // Рядок outbox, що ще не ліг, теж лишає запис (див. outboxCheckpoint).
      // Чекаємо поза чергою: завислий outbox не має гальмувати наступні записи.
      settleDualWriteEntry("finyk", journalId, outcome, outboxSettled);
    })
    .catch((err) => {
      logSafe(ctx, "warn", "dual-write task failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    })
    .then(() => {
      __closeFinykSqliteMutationWindow();
      // No-op while later writes are still queued (their windows are
      // open); the last write of a burst delivers the visible refresh.
      notifyFinykSqliteCacheRefresh();
    });
}

/**
 * Apply a pre-built op list through the registered context, SKIPPING
 * the `prev → next` diff and the Stage 8 parity probe that
 * {@link dualWriteFinykState} runs.
 *
 * Off-React callers (Hub chat-action executors) mutate a single entity
 * and have no full LS-state snapshot to diff. Routing them through
 * `dualWriteFinykState(EMPTY, next)` would diff against an empty state
 * (re-emitting every row) and the parity probe would compare a partial
 * `next` against the full SQLite table and falsely report a mismatch.
 * This entry point hands the ops straight to the adapter instead.
 *
 * Best-effort: never rejects; a missing context / user id / sqlite
 * client is a no-op. Records the terminal outcome on the shared Sentry
 * scope like the orchestrator does.
 */
export async function applyFinykDualWriteOpsViaContext(
  ops: readonly FinykDualWriteOp[],
): Promise<DualWriteOutcome> {
  const ctx = registeredContext;
  if (!ctx) return { status: "skipped", reason: "context-unset" };
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

  let result: ApplyDualWriteResult;
  try {
    result = await applyFinykDualWriteOps(client, ops, {
      userId,
      clientTs: nextMonotonicClientTs(ctx),
      logger: ctx.logger,
    });
  } catch (err) {
    // Log before re-throwing: this `await` has no local fallback (unlike
    // the `getMigrationClient()` guard above), so without this the
    // failure would surface only as a bare unhandled rejection at the
    // fire-and-forget call sites — see the `.catch` handlers below.
    logSafe(ctx, "warn", "dual-write apply failed", {
      ops: ops.length,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
  const outcome: DualWriteOutcome = { status: "applied", result };
  recordDualWriteOutcome("finyk", outcome);
  return outcome;
}

/** Shape of a manual-expense entry as persisted in the LS bundle (грн). */
export interface ManualExpenseMirrorEntry {
  readonly id: string;
  readonly date?: string;
  readonly description?: string;
  /** Amount in **гривні** (minor-unit ×100 is server-only — Hard Rule #1). */
  readonly amount: number;
  readonly category?: string;
  /** expense | income — see `resolveManualExpenseKind` in finyk-domain. */
  readonly kind?: string;
  /** Legacy alias for `kind`, predates the manual-income feature. */
  readonly type?: string;
  readonly [extra: string]: unknown;
}

/**
 * Fire-and-forget: mirror a manual-expense create/update into the
 * `finyk_manual_expenses` SQLite table (blob-upsert). The blob is the
 * verbatim LS shape — amount stays in **гривні**, matching what the
 * finyk module's own dual-write extractor writes for the same key.
 */
export function triggerManualExpenseSqliteMirror(
  expense: ManualExpenseMirrorEntry,
): void {
  const ctx = registeredContext;
  if (!ctx || !expense?.id) return;
  const op: FinykDualWriteOp = {
    kind: "blob-upsert",
    table: "finyk_manual_expenses",
    entry: { id: expense.id, dataJson: JSON.stringify(expense) },
  };
  void Promise.resolve()
    .then(() => applyFinykDualWriteOpsViaContext([op]))
    .catch((err) => {
      logSafe(ctx, "warn", "manual-expense sqlite mirror failed", {
        id: expense.id,
        error: err instanceof Error ? err.message : String(err),
      });
    });
}

/**
 * Fire-and-forget: mirror a manual-expense removal (undo / delete tool)
 * into SQLite (blob soft-delete) so the off-React delete agrees with
 * the create mirror and the row stops showing up in the overlay read.
 */
export function triggerManualExpenseDeleteSqliteMirror(id: string): void {
  const ctx = registeredContext;
  if (!ctx || !id) return;
  const op: FinykDualWriteOp = {
    kind: "blob-delete",
    table: "finyk_manual_expenses",
    id,
  };
  void Promise.resolve()
    .then(() => applyFinykDualWriteOpsViaContext([op]))
    .catch((err) => {
      logSafe(ctx, "warn", "manual-expense sqlite delete mirror failed", {
        id,
        error: err instanceof Error ? err.message : String(err),
      });
    });
}

/**
 * Fire-and-forget: mirror per-tx category overrides (`finyk_tx_cats`)
 * into SQLite (`tx-category-upsert`). Sibling of
 * {@link triggerManualExpenseSqliteMirror} for the `change_category` /
 * `batch_categorize` tools.
 */
export function triggerTxCategorySqliteMirror(
  entries: ReadonlyArray<{ transactionId: string; categoryId: string }>,
): void {
  const ctx = registeredContext;
  if (!ctx) return;
  const ops: FinykDualWriteOp[] = [];
  for (const e of entries) {
    if (!e.transactionId || !e.categoryId) continue;
    ops.push({
      kind: "tx-category-upsert",
      entry: { transactionId: e.transactionId, categoryId: e.categoryId },
    });
  }
  if (ops.length === 0) return;
  void Promise.resolve()
    .then(() => applyFinykDualWriteOpsViaContext(ops))
    .catch((err) => {
      logSafe(ctx, "warn", "tx-category sqlite mirror failed", {
        ops: ops.length,
        error: err instanceof Error ? err.message : String(err),
      });
    });
}

/**
 * Fire-and-forget: mirror a hide-transaction into SQLite
 * (`id-upsert` on `finyk_hidden_transactions`) so the AI `hide` tool
 * agrees with the migrated hidden-tx read.
 */
export function triggerHiddenTransactionSqliteMirror(txId: string): void {
  const ctx = registeredContext;
  if (!ctx || !txId) return;
  const op: FinykDualWriteOp = {
    kind: "id-upsert",
    table: "finyk_hidden_transactions",
    entry: { id: txId },
  };
  void Promise.resolve()
    .then(() => applyFinykDualWriteOpsViaContext([op]))
    .catch((err) => {
      logSafe(ctx, "warn", "hidden-transaction sqlite mirror failed", {
        id: txId,
        error: err instanceof Error ? err.message : String(err),
      });
    });
}

function logSafe(
  ctx: FinykDualWriteContext,
  level: "warn" | "info",
  msg: string,
  meta: Record<string, unknown>,
): void {
  try {
    if (ctx.logger) ctx.logger(level, msg, meta);
    else if (level === "warn") webLogger.warn(`[finyk.dualWrite] ${msg}`, meta);
  } catch {
    /* noop — logging must never throw */
  }
}

export {
  applyFinykDualWriteOps,
  diffFinykDualWriteOps,
  EMPTY_FINYK_STATE,
  type ApplyDualWriteResult,
  type DualWriteLogger,
  type DualWriteOutcome,
  type FinykDualWriteState,
};
