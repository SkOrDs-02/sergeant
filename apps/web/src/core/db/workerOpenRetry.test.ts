import { describe, expect, it, vi } from "vitest";
import { SqliteWorkerOpenTimeoutError } from "./sqliteWorkerClient";
import {
  OPEN_TIMEOUT_RETRY_TIMEOUT_MS,
  openWithRetry,
  type WorkerOpenAttemptOptions,
} from "./workerOpenRetry";

function hooks() {
  return {
    isLockContention: () => false,
    onRetry: vi.fn(),
    onGiveUp: vi.fn(),
    sleep: vi.fn(async () => {}),
  };
}

describe("openWithRetry", () => {
  it("перша спроба висне, друга відкриває OPFS - фолбеку немає", async () => {
    const h = hooks();
    const seen: WorkerOpenAttemptOptions[] = [];
    const result = await openWithRetry(async (opts) => {
      seen.push(opts);
      if (seen.length === 1) throw new SqliteWorkerOpenTimeoutError();
      return { vfs: "opfs-sahpool" as const };
    }, h);

    expect(result).toEqual({ vfs: "opfs-sahpool" });
    expect(seen).toEqual([
      {},
      { openTimeoutMs: OPEN_TIMEOUT_RETRY_TIMEOUT_MS },
    ]);
    expect(h.onGiveUp).not.toHaveBeenCalled();
    expect(h.onRetry).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "timeout" }),
    );
  });

  it("другий таймаут поспіль - фолбек, третьої спроби немає", async () => {
    const h = hooks();
    const attempt = vi.fn(async () => {
      throw new SqliteWorkerOpenTimeoutError();
    });
    expect(await openWithRetry(attempt, h)).toBeNull();
    expect(attempt).toHaveBeenCalledTimes(2);
    expect(h.onGiveUp).toHaveBeenCalledTimes(1);
  });

  it("не-таймаут (немає OPFS) - одразу фолбек без повтору", async () => {
    const h = hooks();
    const attempt = vi.fn(async () => {
      throw new Error("Missing required OPFS APIs");
    });
    expect(await openWithRetry(attempt, h)).toBeNull();
    expect(attempt).toHaveBeenCalledTimes(1);
    expect(h.onGiveUp).toHaveBeenCalledTimes(1);
  });

  it("конкуренція за пул повторюється не більше двох разів", async () => {
    const h = { ...hooks(), isLockContention: () => true };
    const attempt = vi.fn(async () => {
      throw new Error("busy");
    });
    expect(await openWithRetry(attempt, h)).toBeNull();
    expect(attempt).toHaveBeenCalledTimes(3);
  });
});
