import { describe, expect, it, vi } from "vitest";

import { createSyncEngineReaderRuntime } from "./syncEngineReader.js";

/**
 * `pause()` — бар'єр на час перемикання активної SQLite-партиції (`data-46`,
 * `anonymousLeftoversOnLogout.ts`). Pull, що стартував у вікні перемикання,
 * узяв би `userId` сесії, а клієнта вже іншої партиції.
 */
function makeDeps(
  overrides: Partial<Parameters<typeof createSyncEngineReaderRuntime>[0]> = {},
) {
  return {
    pull: vi.fn().mockResolvedValue({ ops: [], next_cursor: null }),
    resolveClient: vi.fn(async () => ({
      all: vi.fn(async () => []),
      run: vi.fn(),
      exec: vi.fn(),
    })),
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

describe("SyncEngineReaderRuntime.pause", () => {
  it("поки пауза діє, pullOnce не резолвить клієнта і не ходить у мережу", async () => {
    const deps = makeDeps();
    const runtime = createSyncEngineReaderRuntime(deps);

    const resume = await runtime.pause();
    const result = await runtime.pullOnce();

    expect(result.pulled).toBe(0);
    expect(deps.resolveClient).not.toHaveBeenCalled();
    expect(deps.pull).not.toHaveBeenCalled();

    resume();
    await runtime.pullOnce();
    expect(deps.resolveClient).toHaveBeenCalledTimes(1);
    expect(deps.pull).toHaveBeenCalledTimes(1);
  });

  it("дочікується pull-а, що вже йде, перш ніж повернути керування", async () => {
    let finishPull: () => void = () => {};
    const pull = vi.fn(
      () =>
        new Promise<{ ops: never[]; next_cursor: null }>((resolve) => {
          finishPull = () => resolve({ ops: [], next_cursor: null });
        }),
    );
    const runtime = createSyncEngineReaderRuntime(makeDeps({ pull }));

    const running = runtime.pullOnce();
    await vi.waitFor(() => expect(pull).toHaveBeenCalledTimes(1));

    let paused = false;
    const pausing = runtime.pause().then((resume) => {
      paused = true;
      return resume;
    });
    await Promise.resolve();
    expect(paused).toBe(false);

    finishPull();
    await running;
    const resume = await pausing;
    expect(paused).toBe(true);
    resume();
  });

  it("вкладені паузи: pull відновлюється лише після останнього resume, повторний виклик resume нічого не ламає", async () => {
    const deps = makeDeps();
    const runtime = createSyncEngineReaderRuntime(deps);

    const first = await runtime.pause();
    const second = await runtime.pause();
    first();
    first();
    await runtime.pullOnce();
    expect(deps.pull).not.toHaveBeenCalled();

    second();
    await runtime.pullOnce();
    expect(deps.pull).toHaveBeenCalledTimes(1);
  });
});
