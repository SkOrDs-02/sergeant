/**
 * Last validated: 2026-11-21
 * Status: Active
 *
 * data-59/60: перший pull на копії без жодного повного pull повторюється
 * з бекофом 2/5/15 с, а фаза для порожніх станів модулів іде
 * `loading` → `failed`; наповнена копія лишається `idle`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./applyPullOp.js", () => ({
  applyPullOp: vi.fn().mockResolvedValue("applied"),
}));
vi.mock("./refreshCachesAfterPull.js", () => ({
  refreshCachesAfterPull: vi.fn().mockResolvedValue(undefined),
}));

import {
  createSyncEngineReaderRuntime,
  FIRST_PULL_RETRY_DELAYS_MS,
} from "./syncEngineReader.js";
import {
  __resetInitialPullStateForTests,
  getFirstPullPhase,
} from "./initialPullState.js";

/** `seeded`: копія вже пройшла разове відновлення (`replicaBootstrap`). */
function makeClient(seeded: boolean) {
  return {
    all: vi.fn(
      async (_sql: string, params?: readonly unknown[]) =>
        (seeded && String(params?.[0] ?? "").startsWith("replica_bootstrap:")
          ? [{ value_int: 2 }]
          : []) as never[],
    ),
    run: vi.fn(),
    exec: vi.fn(),
  };
}

type ReaderDeps = Parameters<typeof createSyncEngineReaderRuntime>[0];

function makeRuntime(opts: { seeded: boolean; pull: ReaderDeps["pull"] }) {
  const client = makeClient(opts.seeded);
  const timers: { handler: () => void; ms: number }[] = [];
  const clearTimeoutMock = vi.fn();
  const runtime = createSyncEngineReaderRuntime({
    pull: opts.pull,
    resolveClient: async () => client,
    resolveUserId: async () => "u1",
    originDeviceId: "device-a",
    setInterval: vi.fn(() => "interval"),
    clearInterval: vi.fn(),
    setTimeout: (handler, ms) => {
      timers.push({ handler, ms });
      return timers.length;
    },
    clearTimeout: clearTimeoutMock,
    eventTarget: { addEventListener: vi.fn(), removeEventListener: vi.fn() },
    intervalMs: 60_000,
    limit: 100,
  });
  return { runtime, timers, clearTimeoutMock };
}

/** Дочекатися, поки тік (і його `.catch`) повністю відпрацює. */
async function settle(): Promise<void> {
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => __resetInitialPullStateForTests());

describe("перший pull: бекоф і фаза порожнього стану (data-59/60)", () => {
  it("копія без повного pull: loading, повтори 2/5/15 с, потім failed", async () => {
    expect(FIRST_PULL_RETRY_DELAYS_MS).toEqual([2_000, 5_000, 15_000]);
    const pull = vi
      .fn<ReaderDeps["pull"]>()
      .mockRejectedValue(new Error("500"));
    const { runtime, timers } = makeRuntime({ seeded: false, pull });

    runtime.start();
    await settle();
    expect(getFirstPullPhase()).toBe("loading");
    expect(timers.map((t) => t.ms)).toEqual([2_000]);

    timers[0]!.handler();
    await settle();
    expect(timers.map((t) => t.ms)).toEqual([2_000, 5_000]);
    expect(getFirstPullPhase()).toBe("loading");

    timers[1]!.handler();
    await settle();
    expect(timers.map((t) => t.ms)).toEqual([2_000, 5_000, 15_000]);

    timers[2]!.handler();
    await settle();
    // Після останнього повтору — чесна помилка, нових таймерів немає.
    expect(getFirstPullPhase()).toBe("failed");
    expect(timers).toHaveLength(3);
    expect(pull).toHaveBeenCalledTimes(4);
  });

  it("«Ще раз» після failed: тік знову показує loading, а успіх знімає стан", async () => {
    const pull = vi
      .fn<ReaderDeps["pull"]>()
      .mockRejectedValue(new Error("500"));
    const { runtime, timers } = makeRuntime({ seeded: false, pull });
    runtime.start();
    await settle();
    for (let i = 0; i < 3; i += 1) {
      timers[i]!.handler();
      await settle();
    }
    expect(getFirstPullPhase()).toBe("failed");

    pull.mockResolvedValue({ ops: [], next_cursor: null });
    const tick = runtime.pullOnce();
    await settle();
    await tick;
    expect(getFirstPullPhase()).toBe("idle");
  });

  it("успішний перший pull лишає фазу idle і не ставить повторів", async () => {
    const pull = vi
      .fn<ReaderDeps["pull"]>()
      .mockResolvedValue({ ops: [], next_cursor: null });
    const { runtime, timers } = makeRuntime({ seeded: false, pull });
    runtime.start();
    await settle();
    expect(getFirstPullPhase()).toBe("idle");
    expect(timers).toHaveLength(0);
  });

  it("наповнена копія: збій pull не міняє порожній стан і чекає інтервалу", async () => {
    const pull = vi
      .fn<ReaderDeps["pull"]>()
      .mockRejectedValue(new Error("500"));
    const { runtime, timers } = makeRuntime({ seeded: true, pull });
    runtime.start();
    await settle();
    expect(getFirstPullPhase()).toBe("idle");
    expect(timers).toHaveLength(0);
  });

  it("503 на першому pull іде в бюджет повторів: failed за 4 запити, а не за 16", async () => {
    const outage = Object.assign(new Error("503"), { status: 503 });
    const pull = vi.fn<ReaderDeps["pull"]>().mockRejectedValue(outage);
    const { runtime, timers } = makeRuntime({ seeded: false, pull });

    runtime.start();
    await settle();
    // Без паузи рейт-ліміту в тіку: один запит, далі повтор першого pull.
    expect(pull).toHaveBeenCalledTimes(1);
    expect(timers.map((t) => t.ms)).toEqual([2_000]);
    for (let i = 0; i < 3; i += 1) {
      timers[i]!.handler();
      await settle();
    }
    expect(getFirstPullPhase()).toBe("failed");
    expect(pull).toHaveBeenCalledTimes(4);
  });

  it("503 з Retry-After на першому pull: повтор не раніше, ніж просить сервер", async () => {
    const outage = Object.assign(new Error("503"), {
      status: 503,
      retryAfterMs: 30_000,
    });
    const pull = vi.fn<ReaderDeps["pull"]>().mockRejectedValue(outage);
    const { runtime, timers } = makeRuntime({ seeded: false, pull });

    runtime.start();
    await settle();
    expect(pull).toHaveBeenCalledTimes(1);
    expect(timers.map((t) => t.ms)).toEqual([30_000]);
  });

  it("stop() знімає запланований повтор і скидає фазу", async () => {
    const pull = vi
      .fn<ReaderDeps["pull"]>()
      .mockRejectedValue(new Error("500"));
    const { runtime, timers, clearTimeoutMock } = makeRuntime({
      seeded: false,
      pull,
    });
    runtime.start();
    await settle();
    expect(timers).toHaveLength(1);

    runtime.stop();
    expect(clearTimeoutMock).toHaveBeenCalledWith(1);
    expect(getFirstPullPhase()).toBe("idle");
  });
});
