import { beforeEach, describe, expect, it, vi } from "vitest";

const applyPullOpMock = vi.fn().mockResolvedValue("applied" as const);
const refreshCachesAfterPullMock = vi.fn().mockResolvedValue(undefined);

vi.mock("./applyPullOp.js", () => ({
  applyPullOp: (...args: unknown[]) => applyPullOpMock(...args),
}));

vi.mock("./refreshCachesAfterPull.js", () => ({
  refreshCachesAfterPull: (...args: unknown[]) =>
    refreshCachesAfterPullMock(...args),
}));

import { hasCompletedPull, resetPullCompletion } from "./pullCompletion.js";
import { createSyncEngineReaderRuntime } from "./syncEngineReader.js";
import { writePullSinceCursor } from "./syncOpCursor.js";

function makeDeps(
  overrides: Partial<Parameters<typeof createSyncEngineReaderRuntime>[0]> = {},
) {
  return {
    pull: vi.fn().mockResolvedValue({ ops: [], next_cursor: null }),
    resolveClient: async () => ({
      all: vi.fn(async () => []),
      run: vi.fn(),
      exec: vi.fn(),
    }),
    resolveUserId: async () => "u1",
    originDeviceId: "device-a",
    setInterval: vi.fn(),
    clearInterval: vi.fn(),
    eventTarget: {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    },
    intervalMs: 60_000,
    limit: 100,
    ...overrides,
  };
}

beforeEach(() => {
  resetPullCompletion();
  applyPullOpMock.mockReset();
  applyPullOpMock.mockResolvedValue("applied");
  refreshCachesAfterPullMock.mockClear();
});

/**
 * `navigator.onLine` у цьому jsdom не є власною властивістю об'єкта, тож
 * `vi.spyOn(navigator, "onLine", "get")` кидає «property is not defined».
 * Підміняємо напряму і повертаємо відновлювач.
 */
function stubOnLine(value: boolean): () => void {
  const original = Object.getOwnPropertyDescriptor(navigator, "onLine");
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    get: () => value,
  });
  return () => {
    if (original) Object.defineProperty(navigator, "onLine", original);
    else delete (navigator as unknown as Record<string, unknown>)["onLine"];
  };
}

