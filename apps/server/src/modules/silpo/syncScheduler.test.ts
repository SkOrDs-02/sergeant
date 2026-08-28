import { afterEach, describe, expect, it, vi } from "vitest";
import { SilpoSyncPoller } from "./syncScheduler.js";

/**
 * Контракт poller-а. Найважливіше — те, заради чого він взагалі існує:
 * без нього чеки підтягуються ЛИШЕ по кнопці, а n8n у проді на паузі
 * (`plataScheduler.ts` фіксує це прямо в коментарі), тож зовнішнього
 * крона, який би смикнув `/api/internal/silpo/sync-all`, немає.
 */

const EMPTY = {
  candidates: 0,
  synced: 0,
  failed: 0,
  receiptsInserted: 0,
  matched: 0,
};

afterEach(() => {
  vi.useRealTimers();
});

describe("SilpoSyncPoller", () => {
  it("мовчить, коли інтеграція вимкнена — дефолт і поточний стан проду", () => {
    const run = vi.fn();
    const poller = new SilpoSyncPoller({ enabled: false, run });

    poller.start();

    expect(run).not.toHaveBeenCalled();
  });

  it("не бʼє Сільпо одразу на старті процесу", () => {
    vi.useFakeTimers();
    const run = vi.fn().mockResolvedValue(EMPTY);
    const poller = new SilpoSyncPoller({
      enabled: true,
      run,
      startDelayMs: 5 * 60 * 1000,
    });

    poller.start();
    expect(run).not.toHaveBeenCalled();

    // Серія швидких передеплоїв не має перетворюватись на серію прогонів.
    vi.advanceTimersByTime(4 * 60 * 1000);
    expect(run).not.toHaveBeenCalled();

    vi.advanceTimersByTime(2 * 60 * 1000);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("передає поріг віку — рестарт не ганяє синк заново", async () => {
    const run = vi.fn().mockResolvedValue(EMPTY);
    const poller = new SilpoSyncPoller({
      enabled: true,
      run,
      startDelayMs: 0,
      minAgeHours: 20,
    });

    poller.start();
    await vi.waitFor(() => expect(run).toHaveBeenCalled());

    expect(run).toHaveBeenCalledWith({ minAgeHours: 20 });
    await poller.stop();
  });

  it("tick не накладається сам на себе", async () => {
    let release: (() => void) | undefined;
    const run = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve(EMPTY);
        }),
    );
    const poller = new SilpoSyncPoller({ enabled: true, run, startDelayMs: 0 });

    const first = poller.tick();
    const second = await poller.tick();

    // Другий виклик повертає null, не чекаючи й не запускаючи ще один прогін.
    expect(second).toBeNull();
    expect(run).toHaveBeenCalledTimes(1);

    release?.();
    await first;
  });

  it("падіння прогону не валить процес і не блокує наступний tick", async () => {
    const run = vi
      .fn()
      .mockRejectedValueOnce(new Error("upstream down"))
      .mockResolvedValueOnce(EMPTY);
    const poller = new SilpoSyncPoller({ enabled: true, run, startDelayMs: 0 });

    await expect(poller.tick()).resolves.toBeNull();
    await expect(poller.tick()).resolves.toEqual(EMPTY);
  });

  it("stop до першого тика скасовує відкладений старт", async () => {
    vi.useFakeTimers();
    const run = vi.fn().mockResolvedValue(EMPTY);
    const poller = new SilpoSyncPoller({
      enabled: true,
      run,
      startDelayMs: 60_000,
    });

    poller.start();
    await poller.stop();
    vi.advanceTimersByTime(120_000);

    expect(run).not.toHaveBeenCalled();
  });
});
