// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  __resetDbOwnershipForTests,
  claimDbOwnership,
  onYieldRequested,
  readDbOwnership,
} from "../dbOwnership";

/**
 * Власність локальної бази. Перевіряється рівно те, від чого залежить
 * збереження даних: лідер рівно один, послідовник не отримує персистентного
 * сховища, а поступка спершу ЗАКРИВАЄ базу і лише потім віддає лок.
 */
type LockCallback = (lock: object | null) => void | Promise<void>;

function installLocks(): { held: Set<string>; requests: string[] } {
  const held = new Set<string>();
  const requests: string[] = [];
  const request = (
    name: string,
    optionsOrCb: { ifAvailable?: boolean } | LockCallback,
    maybeCb?: LockCallback,
  ): Promise<unknown> => {
    const options = typeof optionsOrCb === "function" ? {} : optionsOrCb;
    const cb = typeof optionsOrCb === "function" ? optionsOrCb : maybeCb!;
    requests.push(name);
    if (held.has(name)) {
      // Зайнятий лок: `ifAvailable` дає відмову одразу, блокувальний запит
      // лишається в черзі - рівно як у справжніх Web Locks.
      return options.ifAvailable
        ? Promise.resolve(cb(null))
        : new Promise<void>(() => {});
    }
    held.add(name);
    return Promise.resolve(cb({}));
  };
  Object.defineProperty(globalThis.navigator, "locks", {
    value: { request },
    configurable: true,
  });
  return { held, requests };
}

describe("власність локальної бази", () => {
  beforeEach(() => {
    __resetDbOwnershipForTests();
  });

  afterEach(() => {
    __resetDbOwnershipForTests();
    Object.defineProperty(globalThis.navigator, "locks", {
      value: undefined,
      configurable: true,
    });
    vi.restoreAllMocks();
  });

  it("перша вкладка стає лідером", async () => {
    installLocks();
    await expect(claimDbOwnership()).resolves.toBe("leader");
    expect(readDbOwnership()).toBe("leader");
  });

  it("друга вкладка стає послідовником, а не чекає", async () => {
    const locks = installLocks();
    locks.held.add("sergeant-sqlite-db");

    await expect(claimDbOwnership()).resolves.toBe("follower");
  });

  // Без `navigator.locks` (старий рушій) застосунок мусить поводитись рівно
  // як до цієї зміни - інакше ремонт обернувся б відмовою відкривати базу.
  it("без Web Locks лишається лідером", async () => {
    Object.defineProperty(globalThis.navigator, "locks", {
      value: undefined,
      configurable: true,
    });

    await expect(claimDbOwnership()).resolves.toBe("leader");
  });

  it("лідерство питається один раз на вкладку", async () => {
    const locks = installLocks();

    await claimDbOwnership();
    await claimDbOwnership();

    expect(locks.requests).toHaveLength(1);
  });

  it("поступка закриває базу перед тим, як віддати лок", async () => {
    installLocks();
    const closed = vi.fn(() => Promise.resolve());
    onYieldRequested(closed);
    await claimDbOwnership();

    const channel = new BroadcastChannel("sergeant-db-ownership");
    channel.postMessage({ type: "claim" });
    await vi.waitFor(() => expect(readDbOwnership()).toBe("follower"));
    channel.close();

    expect(closed).toHaveBeenCalledOnce();
  });

  // D4 аудиту живучості 2026-09-28: вкладка, що віддала базу, лишалась
  // заблокованою й після закриття сусідки. Тепер вона стає в чергу за локом,
  // коли людина до неї повертається, але не раніше.
  it("після поступки стає в чергу лише коли вкладку знову відкрили", async () => {
    const locks = installLocks();
    await claimDbOwnership();

    const channel = new BroadcastChannel("sergeant-db-ownership");
    channel.postMessage({ type: "claim" });
    await vi.waitFor(() => expect(readDbOwnership()).toBe("follower"));
    channel.close();
    const afterYield = locks.requests.length;

    window.dispatchEvent(new Event("blur"));
    expect(locks.requests).toHaveLength(afterYield);

    window.dispatchEvent(new Event("focus"));
    expect(locks.requests).toHaveLength(afterYield + 1);

    // Повторний фокус не ставить у чергу вдруге.
    window.dispatchEvent(new Event("focus"));
    expect(locks.requests).toHaveLength(afterYield + 1);
  });
});
