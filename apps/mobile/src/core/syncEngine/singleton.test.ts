/**
 * Tests for the mobile sync v2 writer-runtime singleton.
 *
 * Mirrors `apps/web/src/core/syncEngine/singleton.test.ts` so the
 * boot semantics (idempotent boot, error-swallowing, captureException
 * forwarding) stay symmetric with web.
 */
import type { SyncEngineWriterRuntime } from "./syncEngineWriter";

import {
  __resetSyncEngineWriterForTests,
  bootSyncEngineWriter,
  getSyncEngineWriter,
} from "./singleton";

function makeRuntime(): SyncEngineWriterRuntime {
  return {
    start: jest.fn(),
    stop: jest.fn(),
    flushNow: jest.fn(),
    notifyEnqueued: jest.fn(),
    getStatus: jest.fn(),
    recoverAllDeadLetters: jest.fn(),
  } as unknown as SyncEngineWriterRuntime;
}

beforeEach(() => {
  __resetSyncEngineWriterForTests();
});

describe("bootSyncEngineWriter (mobile)", () => {
  it("starts once and returns the same runtime on repeated boot", async () => {
    const runtime = makeRuntime();
    const createRuntime = jest.fn().mockResolvedValue(runtime);

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

  it("does not throw when boot dependencies are unavailable", async () => {
    const captureException = jest.fn();
    const createRuntime = jest.fn().mockRejectedValue(new Error("sqlite down"));

    await expect(
      bootSyncEngineWriter({ createRuntime, captureException }),
    ).resolves.toBeNull();

    expect(captureException).toHaveBeenCalledWith(expect.any(Error), {
      scope: "sync-v2-writer-boot",
    });
    expect(getSyncEngineWriter()).toBeNull();
  });

  it("coalesces concurrent boot requests into a single in-flight promise", async () => {
    const runtime = makeRuntime();
    const createRuntime = jest.fn(() => Promise.resolve(runtime));

    const [first, second] = await Promise.all([
      bootSyncEngineWriter({ createRuntime }),
      bootSyncEngineWriter({ createRuntime }),
    ]);

    expect(first).toBe(runtime);
    expect(second).toBe(runtime);
    expect(createRuntime).toHaveBeenCalledTimes(1);
    expect(runtime.start).toHaveBeenCalledTimes(1);
  });

  it("__resetSyncEngineWriterForTests stops the runtime and clears state", async () => {
    const runtime = makeRuntime();
    const createRuntime = jest.fn().mockResolvedValue(runtime);

    await bootSyncEngineWriter({ createRuntime });
    expect(getSyncEngineWriter()).toBe(runtime);

    __resetSyncEngineWriterForTests();
    expect(runtime.stop).toHaveBeenCalledTimes(1);
    expect(getSyncEngineWriter()).toBeNull();
  });
});
