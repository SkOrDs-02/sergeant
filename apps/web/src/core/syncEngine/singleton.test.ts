import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SyncEngineWriterRuntime } from "./syncEngineWriter";

// `singleton.ts` статично імпортує `authClient`, який на module-load створює
// Better Auth клієнт і читає `window.location` — у node-environment тестів
// `window` відсутній. Тести інжектять власний `createRuntime`, тож реальний
// authClient тут не потрібен.
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
