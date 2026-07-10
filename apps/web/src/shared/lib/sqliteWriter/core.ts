/**
 * Web re-export shim for the shared SQLite writer framework (`@sergeant/dualwrite-core`).
 * Last validated: 2026-07-10
 * Status: Active
 *
 * ADR-0073 крок 1: платформо-нейтральне ядро (op-loop, числові конвертери,
 * типи) переїхало у `@sergeant/dualwrite-core`; цей файл лишається канонічним
 * import-шляхом для web-адаптерів (`@shared/lib/sqliteWriter/core`). Тут живе
 * лише web-специфіка — `createDefaultLogger` поверх shared web-логера.
 *
 * Dual-write teardown Phase 5 (2026-07-10): каталог перейменовано з `dualWrite/`
 * на `sqliteWriter/` — LS-запис модульних даних прибрано; pipeline лишається
 * SQLite-canonical writer + parity probe.
 */

// The `@shared/lib` barrel is the sanctioned source for `logger`
// (`sergeant-design/no-flat-shared-lib` forbids deep `@shared/lib/*` imports).
// This is cycle-free: the barrel does not re-export `shared/lib/sqliteWriter`, so
// nothing in its graph imports this file back. (The previous lazy `require`
// only resolved under Vite, never in the Vitest runner — see core.test.ts.)
import { logger as sharedLogger } from "@shared/lib";
import type { DualWriteLogger } from "@sergeant/dualwrite-core";

export type {
  ApplyDualWriteOptions,
  ApplyDualWriteResult,
  ApplyOutcome,
  DualWriteLogger,
} from "@sergeant/dualwrite-core";
export {
  applyDualWriteOps,
  toIntOrNull,
  toRealOrNull,
} from "@sergeant/dualwrite-core";

/**
 * Default logger that forwards warnings to the shared web logger.
 */
export const createDefaultLogger = (prefix: string): DualWriteLogger => {
  return (level, message, meta) => {
    if (level === "warn") {
      sharedLogger.warn(`[${prefix}] ${message}`, meta ?? {});
    }
  };
};
