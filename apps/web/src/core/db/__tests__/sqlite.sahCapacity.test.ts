// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { __resetSqliteDbForTests, getSqliteDb } from "../sqlite";
import {
  addCapacityMock,
  installOpfsSAHPoolVfsMock,
  sahPoolState,
} from "./sqlite-wasm-fake";

/**
 * Ємність OPFS-SAH пулу.
 *
 * Звіт власника 2026-09-14: перенос анонімних даних падав з
 * `anon-migration/pull-before: SQLITE_IOERR: disk I/O error` — на 5G, з
 * повним сигналом, тобто мережа була ні до чого. Причина в самому VFS:
 * `installOpfsSAHPoolVfs` не отримував `initialCapacity`, тож діяв дефолт
 * бібліотеки — 6. Її ж документація описує цей дефолт як «large enough for
 * one or two databases and their associated temp files», а Sergeant тримає
 * дві бази одночасно (`sergeant-anon.db` + `sergeant-<userId>.db`) і на час
 * переносу відкриває обидві, ще й з великою транзакцією, яка створює
 * rollback-журнал. Кожен такий файл ЗАЙМАЄ слот пулу.
 *
 * Пул не росте сам — `xOpen` віддає `toss("SAH pool is full. Cannot create
 * file")`, і sqlite перетворює це на `SQLITE_IOERR` без натяку на причину.
 * Тому ємність задається явно, а запас вільних слотів доростає на місці.
 */
vi.mock("@sqlite.org/sqlite-wasm", () => import("./sqlite-wasm-fake"));
vi.mock("../../observability/sentry.js", () => ({
  addSentryBreadcrumb: vi.fn(),
  setSentryTag: vi.fn(),
}));

describe("OPFS-SAH pool capacity", () => {
  beforeEach(() => {
    __resetSqliteDbForTests();
    installOpfsSAHPoolVfsMock.mockClear();
    addCapacityMock.mockClear();
    sahPoolState.capacity = 0;
    sahPoolState.fileCount = 0;
    Object.defineProperty(globalThis.navigator, "storage", {
      value: { getDirectory: () => Promise.resolve({}) },
      configurable: true,
    });
    // `hasOpfsSupport()` вимагає ОБИДВОХ ознак — кореня OPFS і
    // sync-access-handle. Без другої гілка SAH-пулу не виконується взагалі,
    // і тест мовчки міряв би kvvfs-фолбек.
    Object.defineProperty(globalThis, "FileSystemFileHandle", {
      value: function FileSystemFileHandle() {},
      configurable: true,
    });
  });

  afterEach(() => {
    __resetSqliteDbForTests();
  });

  it("не покладається на дефолт бібліотеки (6 слотів)", async () => {
    await getSqliteDb();

    const options = installOpfsSAHPoolVfsMock.mock.calls[0]?.[0] as
      { initialCapacity?: number } | undefined;
    expect(options?.initialCapacity).toBeGreaterThan(6);
  });

  it("доростає запас, коли пул уже майже повний", async () => {
    // Пул, створений попередньою версією застосунку: `initialCapacity`
    // діє лише на ПЕРШІЙ ініціалізації в цьому origin, тож у людини, яка
    // вже користувалась продуктом, ємність лишається старою назавжди.
    installOpfsSAHPoolVfsMock.mockImplementationOnce(async () => {
      sahPoolState.capacity = 6;
      sahPoolState.fileCount = 5;
      return {
        OpfsSAHPoolDb: class {
          constructor(_filename: string) {}
          exec() {}
          close() {}
        },
        unlink: vi.fn(),
        addCapacity: addCapacityMock,
        exportFile: vi.fn(),
        getCapacity: () => sahPoolState.capacity,
        getFileCount: () => sahPoolState.fileCount,
        getFileNames: vi.fn(),
        importDb: vi.fn(),
      } as never;
    });

    await getSqliteDb();

    expect(addCapacityMock).toHaveBeenCalledTimes(1);
    // Вільного слоту було рівно 1, тож доростити треба решту до порога.
    expect(sahPoolState.capacity).toBeGreaterThanOrEqual(6 + 7);
  });

  it("не доростає, коли запасу вже достатньо", async () => {
    await getSqliteDb();

    // Свіжий пул створюється з явною ємністю і порожній, тож запас є.
    expect(addCapacityMock).not.toHaveBeenCalled();
  });

  it("збій доростання не валить відкриття бази", async () => {
    installOpfsSAHPoolVfsMock.mockImplementationOnce(async () => {
      sahPoolState.capacity = 6;
      sahPoolState.fileCount = 6;
      return {
        OpfsSAHPoolDb: class {
          constructor(_filename: string) {}
          exec() {}
          close() {}
        },
        unlink: vi.fn(),
        addCapacity: vi.fn(async () => {
          throw new Error("quota exceeded");
        }),
        exportFile: vi.fn(),
        getCapacity: () => sahPoolState.capacity,
        getFileCount: () => sahPoolState.fileCount,
        getFileNames: vi.fn(),
        importDb: vi.fn(),
      } as never;
    });

    // База могла відкритись і на наявних слотах — оптимізація запасу не
    // має ставати новим шляхом відмови.
    const handle = await getSqliteDb();
    expect(handle.vfs).toBe("opfs-sahpool");
  });
});
