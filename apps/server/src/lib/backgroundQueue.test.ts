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

  it("queues beyond concurrency and continues processing after a slot frees", async () => {
    const queue = new BackgroundQueue({ concurrency: 1, jobTimeoutMs: 1_000 });
    const executed: string[] = [];
    let releaseFirst!: () => void;

    expect(
      queue.enqueue(
        "first",
        () =>
          new Promise<void>((resolve) => {
            releaseFirst = resolve;
          }),
      ),
    ).toBe("job_1");
    expect(
      queue.enqueue("second", async () => {
        executed.push("second");
      }),
    ).toBe("job_2");

    expect(queue.getStats()).toMatchObject({ queued: 1, running: 1 });

    releaseFirst();
    await flushMicrotasks();

    expect(executed).toEqual(["second"]);
    expect(queue.getStats()).toMatchObject({ queued: 0, running: 0 });
  });

  it("drops new jobs when the queue is full", () => {
    const queue = new BackgroundQueue({
      concurrency: 0,
      maxQueueSize: 1,
      jobTimeoutMs: 1_000,
    });

    expect(queue.enqueue("queued", async () => undefined)).toBe("job_1");
    expect(queue.enqueue("overflow", async () => undefined)).toBeNull();

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        msg: "bg_queue_full",
        jobName: "overflow",
        queueSize: 1,
        maxSize: 1,
      }),
    );
  });

  it("logs thrown jobs and keeps the worker available", async () => {
    const queue = new BackgroundQueue({ concurrency: 1, jobTimeoutMs: 1_000 });

    queue.enqueue("boom", async () => {
      throw new Error("broken job");
    });
    await flushMicrotasks();

    expect(queue.getStats().running).toBe(0);
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        msg: "bg_job_failed",
        jobName: "boom",
        error: "broken job",
      }),
    );
  });

  it("rejects enqueue after shutdown and logs dropped pending jobs", async () => {
    const queue = new BackgroundQueue({
      concurrency: 0,
      maxQueueSize: 3,
      jobTimeoutMs: 1_000,
    });

    queue.enqueue("pending", async () => undefined);
    await queue.shutdown();

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        msg: "bg_queue_shutdown_dropped",
        droppedJobs: 1,
      }),
    );
    expect(logger.info).toHaveBeenCalledWith({
      msg: "bg_queue_shutdown_complete",
    });
    expect(queue.enqueue("late", async () => undefined)).toBeNull();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        msg: "bg_queue_shutting_down",
        jobName: "late",
      }),
    );
  });

  it("stops waiting when shutdown exceeds its timeout", async () => {
    const queue = new BackgroundQueue({ concurrency: 1, jobTimeoutMs: 1_000 });

    queue.enqueue("stuck", () => new Promise(() => undefined));
    const shutdownPromise = queue.shutdown(50);

    await vi.advanceTimersByTimeAsync(100);
    await shutdownPromise;

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        msg: "bg_queue_shutdown_timeout",
        stillRunning: 1,
      }),
    );
  });
});
