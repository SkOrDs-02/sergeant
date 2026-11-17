import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../auth/authClient", () => ({
  getSession: vi.fn(async () => ({ data: null, error: null })),
}));

import {
  __resetSyncEngineWriterForTests,
  bootSyncEngineReader,
  pauseSyncEngineReader,
} from "./singleton";
import { createSyncEngineReaderRuntime } from "./syncEngineReader";

/**
 * `pauseSyncEngineReader` (`data-46`, рев'ю #1631): бар'єр на час
 * перемикання SQLite-партиції, який діє і на reader, що саме бутиться.
 * Справжній reader runtime: інакше не видно, чи перший тік після `start()`
 * справді нічого не тягне.
 */
function makeRealReader() {
  const pull = vi.fn().mockResolvedValue({ ops: [], next_cursor: null });
  const resolveClient = vi.fn(async () => ({
    all: vi.fn(async () => []),
    run: vi.fn(),
    exec: vi.fn(),
  }));
  const runtime = createSyncEngineReaderRuntime({
    pull,
    resolveClient,
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
  return { runtime, pull, resolveClient };
}

beforeEach(() => {
  __resetSyncEngineWriterForTests();
});

describe("pauseSyncEngineReader", () => {
  it("reader, що бутиться під час паузи, стартує вже на паузі: перший тік нічого не тягне", async () => {
    const { runtime, pull, resolveClient } = makeRealReader();
    let resolveCreate: (r: typeof runtime) => void = () => {};
    const createRuntime = vi.fn(
      () =>
        new Promise<typeof runtime>((res) => {
          resolveCreate = res;
        }),
    );

    const booting = bootSyncEngineReader({ createRuntime });
    const resume = await pauseSyncEngineReader();
    await vi.waitFor(() => expect(createRuntime).toHaveBeenCalled());
    resolveCreate(runtime);
    await booting;
    await runtime.pullOnce();

    expect(resolveClient).not.toHaveBeenCalled();
    expect(pull).not.toHaveBeenCalled();

    resume();
    await runtime.pullOnce();
    expect(pull).toHaveBeenCalledTimes(1);
  });

  it("на вже запущеному reader-і пауза блокує pull до останнього resume", async () => {
    const { runtime, pull } = makeRealReader();
    await bootSyncEngineReader({ createRuntime: async () => runtime });
    await vi.waitFor(() => expect(pull).toHaveBeenCalledTimes(1));

    const first = await pauseSyncEngineReader();
    const second = await pauseSyncEngineReader();
    first();
    await runtime.pullOnce();
    expect(pull).toHaveBeenCalledTimes(1);

    second();
    await runtime.pullOnce();
    expect(pull).toHaveBeenCalledTimes(2);
  });

  it("без reader-а пауза не кидає і нічого не ламає", async () => {
    const resume = await pauseSyncEngineReader();
    resume();
    resume();
  });
});
