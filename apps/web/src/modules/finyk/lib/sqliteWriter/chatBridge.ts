/**
 * Chat-action → SQLite dual-write bridge for Finyk.
 *
 * The hub AI assistant mutates Finyk data through synchronous chat-action
 * executors (`core/lib/chatActions/finykActions/*`) that run OUTSIDE React,
 * so they cannot use the slot-bundle dual-write seam
 * (`useFinykDualWriteSync`). Before this bridge they wrote LS-key blobs
 * only — which never reached the structured `finyk_*` SQLite tables the
 * module UI reads via `getCachedFinykSqliteState()`, so AI-created rows
 * stayed invisible (and flashed-then-vanished on reload as the SQLite
 * overlay overwrote the LS first-paint value).
 *
 * This module is the non-hook equivalent of `useFinykDualWriteSync`:
 *
 *  1. apply the per-slice `prev → next` diff straight to the local
 *     `finyk_*` tables (via {@link applyFinykDualWriteOps});
 *  2. refresh the in-memory read cache from canonical SQLite;
 *  3. bump the read-gate so any mounted Finyk UI re-renders with the new
 *     canonical value.
 *
 * Why direct-apply instead of the full `dualWriteFinykState` orchestrator:
 * that orchestrator runs `probeFinykParity`, which compares the WHOLE
 * `next` state against ALL SQLite rows. A chat write only carries a single
 * mutated slice (the rest empty), so probing it would emit a spurious
 * `recordParityCheck("finyk", "mismatch")` for every other entity class.
 * We still record the `applied`/`errored` outcome telemetry; the parity
 * gate stays meaningful because the manual-UI path (full-state) keeps
 * probing.
 *
 * Best-effort, same contract as the orchestrator: never throws. Відсутній
 * dual-write контекст (асистент викликано з поверхні, де модуль Фініка не
 * змонтувався, або runtime ще не зареєстровано) — це НЕ тихий no-op, а
 * `false`: обидві функції віддають `Promise<boolean>` («запис ліг у SQLite»),
 * і `executeActions` через `settle()` підміняє «створено» на чесну відмову
 * (rel-16). Буфера чи журналу тут немає навмисно: залишкового LS→SQLite
 * імпорту на буті більше немає (прибрано 2026-08, `sqliteReadBoot.ts`),
 * kv-копія значення НЕ дренується в базу, лише дзеркалить канон для
 * first-paint. Екзекутори до того ж не пишуть на холодному кеші
 * (`warmFinykCache`).
 */

import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";

import { isDualWriteOutcomeClean } from "../../../../core/durability/dualWriteJournal.js";
import {
  recordDualWriteOutcome,
  recordReadFallback,
} from "../../../../core/observability/dualWriteTelemetry.js";
import { applyFinykDualWriteOps } from "./adapter.js";
import {
  diffFinykDualWriteOps,
  type FinykDualWriteOp,
  type FinykDualWriteState,
  type FinykPrefsSnapshot,
} from "./diff.js";
import { serializePrefsJson, stateWithSlice } from "./extract.js";
import { getFinykDualWriteRuntime } from "./index.js";
import {
  getCachedFinykSqliteState,
  refreshFinykSqliteState,
} from "../sqliteReader.js";
import { notifyFinykSqliteCacheRefresh } from "../sqliteReadGate.js";

interface ChatDualWriteRuntime {
  readonly client: SqliteMigrationClient;
  readonly userId: string;
  /** Clock source from the registered context (UTC ISO `clientTs` for LWW). */
  readonly getNow: () => string;
}

/**
 * Resolve the SQLite client + user id from the registered dual-write
 * context. Returns `null` (no-op) when no context is registered or the
 * client can't be opened — failures route to `recordReadFallback` so
 * triage can tell a missing-context no-op from a real SQLite error.
 */
async function resolveChatDualWriteRuntime(): Promise<ChatDualWriteRuntime | null> {
  const runtime = getFinykDualWriteRuntime();
  if (!runtime) return null;
  let client: SqliteMigrationClient | null;
  try {
    client = await runtime.getMigrationClient();
  } catch (err) {
    recordReadFallback(
      "finyk",
      err instanceof Error
        ? `chat-mirror-client-failed: ${err.message}`
        : "chat-mirror-client-failed",
    );
    return null;
  }
  if (!client) return null;
  return { client, userId: runtime.userId, getNow: runtime.getNow };
}

