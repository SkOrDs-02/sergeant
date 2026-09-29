// @vitest-environment jsdom
/**
 * @status Active
 *
 * Стадія 1 спеки `docs/work/specs/sqlite-opfs-worker.md`: база у воркері
 * за прапорцем.
 *
 * Тести стережуть саме те, що робить стадію злитною без зміни поведінки:
 * вимкнений прапорець НЕ чіпає воркер узагалі, а будь-яка невдача воркера
 * тихо повертає застосунок на наявний головнопотоковий шлях. Третій випадок
 * — увімкнений прапорець і робочий воркер — перевіряє, що запити справді
 * йдуть туди, а не лишаються на старому з'єднанні.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { __resetSqliteDbForTests, getSqliteDb } from "../sqlite";
import { __resetDbOwnershipForTests } from "../dbOwnership";
import { sqlite3InitModuleMock } from "./sqlite-wasm-fake";

vi.mock("@sqlite.org/sqlite-wasm", () => import("./sqlite-wasm-fake"));
vi.mock("../../observability/sentry.js", () => ({
  addSentryBreadcrumb: vi.fn(),
  setSentryTag: vi.fn(),
}));
vi.mock("../sqliteWorkerClient.js", () => ({
  openSqliteInWorker: vi.fn(),
}));
vi.mock("../kvvfsHandoff.js", () => ({
  isHandoffDone: vi.fn(() => true),
  markHandoffDone: vi.fn(),
  readKvvfsSnapshotBytes: vi.fn(async () => null),
  pruneForeignPartitionRows: vi.fn(async () => 0),
}));

import { openSqliteInWorker } from "../sqliteWorkerClient.js";
import {
  isHandoffDone,
  markHandoffDone,
  pruneForeignPartitionRows,
  readKvvfsSnapshotBytes,
} from "../kvvfsHandoff.js";

function fakeWorkerConnection() {
  return {
    dbName: "sergeant-anon.db",
    grewBy: 0,
    imported: false,
    exec: vi.fn(async () => {}),
    run: vi.fn(async () => {}),
    all: vi.fn(async () => [] as unknown[]),
    diagnostics: vi.fn(async () => ({ capacity: 24, fileCount: 2 })),
    close: vi.fn(async () => {}),
    wipe: vi.fn(async () => {}),
  };
}

beforeEach(() => {
  __resetSqliteDbForTests();
  __resetDbOwnershipForTests();
  vi.mocked(openSqliteInWorker).mockReset();
  vi.mocked(isHandoffDone).mockReturnValue(true);
  vi.mocked(markHandoffDone).mockClear();
  vi.mocked(pruneForeignPartitionRows).mockClear();
  vi.mocked(readKvvfsSnapshotBytes).mockClear();
  vi.mocked(readKvvfsSnapshotBytes).mockResolvedValue(null);
  sqlite3InitModuleMock.mockClear();
  // Без OPFS на головному потоці — щоб фолбек був однозначно kvvfs і його
  // не можна було сплутати з успіхом воркера.
  Object.defineProperty(globalThis.navigator, "storage", {
    value: undefined,
    configurable: true,
  });
  Object.defineProperty(globalThis, "localStorage", {
    value: {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    },
    configurable: true,
  });
});

afterEach(() => {
  __resetSqliteDbForTests();
});

describe("бекенд бази у воркері", () => {
  it("запити йдуть у воркер без жодного прапорця (стадія 3)", async () => {
    const conn = fakeWorkerConnection();
    vi.mocked(openSqliteInWorker).mockResolvedValue(conn);

    const handle = await getSqliteDb();
    await handle.migrationClient().exec("CREATE TABLE t (id INTEGER)");

    expect(handle.vfs).toBe("opfs-sahpool");
    expect(conn.exec).toHaveBeenCalledWith("CREATE TABLE t (id INTEGER)");
    // Головнопотоковий модуль під цим прапорцем не потрібен — і не
    // вантажиться. Це половина сенсу переїзду: важкий WASM не займає
    // головний потік.
    expect(sqlite3InitModuleMock).not.toHaveBeenCalled();
  });

  it("переливає стару базу один раз і ставить позначку ОСТАННЬОЮ", async () => {
    vi.mocked(isHandoffDone).mockReturnValue(false);
    const bytes = new ArrayBuffer(512);
    vi.mocked(readKvvfsSnapshotBytes).mockResolvedValue(bytes);
    const conn = fakeWorkerConnection();
    vi.mocked(openSqliteInWorker).mockResolvedValue({
      ...conn,
      imported: true,
    });

    await getSqliteDb();

    expect(vi.mocked(openSqliteInWorker).mock.calls[0]?.[1]).toMatchObject({
      importBytes: bytes,
    });
    expect(pruneForeignPartitionRows).toHaveBeenCalled();
    expect(markHandoffDone).toHaveBeenCalledWith("anon");
  });

  it("підчищає партиції навіть коли файл уже існував", async () => {
    // Попередня спроба могла впасти рівно між імпортом і підчищанням:
    // файл на місці, позначки немає, чужі рядки всередині. Пропустити
    // підчищання тут означало б залишити їх назавжди.
    vi.mocked(isHandoffDone).mockReturnValue(false);
    vi.mocked(openSqliteInWorker).mockResolvedValue({
      ...fakeWorkerConnection(),
      imported: false,
    });

    await getSqliteDb();

    expect(pruneForeignPartitionRows).toHaveBeenCalled();
  });

  it("не чіпає перелиття вдруге, коли позначка вже стоїть", async () => {
    vi.mocked(isHandoffDone).mockReturnValue(true);
    vi.mocked(openSqliteInWorker).mockResolvedValue(fakeWorkerConnection());

    await getSqliteDb();

    // Головне тут — що важкий WASM не вантажиться на головний потік
    // щоразу заради байтів, які вже перелито.
    expect(readKvvfsSnapshotBytes).not.toHaveBeenCalled();
    expect(pruneForeignPartitionRows).not.toHaveBeenCalled();
  });

  it("невдача воркера повертає на kvvfs, поки партиція не перелита", async () => {
    vi.mocked(isHandoffDone).mockReturnValue(false);
    vi.mocked(openSqliteInWorker).mockRejectedValue(
      new Error("Missing required OPFS APIs."),
    );

    const handle = await getSqliteDb();

    expect(handle.vfs).toBe("kvvfs");
  });

  // Після перелиття старе сховище лишається на пристрої як знімок на момент
  // переїзду (`kvvfsHandoff.ts` навмисно його не чистить). Відкрити його
  // вдруге означає показати торішні дані поруч із живою базою іншої вкладки.
  it("після перелиття невдача воркера веде в памʼять, а не в старий стор", async () => {
    vi.mocked(isHandoffDone).mockReturnValue(true);
    vi.mocked(openSqliteInWorker).mockRejectedValue(
      new Error("Missing required OPFS APIs."),
    );

    const handle = await getSqliteDb();

    expect(handle.vfs).toBe("memory");
  });

  // Вкладка, якій не дісталось лідерство, НЕ має відкрити персистентного
  // сховища жодного роду: два стори на один акаунт — це два різні набори
  // даних, а не резервна копія. Ретраї вище тут не допоможуть — сусідня
  // вкладка тримає пул скільки завгодно довго.
  it("послідовник не відкриває персистентного сховища навіть із робочим воркером", async () => {
    Object.defineProperty(globalThis.navigator, "locks", {
      value: {
        request: (
          _name: string,
          options: { ifAvailable?: boolean },
          cb: (lock: object | null) => unknown,
        ) =>
          options.ifAvailable
            ? Promise.resolve(cb(null))
            : new Promise<void>(() => {}),
      },
      configurable: true,
    });
    vi.mocked(isHandoffDone).mockReturnValue(false);
    vi.mocked(openSqliteInWorker).mockResolvedValue(fakeWorkerConnection());

    const handle = await getSqliteDb();

    expect(handle.vfs).toBe("memory");
    expect(openSqliteInWorker).not.toHaveBeenCalled();
    Object.defineProperty(globalThis.navigator, "locks", {
      value: undefined,
      configurable: true,
    });
  });

  it("перечікує зайнятий SAH-пул замість того, щоб осісти на kvvfs", async () => {
    // Прод 2026-09-21 (Chrome 151, Android): воркер попереднього
    // завантаження ще тримав хендли, перша спроба падала за 70 мс після
    // старту — і сесія лишалась на localStorage зі стелею ~5 МБ.
    const busy = new Error(
      "Failed to execute 'createSyncAccessHandle' on 'FileSystemFileHandle': " +
        "Access Handles cannot be created if there is another open Access Handle",
    );
    vi.mocked(openSqliteInWorker)
      .mockRejectedValueOnce(busy)
      .mockResolvedValue(fakeWorkerConnection());

    const handle = await getSqliteDb();

    expect(handle.vfs).toBe("opfs-sahpool");
    expect(openSqliteInWorker).toHaveBeenCalledTimes(2);
  });

  it("після таймауту відкриття пробує воркер ще раз, а не падає в памʼять", async () => {
    // Планшет 2026-09-29: після очищення даних сайту воркер мовчав 30 с,
    // і сесія тихо опинялась у `:memory:` з UI на «Завантаження…».
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    try {
      vi.mocked(openSqliteInWorker)
        .mockRejectedValueOnce(new Error("sqlite-worker: timed out"))
        .mockResolvedValue(fakeWorkerConnection());

      const pending = getSqliteDb();
      await vi.runAllTimersAsync();
      const handle = await pending;

      expect(handle.vfs).toBe("opfs-sahpool");
      expect(openSqliteInWorker).toHaveBeenCalledTimes(2);
      expect(vi.mocked(openSqliteInWorker).mock.calls[1]?.[1]).toMatchObject({
        openTimeoutMs: 15_000,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("повторює після таймауту лише раз", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    try {
      vi.mocked(openSqliteInWorker).mockRejectedValue(
        new Error("sqlite-worker: timed out"),
      );

      const pending = getSqliteDb();
      await vi.runAllTimersAsync();
      const handle = await pending;

      expect(handle.vfs).toBe("memory");
      expect(openSqliteInWorker).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("не ретраїть там, де середовище відмовило чесно", async () => {
    // Пристрій без OPFS не подобрішає від очікування: зайві спроби лише
    // додали б півсекунди до кожного холодного старту.
    vi.mocked(openSqliteInWorker).mockRejectedValue(
      new Error("Missing required OPFS APIs."),
    );

    await getSqliteDb();

    expect(openSqliteInWorker).toHaveBeenCalledTimes(1);
  });
});
