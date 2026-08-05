/**
 * Регресія аудиту шару даних 2026-08-05.
 *
 * `logout()` викликає `wipeSqliteDb()` — повне видалення файлу локальної
 * БД разом із `sync_op_outbox`. Поки запис не доїхав до Postgres, локальна
 * копія єдина, тож будь-який `pending`-рядок на момент виходу зникав
 * назавжди, без попередження. Запобіжник `purgeSyncOpOutboxForUser` для
 * цього існував, але мав НУЛЬ прод-викликів.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const getSyncEngineWriter = vi.fn();
vi.mock("./singleton", () => ({
  getSyncEngineWriter: () => getSyncEngineWriter(),
}));

import { flushPendingSyncOpsBeforeLogout } from "./flushBeforeLogout";

function counts(pending: number) {
  return { pending, rejected: 0, dead_letter: 0, quarantined: 0 };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("flushPendingSyncOpsBeforeLogout", () => {
  it("is a no-op when the sync engine was never started", async () => {
    getSyncEngineWriter.mockReturnValue(null);

    await expect(flushPendingSyncOpsBeforeLogout()).resolves.toEqual({
      pending: 0,
      unknown: false,
    });
  });

  it("skips the network entirely when the queue is already empty", async () => {
    const flushNow = vi.fn();
    getSyncEngineWriter.mockReturnValue({
      getStatus: vi.fn().mockResolvedValue(counts(0)),
      flushNow,
    });

    const result = await flushPendingSyncOpsBeforeLogout();

    expect(result).toEqual({ pending: 0, unknown: false });
    // Переважна більшість виходів — з порожньою чергою; вони не мають
    // платити ні запитом, ні затримкою.
    expect(flushNow).not.toHaveBeenCalled();
  });

  it("flushes and reports zero when everything got delivered", async () => {
    const flushNow = vi.fn().mockResolvedValue({});
    const getStatus = vi
      .fn()
      .mockResolvedValueOnce(counts(3))
      .mockResolvedValueOnce(counts(0));
    getSyncEngineWriter.mockReturnValue({ getStatus, flushNow });

    const result = await flushPendingSyncOpsBeforeLogout();

    expect(flushNow).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ pending: 0, unknown: false });
  });

  it("reports what is STILL undelivered after the flush", async () => {
    // Саме цей сценарій піднімає діалог у ProfilePage: доставити не
    // вдалось, і рішення «втрачати чи ні» переходить до людини.
    const flushNow = vi.fn().mockResolvedValue({});
    const getStatus = vi
      .fn()
      .mockResolvedValueOnce(counts(3))
      .mockResolvedValueOnce(counts(2));
    getSyncEngineWriter.mockReturnValue({ getStatus, flushNow });

    const result = await flushPendingSyncOpsBeforeLogout();

    expect(result).toEqual({ pending: 2, unknown: false });
  });

  it("re-reads status instead of trusting the push result", async () => {
    // `flushNow` звітує про ОДИН батч (ліміт 100). Довіряти йому означало б
    // випустити людину з довшою чергою, вважаючи її порожньою.
    const getStatus = vi
      .fn()
      .mockResolvedValueOnce(counts(150))
      .mockResolvedValueOnce(counts(50));
    getSyncEngineWriter.mockReturnValue({
      getStatus,
      flushNow: vi.fn().mockResolvedValue({ pushed: 100 }),
    });

    const result = await flushPendingSyncOpsBeforeLogout();

    expect(getStatus).toHaveBeenCalledTimes(2);
    expect(result.pending).toBe(50);
  });

  it("fails open when the flush throws — logout must never be blocked", async () => {
    getSyncEngineWriter.mockReturnValue({
      getStatus: vi.fn().mockResolvedValue(counts(2)),
      flushNow: vi.fn().mockRejectedValue(new Error("sqlite gone")),
    });

    const result = await flushPendingSyncOpsBeforeLogout();

    // `unknown: true` → викликач НЕ показує діалог і випускає людину.
    expect(result).toEqual({ pending: 0, unknown: true });
  });

  it("fails open when status hangs past the timeout", async () => {
    getSyncEngineWriter.mockReturnValue({
      getStatus: vi.fn(() => new Promise(() => {})),
      flushNow: vi.fn(),
    });

    const result = await flushPendingSyncOpsBeforeLogout(10);

    expect(result).toEqual({ pending: 0, unknown: true });
  });
});
