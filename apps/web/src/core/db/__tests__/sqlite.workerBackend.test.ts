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

  it("невдача воркера тихо повертає застосунок на наявний шлях", async () => {
    vi.mocked(openSqliteInWorker).mockRejectedValue(
      new Error("Missing required OPFS APIs."),
    );

    const handle = await getSqliteDb();

    expect(handle.vfs).toBe("kvvfs");
  });
});
