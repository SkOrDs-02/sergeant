import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  __resetFtuxDripQueueForTesting,
  enqueueFtuxDripMail,
  isRetryableFtuxDripError,
  processFtuxDripJob,
  registerFtuxDripDispatcher,
} from "./ftuxDrip.js";
import { FtuxDripSkip } from "../../email/ftuxDripMail.js";

describe("isRetryableFtuxDripError", () => {
  it("retry для 5xx, 429, network-помилок без HTTP-status", () => {
    expect(isRetryableFtuxDripError(new Error("Resend HTTP 500: oops"))).toBe(
      true,
    );
    expect(isRetryableFtuxDripError(new Error("Resend HTTP 503: bad"))).toBe(
      true,
    );
    expect(isRetryableFtuxDripError(new Error("Resend HTTP 429: rate"))).toBe(
      true,
    );
    expect(isRetryableFtuxDripError(new Error("ECONNRESET"))).toBe(true);
    expect(isRetryableFtuxDripError("ENOTFOUND")).toBe(true);
  });

  it("permanent для 4xx (крім 429)", () => {
    expect(isRetryableFtuxDripError(new Error("Resend HTTP 400: bad"))).toBe(
      false,
    );
    expect(isRetryableFtuxDripError(new Error("Resend HTTP 403: bad"))).toBe(
      false,
    );
    expect(isRetryableFtuxDripError(new Error("Resend HTTP 404: bad"))).toBe(
      false,
    );
    expect(isRetryableFtuxDripError(new Error("Resend HTTP 422: bad"))).toBe(
      false,
    );
  });
});

describe("enqueueFtuxDripMail (no Redis fallback)", () => {
  beforeEach(() => {
    __resetFtuxDripQueueForTesting();
    delete process.env["REDIS_URL"];
  });

  afterEach(() => {
    __resetFtuxDripQueueForTesting();
    vi.useRealTimers();
  });

  it("Day 0 синхронно делегує до зареєстрованого dispatcher-а", async () => {
    const dispatcher = vi.fn().mockResolvedValue(undefined);
    registerFtuxDripDispatcher(dispatcher);

    await enqueueFtuxDripMail({
      kind: "ftux_drip",
      day: "day_0",
      userId: "u1",
      email: "u1@example.com",
      delayMs: 0,
    });

    // dispatcher викликається з payload-ом і завершується безсинхронно.
    await vi.waitFor(() => expect(dispatcher).toHaveBeenCalledTimes(1));
    expect(dispatcher).toHaveBeenCalledWith(
      expect.objectContaining({ day: "day_0", userId: "u1" }),
    );
  });

  it("Day 1 / Day 3 без Redis — пропускаються, dispatcher не викликається", async () => {
    const dispatcher = vi.fn().mockResolvedValue(undefined);
    registerFtuxDripDispatcher(dispatcher);

    for (const day of ["day_1", "day_3"] as const) {
      await enqueueFtuxDripMail({
        kind: "ftux_drip",
        day,
        userId: "u1",
        email: "u1@example.com",
        delayMs: day === "day_1" ? 86400000 : 259200000,
      });
    }

    // Pause to let any microtasks flush
    await new Promise((r) => setImmediate(r));
    expect(dispatcher).not.toHaveBeenCalled();
  });

  it("FtuxDripSkip-помилка з dispatcher-а не вважається permanent failure", async () => {
    const dispatcher = vi
      .fn()
      .mockRejectedValue(new FtuxDripSkip("skipped_optout", "opted out"));
    registerFtuxDripDispatcher(dispatcher);

    await enqueueFtuxDripMail({
      kind: "ftux_drip",
      day: "day_0",
      userId: "u1",
      email: "u1@example.com",
      delayMs: 0,
    });

    // Не throw-ить нагору, ні викликає Sentry/error-логику. Тест просто
    // підтверджує, що caller-side не отримує rejected promise.
    await vi.waitFor(() => expect(dispatcher).toHaveBeenCalledTimes(1));
  });
});

describe("processFtuxDripJob (worker)", () => {
  beforeEach(() => {
    __resetFtuxDripQueueForTesting();
  });
  afterEach(() => __resetFtuxDripQueueForTesting());

  it("делегує до dispatcher-а і резолвить при ok", async () => {
    const dispatcher = vi.fn().mockResolvedValue(undefined);
    registerFtuxDripDispatcher(dispatcher);

    await processFtuxDripJob({
      data: {
        kind: "ftux_drip",
        day: "day_0",
        userId: "u1",
        email: "u1@example.com",
        delayMs: 0,
      },
      attemptsMade: 1,
      name: "day_0",
    });

    expect(dispatcher).toHaveBeenCalledTimes(1);
  });

  it("FtuxDripSkip → завершує job як completed (не throw)", async () => {
    const dispatcher = vi
      .fn()
      .mockRejectedValue(new FtuxDripSkip("skipped_already_sent", "dup"));
    registerFtuxDripDispatcher(dispatcher);

    await expect(
      processFtuxDripJob({
        data: {
          kind: "ftux_drip",
          day: "day_1",
          userId: "u1",
          email: "u1@example.com",
          delayMs: 86400000,
        },
        attemptsMade: 1,
        name: "day_1",
      }),
    ).resolves.toBeUndefined();
  });

  it("permanent error (4xx) → не throw, BullMQ не ретраїть", async () => {
    const dispatcher = vi
      .fn()
      .mockRejectedValue(new Error("Resend HTTP 422: bad email"));
    registerFtuxDripDispatcher(dispatcher);

    await expect(
      processFtuxDripJob({
        data: {
          kind: "ftux_drip",
          day: "day_0",
          userId: "u1",
          email: "u1@example.com",
          delayMs: 0,
        },
        attemptsMade: 1,
        name: "day_0",
      }),
    ).resolves.toBeUndefined();
  });

  it("retryable error (5xx) → throw для BullMQ-ретраю", async () => {
    const dispatcher = vi
      .fn()
      .mockRejectedValue(new Error("Resend HTTP 503: down"));
    registerFtuxDripDispatcher(dispatcher);

    await expect(
      processFtuxDripJob({
        data: {
          kind: "ftux_drip",
          day: "day_0",
          userId: "u1",
          email: "u1@example.com",
          delayMs: 0,
        },
        attemptsMade: 1,
        name: "day_0",
      }),
    ).rejects.toThrow(/Resend HTTP 503/);
  });
});
