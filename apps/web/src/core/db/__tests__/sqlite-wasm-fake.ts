import { vi } from "vitest";

/**
 * Lightweight stand-in for `@sqlite.org/sqlite-wasm` used in the unit
 * tests under `apps/web/src/core/db/__tests__`. It mirrors the parts of
 * the surface area `core/db/sqlite.ts` actually depends on:
 *
 * - `default(opts)` — async init returning a `sqlite3` static object.
 * - `sqlite3.installOpfsSAHPoolVfs(opts)` — returns `{ OpfsSAHPoolDb }`.
 * - `sqlite3.oo1.JsStorageDb`, `sqlite3.oo1.DB` — constructors that
 *   yield a tiny in-memory key-value store with the relevant `exec`
 *   shape (`bind`, `rowMode`, `returnValue`).
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
  private cols: string[] = [];

  exec(arg: ExecArg): unknown[][] | undefined {
    const { sql, bind, returnValue } =
      typeof arg === "string"
        ? { sql: arg, bind: undefined, returnValue: "this" as const }
        : arg;
    const stmt = sql.trim().toUpperCase();
    if (stmt.startsWith("CREATE TABLE")) {
      const m = sql.match(/\(([^)]+)\)/);
      if (m) {
        this.cols = m[1].split(",").map((c) => c.trim().split(/\s+/)[0]);
      }
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
    this.cols = [];
  }
}

class JsStorageDb extends FakeRows {
  constructor(_mode?: "local" | "session") {
    super();
  }
}

class DB extends FakeRows {
  constructor(_filename?: string, _flags?: string) {
    super();
  }
}

class OpfsSAHPoolDb extends FakeRows {
  constructor(_filename: string) {
    super();
  }
}

const installOpfsSAHPoolVfs = vi.fn(async () => ({
  OpfsSAHPoolDb,
  addCapacity: vi.fn(),
  exportFile: vi.fn(),
  getCapacity: vi.fn(),
  getFileCount: vi.fn(),
  getFileNames: vi.fn(),
  importDb: vi.fn(),
}));

export const installOpfsSAHPoolVfsMock = installOpfsSAHPoolVfs;

const sqlite3Static = {
  oo1: { DB, JsStorageDb, OpfsDb: DB },
  installOpfsSAHPoolVfs,
};

const sqlite3InitModule = vi.fn(async () => sqlite3Static);

export const sqlite3InitModuleMock = sqlite3InitModule;
export default sqlite3InitModule;