describe("createSyncEngineReaderRuntime", () => {
  it("pulls pages, applies ops, and advances the cursor", async () => {
    applyPullOpMock.mockClear();
    const pull = vi.fn().mockResolvedValue({
      ops: [
        {
          id: 5,
          table: "routine_entries",
          op: "insert",
          row: { id: "h1", user_id: "u1", name: "Run" },
          client_ts: "2026-07-10T08:00:00.000Z",
          server_ts: "2026-07-10T08:00:01.000Z",
          origin_device_id: "device-b",
        },
      ],
      next_cursor: null,
    });

    const runCalls: unknown[][] = [];
    const client = {
      all: vi.fn((sql: string) => {
        if (sql.includes("sync_op_cursor")) return [];
        return [];
      }),
      run: vi.fn((_sql: string, params?: readonly unknown[]) => {
        runCalls.push([...(params ?? [])]);
      }),
      exec: vi.fn(),
    };

    const runtime = createSyncEngineReaderRuntime({
      pull,
      resolveClient: async () => client,
      resolveUserId: async () => "u1",
      originDeviceId: "device-a",
      setInterval: vi.fn(),
      clearInterval: vi.fn(),
      eventTarget: {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
      intervalMs: 60_000,
      limit: 100,
    });

    const result = await runtime.pullOnce();
    expect(result.pulled).toBe(1);
    expect(result.applied).toBe(1);
    expect(applyPullOpMock).toHaveBeenCalledTimes(1);
    expect(pull).toHaveBeenCalledWith(0, {
      limit: 100,
      originDeviceId: "device-a",
    });
    await writePullSinceCursor(client as never, "u-1", 5);
    expect(runCalls.length).toBeGreaterThan(0);
  });

  it("returns zero counts when no user is signed in", async () => {
    const runtime = createSyncEngineReaderRuntime(
      makeDeps({ resolveUserId: async () => null }),
    );

    const result = await runtime.pullOnce();
    expect(result).toEqual({
      pulled: 0,
      applied: 0,
      skipped: 0,
      rejected: 0,
      lastOpId: 0,
    });
  });

  it("deduplicates concurrent pullOnce calls via inflight guard", async () => {
    let pullCalls = 0;
    const pull = vi.fn(async () => {
      pullCalls += 1;
      await new Promise((resolve) => setTimeout(resolve, 10));
      return { ops: [], next_cursor: null };
    });
    const runtime = createSyncEngineReaderRuntime(makeDeps({ pull }));

    const [r1, r2] = await Promise.all([
      runtime.pullOnce(),
      runtime.pullOnce(),
    ]);

    expect(r1).toEqual(r2);
    expect(pullCalls).toBe(1);
  });

  // Прод 2026-09-21: догін порожнього курсора на акаунті з 46 тисячами
  // операцій — сотні сторінок проти бюджету 60/хв. Перший 429 валив увесь
  // `pullOnce`, а разом із ним крок `pull-before` анонімної міграції, що
  // замикало людину на блокуючому екрані одразу після входу.
  it("перечікує 429 і доводить пагінацію до кінця", async () => {
    const rateLimited = Object.assign(new Error("Забагато запитів."), {
      name: "ApiError",
      status: 429,
      retryAfterMs: 5,
    });
    const pull = vi
      .fn()
      .mockResolvedValueOnce({
        ops: [{ id: 1, table: "routine_entries", op: "insert", row: {} }],
        next_cursor: 1,
      })
      .mockRejectedValueOnce(rateLimited)
      .mockResolvedValueOnce({
        ops: [{ id: 2, table: "routine_entries", op: "insert", row: {} }],
        next_cursor: null,
      });

    const runtime = createSyncEngineReaderRuntime(makeDeps({ pull }));
    const result = await runtime.pullOnce();

    expect(result.pulled).toBe(2);
    expect(pull).toHaveBeenCalledTimes(3);
  });

  it("здається після стелі пауз, а не крутить рейт-ліміт вічно", async () => {
    const rateLimited = Object.assign(new Error("Забагато запитів."), {
      name: "ApiError",
      status: 429,
      retryAfterMs: 5,
    });
    const pull = vi.fn().mockRejectedValue(rateLimited);

    const runtime = createSyncEngineReaderRuntime(makeDeps({ pull }));

    await expect(runtime.pullOnce()).rejects.toThrow("Забагато запитів.");
    // Перша спроба плюс три перечікування — далі помилка йде нагору, і
    // наступний тік продовжить із збереженого курсора.
    expect(pull).toHaveBeenCalledTimes(4);
  });

  it("counts skipped and rejected outcomes and refreshes caches after applies", async () => {
    applyPullOpMock
      .mockResolvedValueOnce("skipped")
      .mockResolvedValueOnce("rejected")
      .mockResolvedValueOnce("applied");

    const pull = vi.fn().mockResolvedValueOnce({
      ops: [
        { id: 1, table: "routine_entries", op: "insert", row: {} },
        { id: 2, table: "routine_tags", op: "insert", row: {} },
        { id: 3, table: "routine_habits", op: "insert", row: {} },
      ],
      next_cursor: null,
    });

    const client = {
      all: vi.fn(async () => []),
      run: vi.fn(),
      exec: vi.fn(),
    };

    const runtime = createSyncEngineReaderRuntime(
      makeDeps({ pull, resolveClient: async () => client }),
    );

    const result = await runtime.pullOnce();
    expect(result).toEqual({
      pulled: 3,
      applied: 1,
      skipped: 1,
      rejected: 1,
      lastOpId: 3,
    });
    expect(refreshCachesAfterPullMock).toHaveBeenCalledWith(
      client,
      "u1",
      new Set(["routine_habits"]),
    );
  });

  it("follows next_cursor across pages and skips cache refresh when nothing applied", async () => {
    applyPullOpMock.mockResolvedValue("skipped");

    const pull = vi
      .fn()
      .mockResolvedValueOnce({
        ops: [{ id: 4, table: "routine_entries", op: "insert", row: {} }],
        next_cursor: 10,
      })
      .mockResolvedValueOnce({
        ops: [{ id: 11, table: "routine_entries", op: "insert", row: {} }],
        next_cursor: null,
      });

    const runtime = createSyncEngineReaderRuntime(makeDeps({ pull }));
    const result = await runtime.pullOnce();

    expect(pull).toHaveBeenNthCalledWith(1, 0, {
      limit: 100,
      originDeviceId: "device-a",
    });
    expect(pull).toHaveBeenNthCalledWith(2, 10, {
      limit: 100,
      originDeviceId: "device-a",
    });
    expect(result.pulled).toBe(2);
    expect(result.skipped).toBe(2);
    expect(result.lastOpId).toBe(11);
    expect(refreshCachesAfterPullMock).not.toHaveBeenCalled();
  });

  // Гейт відновлення з файлу (data-07): «pull уже був» ставиться лише коли
  // прохід дійшов до кінця, а не на першій сторінці й не на порожньому курсорі.
  describe("мітка завершеного pull (гейт відновлення з файлу)", () => {
    it("ставиться після повного проходу, навіть порожнього", async () => {
      const runtime = createSyncEngineReaderRuntime(makeDeps());
      expect(hasCompletedPull("u1")).toBe(false);
      await runtime.pullOnce();
      expect(hasCompletedPull("u1")).toBe(true);
      expect(hasCompletedPull("u2")).toBe(false);
    });

    it("не ставиться, поки пагінована догонка не дійшла до кінця", async () => {
      let release: (value: unknown) => void = () => {};
      const second = new Promise((resolve) => {
        release = resolve;
      });
      const pull = vi
        .fn()
        .mockResolvedValueOnce({
          ops: [{ id: 4, table: "routine_entries", op: "insert", row: {} }],
          next_cursor: 10,
        })
        .mockImplementationOnce(() => second);
      const runtime = createSyncEngineReaderRuntime(makeDeps({ pull }));
      const run = runtime.pullOnce();
      await vi.waitFor(() => expect(pull).toHaveBeenCalledTimes(2));
      expect(hasCompletedPull("u1")).toBe(false);
      release({ ops: [], next_cursor: null });
      await run;
      expect(hasCompletedPull("u1")).toBe(true);
    });

    it("не ставиться, коли pull упав (офлайн)", async () => {
      const pull = vi.fn().mockRejectedValue(new Error("network down"));
      const runtime = createSyncEngineReaderRuntime(makeDeps({ pull }));
      await expect(runtime.pullOnce()).rejects.toThrow("network down");
      expect(hasCompletedPull("u1")).toBe(false);
    });

    it("не ставиться, коли оновлення кешів після pull упало", async () => {
      refreshCachesAfterPullMock.mockRejectedValueOnce(new Error("boom"));
      const pull = vi.fn().mockResolvedValue({
        ops: [{ id: 1, table: "routine_entries", op: "insert", row: {} }],
        next_cursor: null,
      });
      const runtime = createSyncEngineReaderRuntime(makeDeps({ pull }));
      await expect(runtime.pullOnce()).rejects.toThrow("boom");
      expect(hasCompletedPull("u1")).toBe(false);
    });

    it("без користувача нічого не ставиться", async () => {
      const runtime = createSyncEngineReaderRuntime(
        makeDeps({ resolveUserId: async () => null }),
      );
      await runtime.pullOnce();
      expect(hasCompletedPull("u1")).toBe(false);
    });
  });

  it("routes pull errors through captureException and rethrows", async () => {
    const captureException = vi.fn();
    const pull = vi.fn().mockRejectedValue(new Error("network down"));
    const runtime = createSyncEngineReaderRuntime(
      makeDeps({ pull, captureException }),
    );

    await expect(runtime.pullOnce()).rejects.toThrow("network down");
    // Контекст події збагачено (`tickErrorReport.ts`): без `transport` /
    // `online` / `errorName` у Sentry не відрізнити телефон у метро від
    // стейл-асета після деплою — обидва в Safari звуться `Load failed`.
    expect(captureException).toHaveBeenCalledWith(expect.any(Error), {
      scope: "sync-v2-pull-tick",
      transport: false,
      online: expect.anything(),
      errorName: "Error",
    });
  });

  // Регресія SERGEANT-API-C / SERGEANT-WEB-G: офлайн-first застосунок не
  // має репортити зірваний мережею тік як помилку. Кидати — і далі кидає:
  // глушиться лише звіт у Sentry, потік керування не змінюється.
  it("не репортить транспортний збій, коли браузер офлайн", async () => {
    const captureException = vi.fn();
    const pull = vi.fn().mockRejectedValue(new TypeError("Load failed"));
    const restoreOnLine = stubOnLine(false);

    const runtime = createSyncEngineReaderRuntime(
      makeDeps({ pull, captureException }),
    );

    await expect(runtime.pullOnce()).rejects.toThrow("Load failed");
    expect(captureException).not.toHaveBeenCalled();

    restoreOnLine();
  });

  it("репортить той самий збій, поки браузер вважає, що мережа є", async () => {
    const captureException = vi.fn();
    const pull = vi.fn().mockRejectedValue(new TypeError("Load failed"));
    const restoreOnLine = stubOnLine(true);

    const runtime = createSyncEngineReaderRuntime(
      makeDeps({ pull, captureException }),
    );

    await expect(runtime.pullOnce()).rejects.toThrow("Load failed");
    expect(captureException).toHaveBeenCalledWith(expect.any(TypeError), {
      scope: "sync-v2-pull-tick",
      transport: true,
      online: true,
      errorName: "TypeError",
    });

    restoreOnLine();
  });

  // Фікс 3: `rejected` на pull-шляху не читає ЖОДЕН споживач `pullOnce`,
  // а курсор їде далі — тобто оп, який не застосувався, більше не
  // повернеться. Саме так мовчки не доїжджали `fizruk_custom_activities` і
  // `fizruk_injuries` (коментарі в `applyPullOp.ts`). Обрано гучний звіт, а
  // не притримування курсора — обґрунтування в `reportPullRejection`.
  it("репортить КОЖНЕ термінальне відхилення опа з table/op", async () => {
    const captureException = vi.fn();
    applyPullOpMock.mockResolvedValue("rejected");
    const pull = vi.fn().mockResolvedValue({
      ops: [
        {
          id: 7,
          table: "fizruk_injuries",
          op: "insert",
          row: { id: "x", user_id: "u1" },
          client_ts: "2026-07-10T08:00:00.000Z",
          server_ts: "2026-07-10T08:00:00.000Z",
          origin_device_id: "device-b",
        },
        {
          id: 8,
          table: "fizruk_custom_activities",
          op: "update",
          row: { id: "y", user_id: "u1" },
          client_ts: "2026-07-10T08:00:01.000Z",
          server_ts: "2026-07-10T08:00:01.000Z",
          origin_device_id: "device-b",
        },
      ],
      next_cursor: null,
    });

    const runtime = createSyncEngineReaderRuntime(
      makeDeps({ pull, captureException }),
    );
    const result = await runtime.pullOnce();

    expect(result.rejected).toBe(2);
    expect(captureException).toHaveBeenCalledTimes(2);
    // Предмет — у ЗАГОЛОВКУ помилки: Sentry групує за текстом, тож інакше
    // різні сутності злиплися б в одну issue без предмета.
    expect(captureException).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        message: "sync pull op rejected: fizruk_injuries.insert",
      }),
      expect.objectContaining({
        scope: "sync-v2-pull-apply",
        opId: 7,
        tags: {
          area: "sync",
          sync_direction: "pull",
          sync_table: "fizruk_injuries",
          sync_op: "insert",
        },
      }),
    );
    expect(captureException).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        message: "sync pull op rejected: fizruk_custom_activities.update",
      }),
      expect.objectContaining({ opId: 8 }),
    );
  });

  it("не репортить нічого на applied / skipped", async () => {
    const captureException = vi.fn();
    applyPullOpMock.mockResolvedValueOnce("applied");
    applyPullOpMock.mockResolvedValueOnce("skipped");
    const pull = vi.fn().mockResolvedValue({
      ops: [
        {
          id: 1,
          table: "routine_habits",
          op: "insert",
          row: { id: "a", user_id: "u1" },
          client_ts: "2026-07-10T08:00:00.000Z",
          server_ts: "2026-07-10T08:00:00.000Z",
          origin_device_id: "device-b",
        },
        {
          id: 2,
          table: "routine_habits",
          op: "update",
          row: { id: "a", user_id: "u1" },
          client_ts: "2026-07-10T08:00:01.000Z",
          server_ts: "2026-07-10T08:00:01.000Z",
          origin_device_id: "device-b",
        },
      ],
      next_cursor: null,
    });

    const runtime = createSyncEngineReaderRuntime(
      makeDeps({ pull, captureException }),
    );
    const result = await runtime.pullOnce();

    expect(result).toMatchObject({ applied: 1, skipped: 1, rejected: 0 });
    expect(captureException).not.toHaveBeenCalled();
  });

  it("курсор і далі просувається поверх rejected — інакше черга стане назавжди", async () => {
    // Свідомий компроміс варіанта (б): `rejected` найчастіше означає
    // таблицю, якої немає в ЦЬОМУ білді клієнта. Притримати курсор на ній =
    // зупинити синк пристрою цілком, а не врятувати один оп.
    const captureException = vi.fn();
    applyPullOpMock.mockResolvedValue("rejected");
    const pull = vi.fn().mockResolvedValue({
      ops: [
        {
          id: 99,
          table: "table_from_the_future",
          op: "insert",
          row: { id: "z", user_id: "u1" },
          client_ts: "2026-07-10T08:00:00.000Z",
          server_ts: "2026-07-10T08:00:00.000Z",
          origin_device_id: "device-b",
        },
      ],
      next_cursor: null,
    });

    const runtime = createSyncEngineReaderRuntime(
      makeDeps({ pull, captureException }),
    );
    const result = await runtime.pullOnce();

    expect(result.lastOpId).toBe(99);
    expect(captureException).toHaveBeenCalledTimes(1);
  });

  it("відсутній captureException не ламає тік", async () => {
    applyPullOpMock.mockResolvedValue("rejected");
    const pull = vi.fn().mockResolvedValue({
      ops: [
        {
          id: 5,
          table: "unknown_table",
          op: "insert",
          row: { id: "q", user_id: "u1" },
          client_ts: "2026-07-10T08:00:00.000Z",
          server_ts: "2026-07-10T08:00:00.000Z",
          origin_device_id: "device-b",
        },
      ],
      next_cursor: null,
    });

    const runtime = createSyncEngineReaderRuntime(makeDeps({ pull }));
    await expect(runtime.pullOnce()).resolves.toMatchObject({ rejected: 1 });
  });

  it("start/stop wires interval, visibility listener, and is idempotent", async () => {
    const intervalHandle = { id: 1 };
    const setInterval = vi.fn(() => intervalHandle);
    const clearInterval = vi.fn();
    const listeners = new Map<string, () => void>();
    const eventTarget = {
      addEventListener: vi.fn((type: string, listener: () => void) => {
        listeners.set(type, listener);
      }),
      removeEventListener: vi.fn((type: string) => {
        listeners.delete(type);
      }),
    };

    const pull = vi.fn().mockResolvedValue({ ops: [], next_cursor: null });
    const runtime = createSyncEngineReaderRuntime(
      makeDeps({ pull, setInterval, clearInterval, eventTarget }),
    );

    runtime.start();
    runtime.start();
    expect(setInterval).toHaveBeenCalledTimes(1);
    expect(eventTarget.addEventListener).toHaveBeenCalledWith(
      "visibilitychange",
      expect.any(Function),
    );
    await vi.waitFor(() => {
      expect(pull).toHaveBeenCalled();
    });

    const onVisibility = listeners.get("visibilitychange");
    expect(onVisibility).toBeTypeOf("function");

    runtime.stop();
    runtime.stop();
    expect(clearInterval).toHaveBeenCalledWith(intervalHandle);
    expect(eventTarget.removeEventListener).toHaveBeenCalledWith(
      "visibilitychange",
      onVisibility,
    );
  });
});
