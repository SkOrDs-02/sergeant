import { vi } from "vitest";

/**
 * Lightweight stand-in for `@sqlite.org/sqlite-wasm` used in the unit
 * tests under `apps/web/src/core/db/__tests__`. Since PR-T1 (2026-11-18)
 * the package is only used inside the worker, so the fake mirrors what
 * `sqliteWorkerHandler.ts` depends on (driven in-process by
 * `inProcessSqliteWorker.ts`):
 *
 * - `default(opts)` — async init returning a `sqlite3` static object.
 * - `sqlite3.installOpfsSAHPoolVfs(opts)` — returns `{ OpfsSAHPoolDb }`;
 *   rejects like the real one when `navigator.storage.getDirectory` is
 *   missing, so tests can simulate a browser without worker OPFS.
 * - `sqlite3.oo1.DB` — constructor that yields a tiny in-memory
 *   key-value store with the relevant `exec` shape (`bind`, `rowMode`,
 *   `returnValue`).
 *
 * It's intentionally NOT a full SQLite implementation — the round-trip
 * test in `sqlite.roundtrip.test.ts` uses the real package against an
 * in-memory DB so that path runs SQL for real.
 */

type Bind = readonly unknown[] | undefined;
type ExecArg =
  | string
  | {
      sql: string;
      bind?: Bind;
      rowMode?: "array" | "object";
      returnValue?: "this" | "resultRows";
    };

class FakeRows {
  private rows: unknown[][] = [];

  exec(arg: ExecArg): unknown[][] | undefined {
    const { sql, bind, returnValue } =
      typeof arg === "string"
        ? { sql: arg, bind: undefined, returnValue: "this" as const }
        : arg;
    const stmt = sql.trim().toUpperCase();
    if (stmt.startsWith("CREATE TABLE")) {
      // Fake schema parsing was tracked here (column-name list) but is
      // unused — `exec("SELECT ...")` returns rows verbatim without column
      // metadata. Drop the field rather than carry dead state.
      return undefined;
    }
    if (stmt.startsWith("INSERT")) {
      this.rows.push(Array.from(bind ?? []));
      return undefined;
    }
    if (stmt.startsWith("SELECT")) {
      if (returnValue === "resultRows") return this.rows.map((r) => [...r]);
      return undefined;
    }
    return undefined;
  }

  close(): void {
    this.rows = [];
  }
}

class DB extends FakeRows {
  constructor(_filename?: string, _flags?: string) {
    super();
  }
}

/** Filenames passed to `new OpfsSAHPoolDb(...)`, in order — lets tests
 *  assert per-user DB naming (`sergeant-<userKey>.db`). */
export const createdOpfsFilenames: string[] = [];
/** `SAHPoolUtil.unlink` spy — lets tests assert wipe-on-logout deletes the
 *  right per-user file. */
export const opfsUnlinkMock = vi.fn((_name: string) => true);

class OpfsSAHPoolDb extends FakeRows {
  constructor(filename: string) {
    super();
    createdOpfsFilenames.push(filename);
  }
}

/**
 * Стан ємності SAH-пулу для тестів.
 *
 * Раніше `getCapacity`/`getFileCount` були порожніми `vi.fn()` і віддавали
 * `undefined` — арифметика над ними давала `NaN`, тож будь-яка перевірка
 * запасу слотів у коді проходила б повз тест непоміченою. Тримаємо
 * справжні числа: саме на переповненні цього пулу застосунок і отримував
 * `SQLITE_IOERR` (звіт власника 2026-09-14).
 */
export const sahPoolState = { capacity: 0, fileCount: 0 };

/** Спай на доростання ємності — пул не росте сам, це робить `sqlite.ts`. */
export const addCapacityMock = vi.fn(async (n: number) => {
  sahPoolState.capacity += n;
});

const installOpfsSAHPoolVfs = vi.fn(
  async (options?: { initialCapacity?: number }) => {
    // Справжній пакет перевіряє рівно це (плюс `createSyncAccessHandle`).
    const storage = (
      globalThis as { navigator?: { storage?: { getDirectory?: unknown } } }
    ).navigator?.storage;
    if (typeof storage?.getDirectory !== "function") {
      throw new Error("Missing required OPFS APIs.");
    }
    sahPoolState.capacity = options?.initialCapacity ?? 6;
    return {
      OpfsSAHPoolDb,
      unlink: opfsUnlinkMock,
      addCapacity: addCapacityMock,
      exportFile: vi.fn(),
      getCapacity: () => sahPoolState.capacity,
      getFileCount: () => sahPoolState.fileCount,
      getFileNames: vi.fn(() => [] as string[]),
      importDb: vi.fn(),
    };
  },
);

export const installOpfsSAHPoolVfsMock = installOpfsSAHPoolVfs;

const sqlite3Static = {
  oo1: { DB, OpfsDb: DB },
  installOpfsSAHPoolVfs,
};

const sqlite3InitModule = vi.fn(async () => sqlite3Static);

export const sqlite3InitModuleMock = sqlite3InitModule;
export default sqlite3InitModule;
