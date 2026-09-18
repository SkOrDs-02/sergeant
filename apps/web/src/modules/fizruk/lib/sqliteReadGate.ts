/**
 * Last validated: 2026-08-28
 * Status: Active
 *
 * Read-path subscription for the Fizruk SQLite cutover.
 *
 * Тонка обгортка над спільною фабрикою `createSqliteReadGate` —
 * реалізація pub-sub, mutation-window семантика (DCRUD-007) і
 * browser-test сигнали живуть там. Історичні імена експортів збережено:
 * їх мокають тести (`vi.mock("../lib/sqliteReadGate")`) і використовує
 * dual-write черга.
 *
 * AI-NOTE: `onAfterNotify` → `emitHubBus("storageUpdated")` — фікс F3/F10:
 * Hub Reports / Dashboard пере-агрегуються в тій же вкладці одразу, не
 * чекаючи cross-tab storage event. Це єдина відмінність fizruk-гейта.
 */
import { createSqliteReadGate } from "@shared/lib/db/createSqliteReadGate";
import { emitHubBus } from "@shared/lib/modules/hubBus";

const gate = createSqliteReadGate("fizruk", {
  onAfterNotify: () => emitHubBus("storageUpdated", undefined),
});

/** Opened by the dual-write queue at enqueue time (one per write). */
export const __openFizrukSqliteMutationWindow = gate.openMutationWindow;

/** Closed by the dual-write queue after apply → refresh completes. */
export const __closeFizrukSqliteMutationWindow = gate.closeMutationWindow;

/**
 * React-hook for components that overlay reads from the SQLite cache.
 * Re-renders whenever {@link notifyFizrukSqliteCacheRefresh} fires.
 */
export function useFizrukSqliteReadTick(): number {
  return gate.useReadTick();
}

/**
 * Bumps the tick + notifies subscribers so consuming hooks re-render
 * with the latest `getCachedFizrukSqliteState()`.
 */
export const notifyFizrukSqliteCacheRefresh = gate.notifyCacheRefresh;

/** Test-only escape hatch: clears subscribers + resets tick. */
export const __resetFizrukSqliteReadGateForTests = gate.resetForTests;
