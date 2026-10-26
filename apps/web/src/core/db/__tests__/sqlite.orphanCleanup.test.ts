// @vitest-environment jsdom
/**
 * @status Active
 *
 * priv-05 (залишок): після виходу файлу `sergeant-<id>.db` немає, а якщо
 * стирання не завершилось, наступний старт доводить його; осиротілі файли
 * прибираються лише з порожньою чергою синхронізації.
 *
 * Не e2e: у середовищі, де писався тест, немає браузера, а справжній OPFS
 * недоступний в jsdom. Тому, як і `sqlite.workerWipe.test.ts`, тут справжні
 * `sqlite.ts` + `sqliteWorkerClient.ts` + `sqliteWorker.ts`, з'єднані
 * фейковим `Worker`, а підмінено лише sqlite-wasm: пул ПАМʼЯТАЄ файли, тож
 * «файлу немає» перевіряється по його вмісту, а не по виклику `unlink`.
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
  const state = {
    files: new Set<string>(),
    /** Скільки недоставлених рядків у чужому файлі; `"broken"` - не читається. */
    outbox: new Map<string, number | "broken">(),
    openHandles: 0,
    unlinkThrows: false,
  };
  const norm = (name: string) => (name.startsWith("/") ? name : `/${name}`);
  return { state, norm };
});

