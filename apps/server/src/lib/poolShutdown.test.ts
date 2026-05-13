/**
 * Audit `docs/audits/2026-05-13-backend-performance-roast.md` § P2-5 —
 * unit-тести bounded `pg.Pool` drain.
 *
 * Поведінка під тестом:
 *
 *   1. Happy path: `pool.end()` резолвиться швидко → helper повертає
 *      `{ ok: true }` і пише `logger.info({ msg: "pg_pool_ended" })`.
 *   2. Edge: `pool.end()` зависає назавжди → AbortController спрацьовує по
 *      `timeoutMs` і helper повертає `{ ok: false, reason: "aborted" }`
 *      із `abortedAfterMs ≤ timeoutMs` (< `SHUTDOWN_GRACE_MS`), плюс
 *      `logger.warn({ msg: "pg_pool_end_timeout" })`.
 *   3. Edge: `pool.end()` відхиляється з помилкою → helper повертає
 *      `{ ok: false, reason: "error" }` і пише `logger.warn({ msg:
 *      "pg_pool_end_error" })`. Helper ніколи не throws.
 *   4. Edge: вже-aborted external signal на старті — helper резолвиться
 *      `aborted` без чекання `timeoutMs`.
 *
 * Реальний `pg.Pool` НЕ touch-ається — інжектуємо мінімальний duck-type
 * `{ end: () => Promise<void> }`. Pino-логер мокаємо `vi.fn()`-ами, бо
 * helper приймає його як injected dep.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  endPoolWithAbortTimeout,
  type EndPoolResult,
  type ShutdownLogger,
} from "./poolShutdown.js";

type MockLogger = {
  [K in keyof ShutdownLogger]: ReturnType<typeof vi.fn<ShutdownLogger[K]>>;
};

function makeLogger(): MockLogger {
  return {
    info: vi.fn<ShutdownLogger["info"]>(),
    warn: vi.fn<ShutdownLogger["warn"]>(),
  };
}

// Default-у `SHUTDOWN_GRACE_MS` = 15_000ms у `env.ts`. Тест використовує
// той самий бюджет, щоб assert "shutdown completes ≤ SHUTDOWN_GRACE_MS"
// був max близько до prod-конфігу.
const SHUTDOWN_GRACE_MS = 15_000;
const POOL_END_TIMEOUT_MS = Math.floor(SHUTDOWN_GRACE_MS / 2); // 7_500

describe("endPoolWithAbortTimeout (audit P2-5)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves ok when pool.end() completes within the timeout", async () => {
    const logger = makeLogger();
    const end = vi.fn(async () => {
      await new Promise<void>((r) => setTimeout(r, 10));
    });

    const resultP = endPoolWithAbortTimeout(
      { end },
      { timeoutMs: POOL_END_TIMEOUT_MS, logger },
    );

    await vi.advanceTimersByTimeAsync(10);

    const result = await resultP;
    expect(result).toEqual({ ok: true, reason: "ended" });
    expect(end).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith({ msg: "pg_pool_ended" });
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("aborts when pool.end() hangs and total shutdown stays within SHUTDOWN_GRACE_MS", async () => {
    const logger = makeLogger();
    // Hanging pool.end — ніколи не резолвиться. Symуляція pg-pool, що
    // тримає active client у середині транзакції.
    const end = vi.fn(() => new Promise<void>(() => {}));

    const startedAt = Date.now();
    const resultP = endPoolWithAbortTimeout(
      { end },
      { timeoutMs: POOL_END_TIMEOUT_MS, logger },
    );

    // Просуваємо час трохи понад timeoutMs, щоб AbortController встиг
    // спрацювати. Залишаємось всередині `SHUTDOWN_GRACE_MS` бюджету.
    await vi.advanceTimersByTimeAsync(POOL_END_TIMEOUT_MS + 100);

    const result = await resultP;
    const totalElapsedMs = Date.now() - startedAt;

    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ reason: "aborted" });
    if (result.ok === false && result.reason === "aborted") {
      expect(result.abortedAfterMs).toBeGreaterThanOrEqual(POOL_END_TIMEOUT_MS);
      expect(result.abortedAfterMs).toBeLessThanOrEqual(SHUTDOWN_GRACE_MS);
    }
    // Загальний shutdown-крок укладається у grace-вікно — це і є контракт,
    // який раніше не виконувався (pool drain міг зависнути аж до hard-timer).
    expect(totalElapsedMs).toBeLessThanOrEqual(SHUTDOWN_GRACE_MS);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        msg: "pg_pool_end_timeout",
        timeoutMs: POOL_END_TIMEOUT_MS,
      }),
    );
    expect(logger.info).not.toHaveBeenCalled();
  });

  it("returns error result and logs warn when pool.end() rejects (never throws)", async () => {
    const logger = makeLogger();
    const boom = new Error("pg pool ended with active clients");
    const end = vi.fn(async () => {
      throw boom;
    });

    let result: EndPoolResult | undefined;
    let thrown: unknown = null;
    try {
      result = await endPoolWithAbortTimeout(
        { end },
        { timeoutMs: POOL_END_TIMEOUT_MS, logger },
      );
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeNull();
    expect(result?.ok).toBe(false);
    expect(result).toMatchObject({ reason: "error" });
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ msg: "pg_pool_end_error" }),
    );
  });

  it("aborts immediately when externalSignal is already aborted at entry", async () => {
    const logger = makeLogger();
    const end = vi.fn(() => new Promise<void>(() => {}));
    const externalController = new AbortController();
    externalController.abort();

    const resultP = endPoolWithAbortTimeout(
      { end },
      {
        timeoutMs: POOL_END_TIMEOUT_MS,
        logger,
        externalSignal: externalController.signal,
      },
    );

    // Не просуваємо таймери — abort має спрацювати на entry.
    const result = await resultP;
    expect(result).toMatchObject({ ok: false, reason: "aborted" });
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ msg: "pg_pool_end_timeout" }),
    );
  });
});
