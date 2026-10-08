/**
 * Last validated: 2026-10-02
 * Status: Active
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetInitialPullStateForTests,
  getInitialPullVersion,
  hasCompletedInitialPull,
  markInitialPullComplete,
  reconcileInitialPull,
  resetInitialPull,
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
