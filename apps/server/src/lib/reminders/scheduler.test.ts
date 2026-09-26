import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";

/**
 * Тестовий plan:
 *   1. `stop()` без проходу в польоті повертається одразу.
 *   2. `stop()` ДОЧІКУЄТЬСЯ проходу, що вже почався.
 *   3. `stop()` має власну стелю — зависла БД не тримає shutdown вічно.
 *   4. Після `stop()` наступний тік не планується.
 *
 * Суть фіксу — пункт 2. Раніше `stop()` був синхронним `clearTimeout`, тож
 * shutdown ішов далі, поки `runReminderSweep` ще працював, і наступним
 * кроком закривав pg-пул під ним. Наслідок бачила лише людина: рядок у
 * `push_reminder_log` уже застовплено (дедуп спрацював), а пуш не пішов —
 * нагадування не приходить ні зараз, ні наступною хвилиною.
 */

const { runReminderSweep, pruneReminderLog, logger } = vi.hoisted(() => ({
  runReminderSweep: vi.fn(),
  pruneReminderLog: vi.fn(async () => 0),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("./sweep.js", () => ({ runReminderSweep, pruneReminderLog }));
vi.mock("../../obs/logger.js", () => ({
  logger,
  serializeError: (e: unknown) => ({
    message: e instanceof Error ? e.message : String(e),
  }),
}));

const { startReminderScheduler } = await import("./scheduler.js");

const pool = {} as Pool;

beforeEach(() => {
  runReminderSweep.mockReset();
  logger.warn.mockReset();
  logger.info.mockReset();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

/** Просунути таймери так, щоб хвилинний тік точно спрацював. */
async function fireTick(): Promise<void> {
  await vi.advanceTimersByTimeAsync(62_000);
}

describe("startReminderScheduler", () => {
  it("resolves stop() immediately when no sweep is in flight", async () => {
    runReminderSweep.mockResolvedValue({ dayKey: "2026-09-16", hm: "08:00" });
    const scheduler = startReminderScheduler(pool);

    // Жодного тіку ще не було — чекати нема на що.
    await expect(scheduler.stop()).resolves.toBeUndefined();
  });

  it("awaits an in-flight sweep before resolving", async () => {
    let releaseSweep: (() => void) | undefined;
    let sweepFinished = false;
    runReminderSweep.mockImplementation(
      () =>
        new Promise((resolve) => {
          releaseSweep = () => {
            sweepFinished = true;
            resolve({ dayKey: "2026-09-16", hm: "08:00" });
          };
        }),
    );

    const scheduler = startReminderScheduler(pool);
    await fireTick();
    expect(runReminderSweep).toHaveBeenCalledTimes(1);

    let stopResolved = false;
    const stopping = scheduler.stop().then(() => {
      stopResolved = true;
    });

    // Прохід ще в польоті — `stop()` не має повертатись.
    await vi.advanceTimersByTimeAsync(0);
    expect(stopResolved).toBe(false);

    releaseSweep?.();
    await vi.advanceTimersByTimeAsync(0);
    await stopping;

    expect(sweepFinished).toBe(true);
    expect(stopResolved).toBe(true);
  });

  it("gives up at its own ceiling when the sweep hangs", async () => {
    // Прохід, що не завершується — зависла БД або мертвий push-апстрім.
    runReminderSweep.mockImplementation(() => new Promise(() => {}));

    const scheduler = startReminderScheduler(pool);
    await fireTick();

    const stopping = scheduler.stop();
    // Стеля — 1 с. Без неї shutdown чекав би на апстрім нескінченно.
    await vi.advanceTimersByTimeAsync(1_100);
    await expect(stopping).resolves.toBeUndefined();

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ msg: "reminder_scheduler_stop_timeout" }),
    );
  });

  it("does not schedule another tick after stop()", async () => {
    runReminderSweep.mockResolvedValue({ dayKey: "2026-09-16", hm: "08:00" });
    const scheduler = startReminderScheduler(pool);

    await fireTick();
    expect(runReminderSweep).toHaveBeenCalledTimes(1);

    await scheduler.stop();
    runReminderSweep.mockClear();

    await vi.advanceTimersByTimeAsync(5 * 62_000);
    expect(runReminderSweep).not.toHaveBeenCalled();
  });
});