vi.mock("@sqlite.org/sqlite-wasm", () => {
  class FakeDb {
    private readonly file: string;
    private readonly probe: boolean;
    constructor(name: string) {
      this.file = wasm.norm(name);
      this.probe = wasm.state.files.has(this.file);
      wasm.state.files.add(this.file);
      wasm.state.openHandles += 1;
    }
    close() {
      wasm.state.openHandles -= 1;
    }
    exec(options: { sql?: string }) {
      if (options.sql?.includes("sync_op_outbox") && this.probe) {
        const n = wasm.state.outbox.get(this.file);
        if (n === undefined || n === "broken") {
          throw new Error("no such table: sync_op_outbox");
        }
        return [[n]];
      }
      return [];
    }
  }
  const pool = {
    OpfsSAHPoolDb: FakeDb,
    getCapacity: () => 24,
    getFileCount: () => wasm.state.files.size,
    getFileNames: () => [...wasm.state.files],
    addCapacity: async () => 0,
    importDb: async () => {},
    unlink(name: string) {
      if (wasm.state.unlinkThrows) throw new Error("unlink failed");
      return wasm.state.files.delete(wasm.norm(name));
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

import {
  __resetSqliteDbForTests,
  getSqliteDb,
  setSqliteUser,
  wipeSqliteDb,
} from "../sqlite";
import { __resetDbOwnershipForTests } from "../dbOwnership";
import {
  PENDING_SQLITE_WIPE_KEY,
  readPendingSqliteWipes,
} from "../sqliteOrphanCleanup";

interface BridgeWorker {
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: unknown;
  onmessageerror: unknown;
  postMessage: (data: unknown) => void;
  terminate: () => void;
}

let live: BridgeWorker | null = null;
let terminated = false;

beforeAll(async () => {
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
  wasm.state.files.clear();
  wasm.state.outbox.clear();
  wasm.state.openHandles = 0;
  wasm.state.unlinkThrows = false;
  window.localStorage.clear();
  Object.defineProperty(globalThis.navigator, "storage", {
    value: undefined,
    configurable: true,
  });
  Object.defineProperty(globalThis, "Worker", {
    configurable: true,
    value: function BridgeWorkerCtor(this: unknown) {
      terminated = false;
      const worker: BridgeWorker = {
        onmessage: null,
        onerror: null,
        onmessageerror: null,
        postMessage: (data) => {
          if (terminated) return;
          (globalThis.onmessage as ((event: unknown) => void) | null)?.({
            origin: "",
            data,
          });
        },
        terminate: () => {
          terminated = true;
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

/** Прибирання після відкриття іде без await: чекаємо, поки воно відпрацює. */
async function cleanupSettled(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 20));
}

describe("priv-05: після виходу файлу немає", () => {
  it("успішний вихід: файл партиції зник з пулу, маркер знімає відкриття анонімної партиції", async () => {
    setSqliteUser("dave");
    await getSqliteDb();
    expect(wasm.state.files.has("/sergeant-dave.db")).toBe(true);

    await wipeSqliteDb();

    expect(wasm.state.files.has("/sergeant-dave.db")).toBe(false);
    // Маркер лишається до анонімного відкриття: між `wipe` і перемиканням
    // на анонімну партицію файл ще можна перевідкрити ключем акаунта.
    expect(readPendingSqliteWipes()).toEqual(["sergeant-dave.db"]);

    setSqliteUser(null);
    await getSqliteDb();
    await cleanupSettled();
    expect(window.localStorage.getItem(PENDING_SQLITE_WIPE_KEY)).toBeNull();
  });

  it("стирання впало: файл лишився й маркер стоїть, а наступний старт доводить стирання", async () => {
    setSqliteUser("erin");
    await getSqliteDb();
    wasm.state.unlinkThrows = true;

    await wipeSqliteDb();

    expect(wasm.state.files.has("/sergeant-erin.db")).toBe(true);
    expect(readPendingSqliteWipes()).toEqual(["sergeant-erin.db"]);

    // «Наступний старт»: пул знову справний, відкривається анонімна партиція.
    wasm.state.unlinkThrows = false;
    __resetSqliteDbForTests();
    __resetDbOwnershipForTests();
    setSqliteUser(null);
    await getSqliteDb();
    await cleanupSettled();

    expect(wasm.state.files.has("/sergeant-erin.db")).toBe(false);
    expect(wasm.state.files.has("/sergeant-anon.db")).toBe(true);
    expect(readPendingSqliteWipes()).toEqual([]);
  });

  it("людина встигла увійти знову: активний файл із маркера не видаляється", async () => {
    window.localStorage.setItem(
      PENDING_SQLITE_WIPE_KEY,
      JSON.stringify(["sergeant-gina.db"]),
    );
    wasm.state.files.add("/sergeant-gina.db");

    setSqliteUser("gina");
    await getSqliteDb();
    await cleanupSettled();

    expect(wasm.state.files.has("/sergeant-gina.db")).toBe(true);
    expect(readPendingSqliteWipes()).toEqual([]);
  });
});

describe("priv-05: осиротілі файли пристроїв, де виходили до фіксу", () => {
  it("видаляє осиротілі з порожньою чергою, лишає недоставлене, нечитане, анонімне й активне", async () => {
    for (const name of ["old", "busy", "broken", "anon"]) {
      wasm.state.files.add(`/sergeant-${name}.db`);
    }
    wasm.state.files.add("/sergeant-old.db-journal");
    wasm.state.outbox.set("/sergeant-old.db", 0);
    wasm.state.outbox.set("/sergeant-busy.db", 3);
    wasm.state.outbox.set("/sergeant-broken.db", "broken");

    setSqliteUser("frank");
    await getSqliteDb();
    await cleanupSettled();

    const left = [...wasm.state.files].sort();
    expect(left).toEqual([
      "/sergeant-anon.db",
      "/sergeant-broken.db",
      "/sergeant-busy.db",
      "/sergeant-frank.db",
    ]);
  });
  it("бут на анонімній партиції не чіпає файл акаунта з порожньою чергою", async () => {
    // Бут завжди відкриває `sergeant-anon.db` першим, поки сесія невідома.
    // Раніше файл залогіненої людини тут видалявся на кожному старті, і дані
    // їхали з сервера заново (корінь падінь E2E, через які відкотили #1621).
    wasm.state.files.add("/sergeant-holly.db");
    wasm.state.outbox.set("/sergeant-holly.db", 0);

    setSqliteUser(null);
    await getSqliteDb();
    await cleanupSettled();

    expect(wasm.state.files.has("/sergeant-holly.db")).toBe(true);
    expect(wasm.state.files.has("/sergeant-anon.db")).toBe(true);
  });
});
