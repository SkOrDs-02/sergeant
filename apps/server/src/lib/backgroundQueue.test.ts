import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

vi.mock("../obs/logger.js", () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

import { logger as _logger } from "../obs/logger.js";
import { BackgroundQueue } from "./backgroundQueue.js";

const logger = _logger as unknown as {
  debug: Mock;
  error: Mock;
  info: Mock;
  warn: Mock;
};

async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

describe("BackgroundQueue", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("clears the timeout timer after a successful job", async () => {
    const queue = new BackgroundQueue({ concurrency: 1, jobTimeoutMs: 1_000 });

    expect(queue.enqueue("fast", async () => undefined)).toBe("job_1");
    await flushMicrotasks();

    expect(queue.getStats().running).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    expect(logger.debug).toHaveBeenCalledWith(
      expect.objectContaining({ msg: "bg_job_completed", jobName: "fast" }),
    );
  });

  it("logs timed-out jobs and releases the worker slot", async () => {
    const queue = new BackgroundQueue({ concurrency: 1, jobTimeoutMs: 50 });

    queue.enqueue("slow", () => new Promise(() => undefined));
    expect(queue.getStats().running).toBe(1);

    await vi.advanceTimersByTimeAsync(50);
    await flushMicrotasks();

    expect(queue.getStats().running).toBe(0);
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        msg: "bg_job_failed",
        jobName: "slow",
        error: "Job slow timed out after 50ms",
      }),
    );
  });
});
