/**
 * Last validated: 2026-08-28
 * Status: Active
 *
 * Read-path subscription for the Finyk SQLite cutover.
 *
 * Тонка обгортка над спільною фабрикою `createSqliteReadGate` —
 * реалізація pub-sub, mutation-window семантика (DCRUD-007) і
 * browser-test сигнали живуть там. Історичні імена експортів збережено:
 * їх мокають тести (`vi.mock("../lib/sqliteReadGate")`) і використовує
 * dual-write черга.
 */
import { createSqliteReadGate } from "@shared/lib/db/createSqliteReadGate";

const gate = createSqliteReadGate("finyk");

/** Opened by the dual-write queue at enqueue time (one per write). */
export const __openFinykSqliteMutationWindow = gate.openMutationWindow;

/** Closed by the dual-write queue after apply → refresh completes. */
export const __closeFinykSqliteMutationWindow = gate.closeMutationWindow;

/**
 * React hook for components that overlay reads from the SQLite cache.
 * Re-renders whenever {@link notifyFinykSqliteCacheRefresh} fires.
 */
export function useFinykSqliteReadTick(): number {
  return gate.useReadTick();
}

/**
 * Bumps the tick + notifies subscribers so consuming hooks re-render
 * with the latest `getCachedFinykSqliteState()`.
 */
export const notifyFinykSqliteCacheRefresh = gate.notifyCacheRefresh;

/** Test-only escape hatch: clears subscribers + resets tick. */
export const __resetFinykSqliteReadGateForTests = gate.resetForTests;
