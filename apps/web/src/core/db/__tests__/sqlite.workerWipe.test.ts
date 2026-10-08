// @vitest-environment jsdom
/**
 * @status Active
 *
 * priv-05: вихід має стирати файл `sergeant-<id>.db` на воркерному бекенді.
 *
 * Регресія, яку стережемо: `wipeSqliteDb` спершу викликав `close()`, клієнт
 * воркера у `finally` робив `terminate()` і ставив `dead`, тож наступний
 * `wipe()` відхилявся ще на клієнті, повідомлення `wipe` до воркера не
 * доходило і `pool.unlink` не виконувався ніколи (помилку ковтав `logger`).
 *
 * Тому цей тест НЕ мокає ні `sqliteWorkerClient`, ні `wipe`: справжні
 * `sqlite.ts` + `sqliteWorkerClient.ts` + `sqliteWorker.ts`, з'єднані
 * фейковим `Worker`, а підмінено лише сам sqlite-wasm (пул і базу). Фейковий
 * `Worker` після `terminate()` мовчить, як і справжній.
 */
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const wasm = vi.hoisted(() => {
  const events: string[] = [];
  const state = { dbOpen: false, unlinkThrows: false };
  return { events, state };
});

vi.mock("@sqlite.org/sqlite-wasm", () => {
  class FakeDb {
    constructor(public readonly name: string) {
      wasm.state.dbOpen = true;
    }
    close() {
      wasm.state.dbOpen = false;
      wasm.events.push("db.close");
    }
    exec() {
      return [];
    }
  }
  const pool = {
    OpfsSAHPoolDb: FakeDb,
    getCapacity: () => 24,
    getFileCount: () => 2,
    getFileNames: () => [] as string[],
    addCapacity: async () => 0,
    importDb: async () => {},
    unlink(name: string) {
      // Контракт пулу: результат `unlink` невизначений, доки файл відкритий.
      if (wasm.state.dbOpen) throw new Error("unlink while db is open");
      if (wasm.state.unlinkThrows) throw new Error("unlink failed");
      wasm.events.push(`unlink:${name}`);
      return true;
    },
  };
  return {
    default: vi.fn(async () => ({
      installOpfsSAHPoolVfs: vi.fn(async () => pool),
      oo1: {},
    })),
  };
});
vi.mock("../../observability/sentry.js", () => ({
  addSentryBreadcrumb: vi.fn(),
  setSentryTag: vi.fn(),
}));
vi.mock("../kvvfsHandoff.js", () => ({
  isHandoffDone: vi.fn(() => true),
  markHandoffDone: vi.fn(),
  readKvvfsSnapshotBytes: vi.fn(async () => null),
  pruneForeignPartitionRows: vi.fn(async () => 0),
}));
const loggerError = vi.hoisted(() => vi.fn());
vi.mock("../../../shared/lib/log/logger", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../shared/lib/log/logger")>();
  return { ...actual, logger: { ...actual.logger, error: loggerError } };
});

import {
  __resetSqliteDbForTests,
  getSqliteDb,
  setSqliteUser,
  wipeSqliteDb,
} from "../sqlite";
import { __resetDbOwnershipForTests } from "../dbOwnership";

interface BridgeWorker {
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: unknown;
  onmessageerror: unknown;
  postMessage: (data: unknown) => void;
  terminate: () => void;
}

let live: BridgeWorker | null = null;
let terminated = false;
const sent: string[] = [];

beforeAll(async () => {
  // Воркер відповідає через `self.postMessage` — вертаємо це у фейковий Worker.
  Object.defineProperty(globalThis, "postMessage", {
    value: (message: unknown) => {
      if (!terminated) live?.onmessage?.({ data: message });
    },
    configurable: true,
  });
  await import("../sqliteWorker");
});

beforeEach(() => {
  __resetSqliteDbForTests();
  __resetDbOwnershipForTests();
  wasm.events.length = 0;
  wasm.state.dbOpen = false;
  wasm.state.unlinkThrows = false;
  terminated = false;
  sent.length = 0;
  loggerError.mockClear();
  Object.defineProperty(globalThis.navigator, "storage", {
    value: undefined,
    configurable: true,
  });
  Object.defineProperty(globalThis, "Worker", {
    configurable: true,
    value: function BridgeWorkerCtor(this: unknown) {
      const worker: BridgeWorker = {
        onmessage: null,
        onerror: null,
        onmessageerror: null,
        postMessage: (data) => {
          if (terminated) return;
          sent.push((data as { kind: string }).kind);
          (globalThis.onmessage as ((event: unknown) => void) | null)?.({
            origin: "",
            data,
          });
        },
        terminate: () => {
          terminated = true;
          wasm.events.push("worker.terminate");
        },
      };
      live = worker;
      return worker;
    },
  });
});

afterEach(() => {
  __resetSqliteDbForTests();
  live = null;
});

describe("wipeSqliteDb на воркерному бекенді (priv-05)", () => {
  it("доносить wipe до воркера, який закриває БД і робить pool.unlink, а terminate іде після", async () => {
    setSqliteUser("dave");
    const handle = await getSqliteDb();
    expect(handle.vfs).toBe("opfs-sahpool");

    await wipeSqliteDb();

    // Повідомлення `wipe` справді дійшло до воркера, а `close` після нього
    // клієнт уже не шле (воркер вбито).
    expect(sent).toContain("wipe");
    expect(sent.indexOf("wipe")).toBeLessThan(
      sent.includes("close") ? sent.indexOf("close") : Infinity,
    );
    // Воркер сам закрив БД ПЕРЕД unlink; terminate — лише потім.
    expect(wasm.events).toEqual([
      "db.close",
      "unlink:sergeant-dave.db",
      "worker.terminate",
    ]);
    expect(loggerError).not.toHaveBeenCalled();
  });

  it("збій unlink не ковтається мовчки: logger.error, а воркер усе одно гаситься", async () => {
    setSqliteUser("erin");
    await getSqliteDb();
    wasm.state.unlinkThrows = true;

    await expect(wipeSqliteDb()).resolves.toBeUndefined();

    expect(loggerError).toHaveBeenCalledWith(
      "[sqlite] storage wipe failed",
      expect.any(Error),
    );
    expect(terminated).toBe(true);
    expect(wasm.events).not.toContain("unlink:sergeant-erin.db");
  });
});
