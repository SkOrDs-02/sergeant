import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SyncEngineWriterRuntime } from "./syncEngineWriter";
import type { SyncEngineReaderRuntime } from "./syncEngineReader";

vi.mock("../auth/authClient", () => ({
  getSession: vi.fn(async () => ({ data: null, error: null })),
}));

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

function makeReaderRuntime(): SyncEngineReaderRuntime {
  return {
    start: vi.fn(),
    stop: vi.fn(),
    pullOnce: vi.fn(),
  };
}

beforeEach(() => {
  __resetSyncEngineWriterForTests();
});

describe("bootSyncEngineWriter — extra branches", () => {
  it("returns null on boot failure without throwing when captureException is omitted", async () => {
    const createRuntime = vi.fn().mockRejectedValue(new Error("idb missing"));

    await expect(bootSyncEngineWriter({ createRuntime })).resolves.toBeNull();
    expect(getSyncEngineWriter()).toBeNull();
  });

  it("clears in-flight state after failure so a later boot can succeed", async () => {
    const runtime = makeRuntime();
    const createRuntime = vi
      .fn()
      .mockRejectedValueOnce(new Error("first boot failed"))
      .mockResolvedValueOnce(runtime);

    await expect(bootSyncEngineWriter({ createRuntime })).resolves.toBeNull();
    await expect(bootSyncEngineWriter({ createRuntime })).resolves.toBe(
      runtime,
    );

    expect(createRuntime).toHaveBeenCalledTimes(2);
    expect(runtime.start).toHaveBeenCalledTimes(1);
    expect(getSyncEngineWriter()).toBe(runtime);
  });
});

describe("__resetSyncEngineWriterForTests", () => {
  it("calls stop on an active runtime and clears the singleton", async () => {
    const runtime = makeRuntime();
    await bootSyncEngineWriter({
      createRuntime: vi.fn().mockResolvedValue(runtime),
    });

    expect(getSyncEngineWriter()).toBe(runtime);

    __resetSyncEngineWriterForTests();

    expect(runtime.stop).toHaveBeenCalledTimes(1);
    expect(getSyncEngineWriter()).toBeNull();
  });

  it("allows a fresh boot after reset", async () => {
    const first = makeRuntime();
    const second = makeRuntime();
    const createRuntime = vi
      .fn()
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(second);

    await bootSyncEngineWriter({ createRuntime });
    __resetSyncEngineWriterForTests();

    const booted = await bootSyncEngineWriter({ createRuntime });

    expect(booted).toBe(second);
    expect(createRuntime).toHaveBeenCalledTimes(2);
    expect(first.stop).toHaveBeenCalledTimes(1);
    expect(second.start).toHaveBeenCalledTimes(1);
  });
});

describe("bootSyncEngineReader", () => {
  it("starts once and returns the same reader on repeated boot", async () => {
    const reader = makeReaderRuntime();
    const createRuntime = vi.fn().mockResolvedValue(reader);

    await expect(bootSyncEngineReader({ createRuntime })).resolves.toBe(reader);
    await expect(bootSyncEngineReader({ createRuntime })).resolves.toBe(reader);

    expect(createRuntime).toHaveBeenCalledTimes(1);
    expect(reader.start).toHaveBeenCalledTimes(1);
    expect(getSyncEngineReader()).toBe(reader);
  });

  it("shares one in-flight reader boot across concurrent callers", async () => {
    const reader = makeReaderRuntime();
    let resolveCreate: (r: SyncEngineReaderRuntime) => void = () => {};
    const createRuntime = vi.fn(
      () =>
        new Promise<SyncEngineReaderRuntime>((res) => {
          resolveCreate = res;
        }),
    );

    const p1 = bootSyncEngineReader({ createRuntime });
    const p2 = bootSyncEngineReader({ createRuntime });
    resolveCreate(reader);
    const [r1, r2] = await Promise.all([p1, p2]);

    expect(r1).toBe(reader);
    expect(r2).toBe(reader);
    expect(createRuntime).toHaveBeenCalledTimes(1);
  });

  it("returns null on reader boot failure and forwards to captureException", async () => {
    const captureException = vi.fn();
    const createRuntime = vi.fn().mockRejectedValue(new Error("reader down"));

    await expect(
      bootSyncEngineReader({ createRuntime, captureException }),
    ).resolves.toBeNull();

    expect(captureException).toHaveBeenCalledWith(expect.any(Error), {
      scope: "sync-v2-reader-boot",
    });
    expect(getSyncEngineReader()).toBeNull();
  });

  it("returns null on reader boot failure when captureException is omitted", async () => {
    const createRuntime = vi.fn().mockRejectedValue(new Error("idb missing"));

    await expect(bootSyncEngineReader({ createRuntime })).resolves.toBeNull();
    expect(getSyncEngineReader()).toBeNull();
  });
});

describe("__resetSyncEngineWriterForTests — reader branch", () => {
  it("stops an active reader runtime when resetting", async () => {
    const reader = makeReaderRuntime();
    await bootSyncEngineReader({
      createRuntime: vi.fn().mockResolvedValue(reader),
    });

    expect(getSyncEngineReader()).toBe(reader);

    __resetSyncEngineWriterForTests();

    expect(reader.stop).toHaveBeenCalledTimes(1);
    expect(getSyncEngineReader()).toBeNull();
  });
});
