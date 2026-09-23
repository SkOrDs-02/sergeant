import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SyncEngineWriterRuntime } from "./syncEngineWriter";

// `singleton.ts` статично імпортує `authClient`, який на module-load створює
// Better Auth клієнт і читає `window.location` — у node-environment тестів
// `window` відсутній. Тести інжектять власний `createRuntime`, тож реальний
// authClient тут не потрібен.
vi.mock("../auth/authClient", () => ({
  getSession: vi.fn(async () => ({ data: null, error: null })),
}));

// Власність локальної бази - зовнішній стан для цього модуля: у node-env
// `navigator.locks` немає, тож без мока кожна вкладка вважалась би лідером
// і гілку послідовника ніхто б не перевірив.
const ownership = vi.hoisted(() => ({
  value: "leader" as "leader" | "follower",
  listeners: new Set<() => void>(),
}));
vi.mock("../db/dbOwnership", () => ({
  claimDbOwnership: () => Promise.resolve(ownership.value),
  readDbOwnership: () => ownership.value,
  subscribeDbOwnership: (fn: () => void) => {
    ownership.listeners.add(fn);
    return () => ownership.listeners.delete(fn);
  },
}));

function becomeFollower(): void {
  ownership.value = "follower";
  for (const fn of [...ownership.listeners]) fn();
}

import {
  __resetSyncEngineWriterForTests,
  bootSyncEngineReader,
  bootSyncEngineWriter,
  getSyncEngineReader,
  getSyncEngineWriter,
} from "./singleton";

function makeRuntime(): SyncEngineWriterRuntime {
  return {
    start: vi.fn(),
    stop: vi.fn(),
    flushNow: vi.fn(),
    notifyEnqueued: vi.fn(),
    getStatus: vi.fn(),
    recoverAllDeadLetters: vi.fn(),
  } as unknown as SyncEngineWriterRuntime;
}

beforeEach(() => {
  __resetSyncEngineWriterForTests();
  ownership.value = "leader";
  ownership.listeners.clear();
});

describe("bootSyncEngineWriter", () => {
  it("starts once and returns the same runtime on repeated boot", async () => {
    const runtime = makeRuntime();
    const createRuntime = vi.fn().mockResolvedValue(runtime);

    await expect(bootSyncEngineWriter({ createRuntime })).resolves.toBe(
      runtime,
    );
    await expect(bootSyncEngineWriter({ createRuntime })).resolves.toBe(
      runtime,
    );

    expect(createRuntime).toHaveBeenCalledTimes(1);
    expect(runtime.start).toHaveBeenCalledTimes(1);
    expect(getSyncEngineWriter()).toBe(runtime);
  });

  it("shares one in-flight boot across concurrent callers", async () => {
    const runtime = makeRuntime();
    let resolveCreate: (r: SyncEngineWriterRuntime) => void = () => {};
    const createRuntime = vi.fn(
      () =>
        new Promise<SyncEngineWriterRuntime>((res) => {
          resolveCreate = res;
        }),
    );

    const p1 = bootSyncEngineWriter({ createRuntime });
    const p2 = bootSyncEngineWriter({ createRuntime });
    // Фабрика тепер викликається ПІСЛЯ того, як розвʼязалось лідерство, тож
    // розвʼязувати її проміс одразу немає чого - його ще не створили.
    await vi.waitFor(() => expect(createRuntime).toHaveBeenCalled());
    resolveCreate(runtime);
    const [r1, r2] = await Promise.all([p1, p2]);

    expect(r1).toBe(runtime);
    expect(r2).toBe(runtime);
    expect(createRuntime).toHaveBeenCalledTimes(1);
  });

  // Прод 2026-09-22 (SERGEANT-WEB-1A): вкладка-послідовник тягнула операції
  // в памʼятєву базу й відхиляла їх усі - 12 подій за 4 секунди.
  it("не піднімає рантайм у вкладці-послідовнику", async () => {
    ownership.value = "follower";
    const createRuntime = vi.fn().mockResolvedValue(makeRuntime());

    await expect(bootSyncEngineWriter({ createRuntime })).resolves.toBeNull();

    expect(createRuntime).not.toHaveBeenCalled();
    expect(getSyncEngineWriter()).toBeNull();
  });

  it("зупиняє рантайм, коли базу забрала інша вкладка", async () => {
    const runtime = makeRuntime();
    const createRuntime = vi.fn().mockResolvedValue(runtime);
    await bootSyncEngineWriter({ createRuntime });
    expect(runtime.start).toHaveBeenCalledTimes(1);

    becomeFollower();

    expect(runtime.stop).toHaveBeenCalledTimes(1);
    expect(getSyncEngineWriter()).toBeNull();
  });

  // Догін курсора робить саме reader: 51 запит /api/v2/sync/pull за 80 с із
  // вкладки-послідовника, заміряно на планшеті 2026-09-23.
  it("не піднімає reader у вкладці-послідовнику", async () => {
    ownership.value = "follower";
    const createRuntime = vi
      .fn()
      .mockResolvedValue({ start: vi.fn(), stop: vi.fn(), pullOnce: vi.fn() });

    await expect(bootSyncEngineReader({ createRuntime })).resolves.toBeNull();

    expect(createRuntime).not.toHaveBeenCalled();
    expect(getSyncEngineReader()).toBeNull();
  });

  it("зупиняє reader, коли базу забрала інша вкладка", async () => {
    const reader = { start: vi.fn(), stop: vi.fn(), pullOnce: vi.fn() };
    await bootSyncEngineReader({
      createRuntime: vi.fn().mockResolvedValue(reader),
    });
    expect(reader.start).toHaveBeenCalledTimes(1);

    becomeFollower();

    expect(reader.stop).toHaveBeenCalledTimes(1);
    expect(getSyncEngineReader()).toBeNull();
  });

  it("does not throw when boot dependencies are unavailable", async () => {
    const captureException = vi.fn();
    const createRuntime = vi.fn().mockRejectedValue(new Error("sqlite down"));

    await expect(
      bootSyncEngineWriter({ createRuntime, captureException }),
    ).resolves.toBeNull();

    expect(captureException).toHaveBeenCalledWith(expect.any(Error), {
      scope: "sync-v2-writer-boot",
    });
    expect(getSyncEngineWriter()).toBeNull();
  });
});
