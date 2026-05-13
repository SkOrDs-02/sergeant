/**
 * Runtime kill-switch registry — in-memory override для env-based feature
 * flag-ів (RAG eval weekly cron, PR-22→follow-up).
 *
 * Архітектура:
 *
 *   env (Railway)           lib/featureFlags/runtimeKillSwitch.ts
 *   MONO_AI_MEMORY_INGEST  ◀── авторитет на startup
 *           ↓
 *   ingestQueue.ts:  isKillSwitchActive("mono_ai_memory_ingest")
 *                    ? "force OFF" : env.MONO_AI_MEMORY_INGEST_ENABLED
 *
 * Тригер:
 *   POST /api/internal/eval/rag-weekly → recall@4 < kill_threshold
 *      → activateKillSwitch("mono_ai_memory_ingest", { reason, recall, mode })
 *
 * Чому in-memory (не БД-таблиця):
 *   - Railway деплой — single instance; multi-instance scale-up зайде з PR-X
 *     пізніше, тоді потрібна буде DB-backed реалізація.
 *   - Reset на restart — feature, а не баг: operator має шанс розслідувати
 *     причину і ввімкнути вручну якщо false-positive (через runbook).
 *   - Зменшує scope PR — без міграції / RPC / sync-логіки між instance-ами.
 *
 * Спостережуваність:
 *   - `runtime_kill_switch_active{switch}` gauge у `obs/metrics.ts`
 *   - `runtime_kill_switch_activations_total{switch,outcome}` counter
 *   - Sentry breadcrumb на кожен activate/deactivate (не captureMessage,
 *     бо caller endpoint уже captureMessage-ить події вище у stack).
 */

import * as Sentry from "@sentry/node";
import { logger } from "../../obs/logger.js";
import {
  runtimeKillSwitchActive,
  runtimeKillSwitchActivationsTotal,
} from "../../obs/metrics.js";

export type KillSwitchName =
  | "mono_ai_memory_ingest"
  | "rag_retrieval"
  | "rag_eval_weekly";

interface KillSwitchState {
  active: boolean;
  reason: string;
  activatedAt: Date;
  /** Free-form context (recall, mode, etc.) для inspect-ендпойнтів. */
  context: Readonly<Record<string, unknown>>;
}

const KILL_SWITCHES: Map<KillSwitchName, KillSwitchState> = new Map();

/**
 * Активує kill-switch. Ідемпотентне: повторний виклик з тим самим `name`
 * перезаписує `reason` + `activatedAt` + `context` (щоб alert reflect-ив
 * найсвіжіший trigger).
 */
export function activateKillSwitch(
  name: KillSwitchName,
  options: { reason: string; context?: Record<string, unknown> },
): void {
  const wasActive = KILL_SWITCHES.get(name)?.active === true;
  const state: KillSwitchState = {
    active: true,
    reason: options.reason,
    activatedAt: new Date(),
    context: options.context ?? {},
  };
  KILL_SWITCHES.set(name, state);

  try {
    runtimeKillSwitchActive.set({ switch: name }, 1);
    runtimeKillSwitchActivationsTotal.inc({
      switch: name,
      outcome: wasActive ? "reactivate" : "activate",
    });
  } catch {
    /* metrics never break kill-switch logic */
  }

  logger.warn({
    msg: "runtime_kill_switch_activated",
    name,
    reason: options.reason,
    context: options.context ?? {},
    wasActive,
  });

  try {
    Sentry.addBreadcrumb({
      category: "kill_switch",
      level: "warning",
      message: `Activated ${name}`,
      data: { reason: options.reason, ...(options.context ?? {}) },
    });
  } catch {
    /* sentry never blocks kill-switch */
  }
}

/**
 * Деактивує kill-switch (operator-recovery шлях через runbook).
 * Noop якщо вже неактивний.
 */
export function deactivateKillSwitch(name: KillSwitchName): void {
  const prev = KILL_SWITCHES.get(name);
  if (prev?.active !== true) return;
  KILL_SWITCHES.delete(name);

  try {
    runtimeKillSwitchActive.set({ switch: name }, 0);
    runtimeKillSwitchActivationsTotal.inc({
      switch: name,
      outcome: "deactivate",
    });
  } catch {
    /* metrics never break kill-switch logic */
  }

  logger.info({
    msg: "runtime_kill_switch_deactivated",
    name,
    previousReason: prev.reason,
    activatedAt: prev.activatedAt.toISOString(),
  });
}

/**
 * Перевіряє чи активний kill-switch. Викликати у hot-path (ingest enqueue,
 * RAG retrieval, etc.) перед звертанням до env-flag-у.
 */
export function isKillSwitchActive(name: KillSwitchName): boolean {
  return KILL_SWITCHES.get(name)?.active === true;
}

/**
 * Snapshot активних kill-switch-ів (для `/health` / `/api/internal/status`
 * діагностики). Повертає immutable копію — щоб caller не зміг через
 * mutability обійти `activateKillSwitch`.
 */
export function listActiveKillSwitches(): Array<{
  name: KillSwitchName;
  reason: string;
  activatedAt: string;
  context: Readonly<Record<string, unknown>>;
}> {
  const out: ReturnType<typeof listActiveKillSwitches> = [];
  for (const [name, state] of KILL_SWITCHES.entries()) {
    if (!state.active) continue;
    out.push({
      name,
      reason: state.reason,
      activatedAt: state.activatedAt.toISOString(),
      context: state.context,
    });
  }
  return out;
}

/**
 * Test-only reset. НЕ викликати з prod-коду — тільки з vitest `beforeEach`.
 */
export function __resetKillSwitchesForTest(): void {
  for (const name of [...KILL_SWITCHES.keys()]) {
    KILL_SWITCHES.delete(name);
    try {
      runtimeKillSwitchActive.set({ switch: name }, 0);
    } catch {
      /* test reset never throws */
    }
  }
}
