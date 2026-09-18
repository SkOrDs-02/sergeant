/**
 * Boot wiring for the routine dual-write context (PR #024 follow-up).
 *
 * Stage 4 of `https://github.com/Skords-01/Sergeant/blob/d068c73a2f21881d5c1305544fe99f3ea8be81f4/docs/90-work/planning/archive/storage-roadmap.md`. PR #024 shipped the
 * dual-write orchestrator (`registerRoutineDualWriteContext`) and the
 * `routineStorage.ts` trigger, but never installed the context from
 * the platform bootstrap — so the dual-write pipeline stayed dormant
 * in production even with the flag flipped on. This module closes that
 * gap by handing back a `register / teardown` pair the React layer can
 * call from `RoutineApp` once the user is known and the React-Query
 * `me` cache + sqlite singleton are reachable.
 *
 * Stage 8 PR #056r dropped the `isFlagEnabled` callback — the
 * `feature.routine.sqlite_v2.dual_write` flag was removed from the
 * registry once it had been default-on with no toggle path remaining.
 * Registration is now `userId`-gated only.
 *
 * Why not register from `main.tsx` directly:
 *
 *  - `getUserId` must read from the React-Query cache that lives below
 *    `<App />`, so the registration has to happen after the provider
 *    tree mounts. A React hook is the cleanest cut.
 *
 * The actual `registerRoutineDualWriteContext` is provided by the
 * dual-write barrel; this module is purely the wiring layer.
 */

import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";
import { getSqliteDb } from "../../../core/db/sqlite.js";
import {
  registerRoutineDualWriteContext,
  type RoutineDualWriteContext,
} from "./sqliteWriter/index.js";
import { migrateRoutine } from "./clientMigrate.js";

/**
 * Inputs the boot helper needs from the React layer.
 *
 * `getUserId` is captured as a callback (not a string) so the live
 * value from the `me` cache is read at call time rather than at
 * registration time — auth state can change without re-registration.
 */
export interface BootRoutineDualWriteInput {
  getUserId(): string | null;
}

/**
 * Засувка «міграції вже прогнано» для шляху ЗАПИСУ.
 *
 * `getMigrationClient` віддає з'єднання, а не готову схему: таблиці
 * модуля створює read-boot, і він асинхронний. Доки база жила в
 * `kvvfs` на головному потоці, той прогін устигав раніше за першу дію
 * людини, і різниці не було видно. З базою в OPFS кожен крок їде
 * раунд-тріпом у воркер, і перший запис почав випереджати міграції:
 * `no such table: routine_habits`, `applied: 0, errored: 2`.
 *
 * Найгірше тут не сам збій, а те, що він тихий: `createApplyOps` ловить
 * помилку кожної операції окремо, тож `saveRoutineState` повертає
 * успіх, звичка лишається в теплому кеші й показується на екрані — і
 * зникає при першому ж оновленні кеша з порожньої бази. Людина бачить
 * створену звичку, потім її назва перестає оновлюватись, потім вона
 * пропадає. Заміри 2026-09-15, гейт `deep-module-crud › routine`.
 *
 * Тому шлях запису прогонить міграції сам — як це вже роблять `finyk`
 * і `nutrition`. Прогін ідемпотентний (реєстр `__migrations`), засувка
 * лише знімає зайву роботу з кожного наступного запису.
 */
let migrationsApplied = false;

/**
 * Install the routine dual-write context.
 *
 * Returns a teardown function. Callers should treat the return value as
 * `useEffect` cleanup so signing out (or unmounting the module shell)
 * clears the context and the LS-write layer can drop its
 * `peekRoutineDualWritePrev` overhead immediately.
 *
 * `getMigrationClient` resolves the lazy sqlite-wasm singleton on the
 * first write — never on registration — so the SQLite chunk doesn't
 * download until the first dual-write actually fires.
 */
export function bootRoutineDualWrite(
  input: BootRoutineDualWriteInput,
): () => void {
  const ctx: RoutineDualWriteContext = {
    getUserId: () => input.getUserId(),
    getMigrationClient: async (): Promise<SqliteMigrationClient | null> => {
      const handle = await getSqliteDb();
      const client = handle.migrationClient();
      if (!migrationsApplied) {
        await migrateRoutine(client);
        migrationsApplied = true;
      }
      return client;
    },
    getNow: () =>
      // eslint-disable-next-line no-restricted-syntax -- LWW clientTs wall-clock, not a Kyiv day key
      new Date().toISOString(),
  };
  return registerRoutineDualWriteContext(ctx);
}

/** Test-only escape hatch — clears the migrations-applied flag. */
export function __resetRoutineDualWriteBootForTests(): void {
  migrationsApplied = false;
}