/**
 * Apply a pre-computed op list, record telemetry, then refresh the read
 * cache + bump the read-gate so mounted UI re-renders. No parity probe
 * (see module docstring).
 *
 * Повертає `true`, лише коли всі ops застосовано без помилок (або ops нема);
 * збій apply або `errored > 0` — `false`. Збій ОНОВЛЕННЯ кешу після вдалого
 * запису на результат не впливає: дані в базі вже лежать.
 */
async function applyOpsAndRefresh(
  rt: ChatDualWriteRuntime,
  ops: readonly FinykDualWriteOp[],
): Promise<boolean> {
  if (ops.length === 0) return true;
  let result: Awaited<ReturnType<typeof applyFinykDualWriteOps>>;
  try {
    result = await applyFinykDualWriteOps(rt.client, ops, {
      userId: rt.userId,
      clientTs: rt.getNow(),
    });
  } catch (err) {
    recordReadFallback(
      "finyk",
      err instanceof Error
        ? `chat-apply-failed: ${err.message}`
        : "chat-apply-failed",
    );
    return false;
  }
  const outcome = { status: "applied", result } as const;
  recordDualWriteOutcome("finyk", outcome);

  try {
    await refreshFinykSqliteState(rt.client, rt.userId);
    notifyFinykSqliteCacheRefresh();
  } catch (err) {
    recordReadFallback(
      "finyk",
      err instanceof Error
        ? `chat-refresh-failed: ${err.message}`
        : "chat-refresh-failed",
    );
  }
  return isDualWriteOutcomeClean(outcome);
}

/**
 * Mirror a single-slice `prev → next` transition (built via
 * {@link stateWithSlice}) into local SQLite. Віддає `true`, коли запис ліг
 * (або diff порожній), `false` — коли runtime недоступний чи apply впав.
 */
export async function mirrorFinykChatDualWrite(
  prev: FinykDualWriteState,
  next: FinykDualWriteState,
): Promise<boolean> {
  const ops = diffFinykDualWriteOps(prev, next);
  if (ops.length === 0) return true;
  const rt = await resolveChatDualWriteRuntime();
  if (!rt) return false;
  return applyOpsAndRefresh(rt, ops);
}

/**
 * Mirror a monthly-plan change into the singleton `finyk_prefs` row.
 *
 * Prefs is one row carrying five fields (monthly plan, show-balance,
 * excluded-stat-tx ids, dismissed-recurring ids, `prefs_json` з правилами
 * мерчантів). The chat action only knows the monthly plan, so we MUST
 * merge against the other four canonical fields — otherwise the upsert would clobber them with
 * defaults. We read them from the SQLite cache, warming it first when
 * cold so a user with existing prefs is never overwritten.
 *
 * `monthlyPlanJson` — ПОВНИЙ наступний план (екзекутор уже змерджив поля з
 * `cache.monthlyPlan`), не дельта. `prevMonthlyPlanJson` — знімок плану до
 * оптимістичного патча кешу (див. `finykChatWrite`): без нього база для diff-а
 * з кешу вже містила б новий план, і апсерт зник би як no-op.
 */
export async function mirrorFinykChatMonthlyPlan(
  monthlyPlanJson: string,
  prevMonthlyPlanJson?: string,
): Promise<boolean> {
  const rt = await resolveChatDualWriteRuntime();
  if (!rt) return false;

  let cache = getCachedFinykSqliteState();
  if (cache.refreshedAt === null) {
    try {
      cache = await refreshFinykSqliteState(rt.client, rt.userId);
    } catch (err) {
      recordReadFallback(
        "finyk",
        err instanceof Error
          ? `chat-prefs-read-failed: ${err.message}`
          : "chat-prefs-read-failed",
      );
      return false;
    }
  }

  const base: FinykPrefsSnapshot = {
    monthlyPlanJson:
      prevMonthlyPlanJson ?? safeStringify(cache.monthlyPlan ?? {}, "{}"),
    showBalance: cache.showBalance ?? true,
    excludedStatTxIdsJson: safeStringify(cache.excludedStatTxIds ?? [], "[]"),
    dismissedRecurringJson: safeStringify(cache.dismissedRecurring ?? [], "[]"),
    // Чат знає лише місячний план, а `prefs_json` пишеться дослівно: без
    // правил із кешу цей апсерт обнулив би їх разом із планом.
    prefsJson: serializePrefsJson(cache.merchantRules, cache.cashOnHand),
  };

  const ops = diffFinykDualWriteOps(
    stateWithSlice("prefs", base),
    stateWithSlice("prefs", { ...base, monthlyPlanJson }),
  );
  return applyOpsAndRefresh(rt, ops);
}

function safeStringify(value: unknown, fallback: string): string {
  try {
    return JSON.stringify(value);
  } catch {
    return fallback;
  }
}
