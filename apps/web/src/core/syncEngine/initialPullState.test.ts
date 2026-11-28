/**
 * Last validated: 2026-10-02
 * Status: Active
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetInitialPullStateForTests,
  getFirstPullPhase,
  getInitialPullVersion,
  hasCompletedInitialPull,
  markFirstPullPending,
  markFirstPullSettled,
  noteFirstPullFailure,
  markInitialPullComplete,
  markSyncBootPending,
  reconcileInitialPull,
  resetInitialPull,
  settleSyncBootPending,
  subscribeInitialPull,
} from "./initialPullState";

const clientA = {};
const clientB = {};

beforeEach(() => __resetInitialPullStateForTests());

describe("initialPullState", () => {
  it("за замовчуванням початковий pull не завершено", () => {
    expect(hasCompletedInitialPull()).toBe(false);
    expect(hasCompletedInitialPull("u1")).toBe(false);
  });

  it("mark: прапор прив'язаний до користувача", () => {
    markInitialPullComplete("u1", clientA);
    expect(hasCompletedInitialPull()).toBe(true);
    expect(hasCompletedInitialPull("u1")).toBe(true);
    expect(hasCompletedInitialPull("u2")).toBe(false);
  });

  it("reconcile: той самий користувач і client не скидають, інші скидають", () => {
    markInitialPullComplete("u1", clientA);
    reconcileInitialPull("u1", clientA);
    expect(hasCompletedInitialPull("u1")).toBe(true);

    reconcileInitialPull("u1", clientB);
    expect(hasCompletedInitialPull()).toBe(false);

    markInitialPullComplete("u1", clientA);
    reconcileInitialPull("u2", clientA);
    expect(hasCompletedInitialPull()).toBe(false);

    markInitialPullComplete("u1", clientA);
    reconcileInitialPull(null, null);
    expect(hasCompletedInitialPull()).toBe(false);
  });

  it("підписники й версія: змінюється лише справжня зміна стану", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeInitialPull(listener);
    const v0 = getInitialPullVersion();

    markInitialPullComplete("u1", clientA);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(getInitialPullVersion()).toBe(v0 + 1);

    // Повторне mark того ж стану — не подія.
    markInitialPullComplete("u1", clientA);
    reconcileInitialPull("u1", clientA);
    expect(listener).toHaveBeenCalledTimes(1);

    resetInitialPull();
    expect(listener).toHaveBeenCalledTimes(2);
    // Скидання вже скинутого — не подія.
    resetInitialPull();
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    markInitialPullComplete("u1", clientA);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("підписник, що кидає, не ламає решту", () => {
    const bad = vi.fn(() => {
      throw new Error("boom");
    });
    const good = vi.fn();
    subscribeInitialPull(bad);
    subscribeInitialPull(good);
    expect(() => markInitialPullComplete("u1", clientA)).not.toThrow();
    expect(good).toHaveBeenCalledTimes(1);
  });
});

describe("initialPullState — фаза першого pull (data-59/60)", () => {
  it("за замовчуванням idle; збій поза першим pull не рахується", () => {
    expect(getFirstPullPhase()).toBe("idle");
    expect(noteFirstPullFailure(3)).toBe(0);
    expect(getFirstPullPhase()).toBe("idle");
  });

  it("pending → loading; після maxRetries повторів → failed", () => {
    const listener = vi.fn();
    subscribeInitialPull(listener);
    markFirstPullPending();
    expect(getFirstPullPhase()).toBe("loading");
    expect(listener).toHaveBeenCalledTimes(1);
    expect(noteFirstPullFailure(2)).toBe(1);
    expect(noteFirstPullFailure(2)).toBe(2);
    expect(getFirstPullPhase()).toBe("loading");
    expect(noteFirstPullFailure(2)).toBe(3);
    expect(getFirstPullPhase()).toBe("failed");
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("завершений pull, settled і reset повертають idle й обнуляють лічильник", () => {
    markFirstPullPending();
    noteFirstPullFailure(0);
    expect(getFirstPullPhase()).toBe("failed");
    markInitialPullComplete("u1", clientA);
    expect(getFirstPullPhase()).toBe("idle");

    markFirstPullPending();
    markFirstPullSettled();
    expect(getFirstPullPhase()).toBe("idle");

    markFirstPullPending();
    expect(noteFirstPullFailure(5)).toBe(1);
    resetInitialPull();
    expect(getFirstPullPhase()).toBe("idle");
    markFirstPullPending();
    expect(noteFirstPullFailure(5)).toBe(1);
  });

  // FULL-20261126-ROUTINE-6: між стартом синку і рішенням reader-а (сесія,
  // база, `resolvePullMode`) фаза була `idle`, і модулі малювали порожній стан
  // раніше за «Завантажую з хмари…».
  describe("вікно старту синку (boot pending)", () => {
    it("до рішення reader-а фаза loading, не idle", () => {
      markSyncBootPending();
      expect(getFirstPullPhase()).toBe("loading");
    });

    it("рішення reader-а знімає вікно: settled -> idle, pending -> loading без блимання", () => {
      const seen: string[] = [];
      subscribeInitialPull(() => seen.push(getFirstPullPhase()));
      markSyncBootPending();
      markFirstPullPending();
      expect(getFirstPullPhase()).toBe("loading");
      markFirstPullSettled();
      expect(getFirstPullPhase()).toBe("idle");
      expect(seen).not.toContain("failed");
      // idle не з'являється між двома loading.
      expect(seen.slice(0, 2)).toEqual(["loading", "loading"]);
    });

    it("збій тіка до рішення (офлайн-сесія) повертає правдивий idle і не рахує невдачі", () => {
      markSyncBootPending();
      expect(noteFirstPullFailure(2)).toBe(0);
      expect(getFirstPullPhase()).toBe("idle");
    });

    it("завершений pull не повертається в loading", () => {
      markInitialPullComplete("u1", clientA);
      markSyncBootPending();
      expect(getFirstPullPhase()).toBe("idle");
    });

    it("settleSyncBootPending і стеля часу не дають застрягти", () => {
      vi.useFakeTimers();
      try {
        markSyncBootPending();
        settleSyncBootPending();
        expect(getFirstPullPhase()).toBe("idle");
        markSyncBootPending();
        vi.advanceTimersByTime(8_001);
        expect(getFirstPullPhase()).toBe("idle");
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
