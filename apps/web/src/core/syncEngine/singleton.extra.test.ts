import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SyncEngineWriterRuntime } from "./syncEngineWriter";

vi.mock("../auth/authClient", () => ({
  getSession: vi.fn(async () => ({ data: null, error: null })),
}));

import {
  __resetSyncEngineWriterForTests,
  bootSyncEngineWriter,
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
