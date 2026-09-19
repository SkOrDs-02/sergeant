import { describe, expect, it, vi } from "vitest";

import { DEFAULT_POLLER_DRAIN_MS, waitUntilIdle } from "./pollerDrain.js";

/**
 * Тестовий plan:
 *   1. Полер уже простоює — повертаємось негайно, без жодного кроку сну.
 *   2. Полер завершує сам — дочікуємось і рапортуємо `idle: true`.
 *   3. Полер НЕ завершується — виходимо за стелею, а не зависаємо назавжди.
 *
 * Пункт 3 — суть фіксу. До нього в чотирьох полерах стояв
 * `while (this.running) await sleep(20)` без межі: зависла БД чи апстрім
 * означали, що `stop()` не повернеться ніколи, і shutdown доживав до
 * SIGKILL замість graceful-виходу.
 */
describe("waitUntilIdle", () => {
  it("returns immediately when the poller is already idle", async () => {
    const result = await waitUntilIdle(() => false);
    expect(result.idle).toBe(true);
    // Нуль кроків сну: найчастіший випадок не має коштувати навіть 20 мс.
    expect(result.waitedMs).toBeLessThan(20);
  });

  it("waits for an in-flight tick to finish on its own", async () => {
    let busy = true;
    setTimeout(() => {
      busy = false;
    }, 60);

    const result = await waitUntilIdle(() => busy, 2_000);
    expect(result.idle).toBe(true);
    expect(result.waitedMs).toBeGreaterThanOrEqual(40);
  });

  it("gives up at the ceiling instead of hanging forever", async () => {
    // Полер, що не завершується ніколи — зависла БД або мертвий апстрім.
    const started = Date.now();
    const result = await waitUntilIdle(() => true, 120);

    expect(result.idle).toBe(false);
    expect(result.waitedMs).toBeGreaterThanOrEqual(100);
    // Головне: ми ВЗАГАЛІ повернулись, і то швидко.
    expect(Date.now() - started).toBeLessThan(1_000);
  });

  it("exposes a ceiling that leaves room for the rest of shutdown", () => {
    // Стеля мусить лишатись помітно меншою за hard-таймаут shutdown-у
    // (9 с), інакше один полер з'їдає бюджет закриття пулу й flush-у
    // телеметрії.
    expect(DEFAULT_POLLER_DRAIN_MS).toBeLessThanOrEqual(2_000);
  });

  it("does not spin the event loop while waiting", async () => {
    const isBusy = vi.fn(() => true);
    await waitUntilIdle(isBusy, 100);
    // Крок опитування 20 мс: за 100 мс це одиниці викликів, не тисячі.
    // Busy-wait без сну зробив би їх десятки тисяч і зжер CPU на shutdown-і.
    expect(isBusy.mock.calls.length).toBeLessThan(20);
  });
});
