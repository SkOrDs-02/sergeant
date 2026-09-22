import type { RoutineState } from "@sergeant/routine-domain";
import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";
import type { DualWriteOutcome } from "@sergeant/dualwrite-core";
import { logger as webLogger } from "@shared/lib";

import {
  recordDualWriteOutcome,
  recordParityCheck,
  recordReadFallback,
} from "../../../../core/observability/dualWriteTelemetry.js";
import {
  applyRoutineDualWriteOps,
  type ApplyDualWriteResult,
  type DualWriteLogger,
} from "./adapter.js";
import { diffRoutineDualWriteOps } from "./diff.js";
import { probeRoutineParity } from "./parity.js";
import {
  beginRoutineLocalWrite,
  endRoutineLocalWrite,
} from "../localWriteWindow.js";

/**
 * Orchestrator for the routine dual-write layer.
 *
 * Stage 4 PR #024 of `https://github.com/Skords-01/Sergeant/blob/d068c73a2f21881d5c1305544fe99f3ea8be81f4/docs/90-work/planning/archive/storage-roadmap.md`. Glues
 * together:
 *
 *  - the **identity** resolver (`getUserId()`) — web reads from the
 *    React-Query `me` cache, mobile from session storage, both
 *    return `null` while bootstrapping;
 *  - the **SQLite** resolver (`getMigrationClient()`) — web returns
 *    the `migrationClient()` accessor on the lazy sqlite-wasm
 *    singleton, mobile wraps `expo-sqlite` via
 *    `createExpoSqliteRawClient`;
 *  - and the **adapter** (`applyRoutineDualWriteOps`) which performs
 *    the actual SQL writes.
 *
 * Stage 8 PR #056r removed `isEnabled()` from the context — the
 * legacy `feature.routine.sqlite_v2.dual_write` flag was default-on
 * with no toggle path remaining. Stage 10 / PR #070r-dualwrite
 * extended the schema and dual-write pipeline to cover all 7 new
 * tables (habits / tags / categories / prefs /
 * habitOrder / completionNotes), so SQLite is now mirrored
 * unconditionally for the full `RoutineState`.
 *
 * Why a registration shape: `routineStorage.ts` (the LS write layer)
 * sits below the auth + sqlite singletons in the dependency graph.
 * Pulling those in directly creates a cycle and forces every test
 * that touches the LS layer to mock React-Query + sqlite-wasm. The
 * registration pattern lets the boot wiring file (e.g. `main.tsx`)
 * install the dependencies once, and tests stay decoupled.
 *
 * Best-effort guarantees:
 *
 *  - The orchestrator's promise NEVER rejects — adapter or resolver
 *    errors are caught and logged via the registered logger.
 *  - When `getUserId()` or `getMigrationClient()` return null/undefined
 *    the call is a no-op (`reason: "user-id-missing"` /
 *    `"sqlite-unavailable"`) — useful for the early boot window
 *    where state isn't hydrated yet.
 */

export interface RoutineDualWriteContext {
  /** Owning user id, or `null` if not yet known. */
  getUserId(): string | null;
  /**
   * Resolves the SQLite migration client. May throw — the orchestrator
   * catches and logs. Returning `null` is treated the same as throwing.
   */
  getMigrationClient(): Promise<SqliteMigrationClient | null>;
  /** Returns the timestamp written to `created_at` / `updated_at`. */
  getNow(): string;
  /** Optional structured logger. Defaults to `webLogger.warn` wrapper. */
  logger?: DualWriteLogger;
}

let registeredContext: RoutineDualWriteContext | null = null;
/** Усі живі реєстрації в порядку появи — див. AI-DANGER нижче. */
const liveContexts: RoutineDualWriteContext[] = [];

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
 * file (`apps/web/src/main.tsx`, mobile equivalent) when the React
 * Query client and sqlite singletons are available.
 *
 * Returns a teardown function that clears the registration — handy
 * for tests using `afterEach`.
 */
export function registerRoutineDualWriteContext(
  ctx: RoutineDualWriteContext,
): () => void {
  liveContexts.push(ctx);
  registeredContext = ctx;
  return () => {
    const at = liveContexts.lastIndexOf(ctx);
    if (at === -1) return;
    liveContexts.splice(at, 1);
    registeredContext = liveContexts[liveContexts.length - 1] ?? null;
  };
}

/** Test-only escape hatch — clears any registered context. */
export function __clearRoutineDualWriteContextForTests(): void {
  registeredContext = null;
  liveContexts.length = 0;
}

/**
 * Returns `true` while a context is currently registered. Used by
 * the LS write layer (`routineStorage.ts`) to decide whether to read
 * the previous state at all — when no context is installed the
 * dual-write pipeline is a guaranteed no-op and the read can be
 * skipped to keep the off-flag write path unchanged.
 */
