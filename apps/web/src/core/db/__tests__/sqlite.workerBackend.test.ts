// @vitest-environment jsdom
/**
 * @status Active
 *
 * Спека `docs/work/specs/sqlite-opfs-worker.md`: база у воркері.
 *
 * Від 2026-11-18 (PR-T1, рішення власника Б) головнопотокового шляху немає
 * зовсім: будь-яка невдача OPFS у воркері веде в базу `:memory:` теж у
 * воркері, а sqlite-wasm на головному потоці не вантажиться за жодних умов.
 * Тести стережуть саме це, плюс те, що старе kvvfs-сховище на такому шляху
 * не відкривається і не позначається перелитим.
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
  openSqliteMemoryInWorker: vi.fn(),
}));
vi.mock("../kvvfsHandoff.js", () => ({
  isHandoffDone: vi.fn(() => true),
  hasKvvfsData: vi.fn(() => false),
  markHandoffDone: vi.fn(),
  readKvvfsSnapshot: vi.fn(() => null),
  pruneForeignPartitionRows: vi.fn(async () => 0),
}));

import {
  openSqliteInWorker,
  openSqliteMemoryInWorker,
} from "../sqliteWorkerClient.js";
import {
  hasKvvfsData,
  isHandoffDone,
  markHandoffDone,
  pruneForeignPartitionRows,
  readKvvfsSnapshot,
} from "../kvvfsHandoff.js";
import {
  __resetActiveSqliteVfsForTests,
  readActiveSqliteVfs,
  readSqliteLegacyStoreKept,
  readSqliteVfsFallbackReason,
} from "../storageBackendState";
import { setSentryTag } from "../../observability/sentry.js";

function fakeWorkerConnection(dbName = "sergeant-anon.db") {
  return {
    dbName,
    grewBy: 0,
    imported: false,
    exec: vi.fn(async () => {}),
    run: vi.fn(async () => {}),
    all: vi.fn(async () => [] as unknown[]),
    diagnostics: vi.fn(async () => ({ capacity: 24, fileCount: 2 })),
    close: vi.fn(async () => {}),
    wipe: vi.fn(async () => {}),
    prune: vi.fn(async () => ({ removed: [], kept: [] })),
  };
}

beforeEach(() => {
  __resetSqliteDbForTests();
  __resetDbOwnershipForTests();
  __resetActiveSqliteVfsForTests();
  vi.mocked(openSqliteInWorker).mockReset();
  vi.mocked(openSqliteMemoryInWorker).mockReset();
  vi.mocked(openSqliteMemoryInWorker).mockImplementation(async () =>
    fakeWorkerConnection(":memory:"),
  );
  vi.mocked(isHandoffDone).mockReturnValue(true);
  vi.mocked(hasKvvfsData).mockReturnValue(false);
  vi.mocked(markHandoffDone).mockClear();
  vi.mocked(pruneForeignPartitionRows).mockClear();
  vi.mocked(readKvvfsSnapshot).mockClear();
  vi.mocked(readKvvfsSnapshot).mockReturnValue(null);
  vi.mocked(setSentryTag).mockClear();
  sqlite3InitModuleMock.mockClear();
});

afterEach(() => {
  __resetSqliteDbForTests();
  // PR-T1: що б не сталось у тесті, sqlite-wasm на головний потік не
  // потрапляє. Раніше тут жили OPFS-SAH і kvvfs власною копією модуля.
  expect(sqlite3InitModuleMock).not.toHaveBeenCalled();
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
    const snapshot = { size: 4096, journal: null, pages: ["page-1"] };
    vi.mocked(readKvvfsSnapshot).mockReturnValue(snapshot);
    const conn = fakeWorkerConnection();
    vi.mocked(openSqliteInWorker).mockResolvedValue({
      ...conn,
      imported: true,
    });

    await getSqliteDb();

    expect(vi.mocked(openSqliteInWorker).mock.calls[0]?.[1]).toMatchObject({
      importKvvfs: snapshot,
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

    // Головне тут — що мегабайти рядків `localStorage` не читаються щоразу
    // заради сховища, яке вже перелито.
    expect(readKvvfsSnapshot).not.toHaveBeenCalled();
    expect(pruneForeignPartitionRows).not.toHaveBeenCalled();
  });

  // PR-T1 (рішення власника Б): пристрій без OPFS у воркері більше не
  // відкриває kvvfs. Старе сховище не перелите — і НЕ позначається
  // перелитим, тож після оновлення браузера перелиття відбудеться.
  it("без OPFS у воркері: памʼять у воркері, kvvfs не відкривається і не позначається", async () => {
    vi.mocked(isHandoffDone).mockReturnValue(false);
    vi.mocked(hasKvvfsData).mockReturnValue(true);
    vi.mocked(openSqliteInWorker).mockRejectedValue(
      new Error("Missing required OPFS APIs."),
    );

    const handle = await getSqliteDb();

    expect(handle.vfs).toBe("memory");
    expect(openSqliteMemoryInWorker).toHaveBeenCalledTimes(1);
    expect(markHandoffDone).not.toHaveBeenCalled();
    expect(readActiveSqliteVfs()).toBe("memory");
    expect(readSqliteVfsFallbackReason()).toBe("unsupported");
    expect(readSqliteLegacyStoreKept()).toBe(true);
    expect(setSentryTag).toHaveBeenCalledWith("sqlite.kvvfs_stranded", "true");
  });

  it("без OPFS і без старого сховища банеру нема чого обіцяти про старі записи", async () => {
    vi.mocked(isHandoffDone).mockReturnValue(false);
    vi.mocked(hasKvvfsData).mockReturnValue(false);
    vi.mocked(openSqliteInWorker).mockRejectedValue(
      new Error("Missing required OPFS APIs."),
    );

    await getSqliteDb();

    expect(readSqliteVfsFallbackReason()).toBe("unsupported");
    expect(readSqliteLegacyStoreKept()).toBe(false);
  });

  it("таймаут — не «браузер не підтримує»: банер лишає пораду перезавантажити", async () => {
    const hung = new Error("sqlite-worker: timed out");
    hung.name = "SqliteWorkerOpenTimeoutError";
    vi.mocked(openSqliteInWorker).mockRejectedValue(hung);

    const handle = await getSqliteDb();

    expect(handle.vfs).toBe("memory");
    expect(readSqliteVfsFallbackReason()).toBeNull();
  });

  // Зіпсований знімок kvvfs кидає у воркері (quick_check), і відкриття
  // OPFS падає цілком. Позначки немає — наступний запуск спробує знову;
  // порожнього файлу, який назавжди відрізав би старі дані, теж немає.
  it("збій перелиття не ставить позначку і не лишає людину без бази", async () => {
    vi.mocked(isHandoffDone).mockReturnValue(false);
    vi.mocked(readKvvfsSnapshot).mockReturnValue({
      size: 4096,
      journal: null,
      pages: ["broken"],
    });
    vi.mocked(openSqliteInWorker).mockRejectedValue(
      new Error("kvvfs-handoff: quick_check failed: corrupt"),
    );

    const handle = await getSqliteDb();

    expect(handle.vfs).toBe("memory");
    expect(markHandoffDone).not.toHaveBeenCalled();
  });

  it("якщо не піднявся навіть воркер — getSqliteDb відхиляється, а стан чесно «памʼять»", async () => {
    vi.mocked(openSqliteInWorker).mockRejectedValue(
      new Error("sqlite-worker: Worker is unavailable"),
    );
    vi.mocked(openSqliteMemoryInWorker).mockRejectedValue(
      new Error("sqlite-worker: Worker is unavailable"),
    );

    await expect(getSqliteDb()).rejects.toThrow(/Worker is unavailable/);
    expect(readActiveSqliteVfs()).toBe("memory");
    expect(readSqliteVfsFallbackReason()).toBe("unsupported");
    expect(setSentryTag).toHaveBeenCalledWith("sqlite.vfs", "none");
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
    expect(openSqliteMemoryInWorker).toHaveBeenCalledTimes(1);
    Object.defineProperty(globalThis.navigator, "locks", {
      value: undefined,
      configurable: true,
    });
  });

  it("перечікує зайнятий SAH-пул замість того, щоб осісти в памʼяті", async () => {
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

  it("не ретраїть там, де середовище відмовило чесно", async () => {
    // Пристрій без OPFS не подобрішає від очікування: зайві спроби лише
    // додали б півсекунди до кожного холодного старту.
    vi.mocked(openSqliteInWorker).mockRejectedValue(
      new Error("Missing required OPFS APIs."),
    );

    await getSqliteDb();

    expect(openSqliteInWorker).toHaveBeenCalledTimes(1);
  });

  it("перша спроба висне, друга відкриває OPFS: не memory (аудит 2026-09-29)", async () => {
    const hung = new Error("sqlite-worker: timed out");
    hung.name = "SqliteWorkerOpenTimeoutError";
    vi.mocked(openSqliteInWorker)
      .mockRejectedValueOnce(hung)
      .mockResolvedValue(fakeWorkerConnection());

    const handle = await getSqliteDb();

    expect(handle.vfs).toBe("opfs-sahpool");
    expect(openSqliteInWorker).toHaveBeenCalledTimes(2);
    // Повтор іде з коротшим таймаутом, щоб холодний старт лишався скінченним.
    expect(vi.mocked(openSqliteInWorker).mock.calls[0]?.[1]).not.toHaveProperty(
      "openTimeoutMs",
    );
    expect(vi.mocked(openSqliteInWorker).mock.calls[1]?.[1]).toMatchObject({
      openTimeoutMs: 10_000,
    });
  });

  it("два таймаути поспіль: одна повторна спроба і фолбек, не безмежно", async () => {
    const hung = new Error("sqlite-worker: timed out");
    hung.name = "SqliteWorkerOpenTimeoutError";
    vi.mocked(openSqliteInWorker).mockRejectedValue(hung);

    const handle = await getSqliteDb();

    expect(handle.vfs).not.toBe("opfs-sahpool");
    expect(openSqliteInWorker).toHaveBeenCalledTimes(2);
  });
});