export function isRoutineDualWriteRegistered(): boolean {
  return registeredContext !== null;
}

/**
 * Run the dual-write pipeline for a `prev → next` LS-state transition.
 *
 * The function is `async` but the LS-write call site fires it
 * fire-and-forget through {@link triggerRoutineDualWrite} — callers
 * should not await it, since SQLite latency must never block a
 * `setState` round-trip.
 *
 * Every call records its terminal outcome through
 * `recordDualWriteOutcome("routine", …)` so the Stage 8 decision-gate
 * tags (`dualwrite.routine.error_rate`, `dualwrite.routine.applied`,
 * etc.) stay current on the global Sentry scope — see
 * `apps/web/src/core/observability/dualWriteTelemetry.ts`.
 */
export async function dualWriteRoutineState(
  prev: RoutineState,
  next: RoutineState,
): Promise<DualWriteOutcome> {
  const outcome = await runDualWriteRoutineState(prev, next);
  recordDualWriteOutcome("routine", outcome);
  return outcome;
}

async function runDualWriteRoutineState(
  prev: RoutineState,
  next: RoutineState,
): Promise<DualWriteOutcome> {
  const ctx = registeredContext;
  if (!ctx) return { status: "skipped", reason: "context-unset" };

  const ops = diffRoutineDualWriteOps(prev, next);
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

  const result = await applyRoutineDualWriteOps(client, ops, {
    userId,
    clientTs: ctx.getNow(),
    logger: ctx.logger,
  });

  // Stage 8 parity probe — best-effort: never throws, never disturbs
  // the dual-write outcome. A failed probe-read is tagged distinctly
  // (`recordReadFallback`) so triage can tell `SELECT failing` apart
  // from a real LS↔SQLite divergence (`recordParityCheck("…",
  // "mismatch", …)`).
  try {
    const parity = await probeRoutineParity(client, userId, next);
    recordParityCheck("routine", parity.result, parity.details);
  } catch (err) {
    recordReadFallback(
      "routine",
      err instanceof Error
        ? `parity-probe-failed: ${err.message}`
        : "parity-probe-failed",
    );
  }

  return { status: "applied", result };
}

// Розписка про всі запущені записи. Навмисно `allSettled`, а не
// послідовна черга як у finyk/nutrition: тут завдання стартує одразу,
// планування не змінюється — змінна лише дає чим дочекатись їх усіх.
let inFlight: Promise<unknown> = Promise.resolve();

/**
 * Resolves once every dual-write started so far has settled.
 *
 * `triggerRoutineDualWrite` is fire-and-forget, so a caller that
 * reloads the page right after it loses the write — which is exactly
 * what the Hub-backup import did (`core/hub/hubBackup.ts` →
 * `window.location.reload()`).
 */
export async function routineDualWriteIdle(): Promise<void> {
  let awaited: Promise<unknown> | null = null;
  while (awaited !== inFlight) {
    awaited = inFlight;
    await awaited;
  }
}

/**
 * Fire-and-forget entry point used by `routineStorage.ts` /
 * `routineStore.ts`. Resolves immediately so the LS-write call site
 * doesn't pay any latency on the happy path.
 */
export function triggerRoutineDualWrite(
  prev: RoutineState,
  next: RoutineState,
): void {
  const ctx = registeredContext;
  if (!ctx) return;
  // Вікно відкривається СИНХРОННО, ще до мікротаски: оновлення кеша, яке
  // стартує в цьому ж тіку, має вже бачити запис у польоті. Розбір —
  // `../localWriteWindow.ts`.
  beginRoutineLocalWrite();
  // Schedule on a microtask so a synchronous LS-side caller gets
  // control back before any async work begins.
  const task = Promise.resolve()
    .then(() => dualWriteRoutineState(prev, next))
    .catch((err) => {
      logSafe(ctx, "warn", "dual-write task failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    })
    // `.finally` ПІСЛЯ `.catch`: вікно має закритись і на успіху, і на
    // відмові. Якби `.catch` стояв нижче, відмова закривала б вікно, не
    // дійшовши до логу.
    .finally(() => {
      endRoutineLocalWrite();
    });
  inFlight = Promise.allSettled([inFlight, task]);
}

function logSafe(
  ctx: RoutineDualWriteContext,
  level: "warn" | "info",
  msg: string,
  meta: Record<string, unknown>,
): void {
  try {
    if (ctx.logger) ctx.logger(level, msg, meta);
    else if (level === "warn")
      webLogger.warn(`[routine.dualWrite] ${msg}`, meta);
  } catch {
    /* noop — logging must never throw */
  }
}

// Re-exports for callers that need the lower-level pieces (mostly tests).
export {
  applyRoutineDualWriteOps,
  diffRoutineDualWriteOps,
  type ApplyDualWriteResult,
  type DualWriteLogger,
  type DualWriteOutcome,
};
