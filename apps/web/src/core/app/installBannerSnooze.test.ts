// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  INSTALL_BANNER_MAX_SNOOZES,
  INSTALL_BANNER_SNOOZE_MS,
  isInstallBannerSnoozed,
  readInstallBannerSnooze,
  snoozeInstallBanner,
} from "./installBannerSnooze";

const KEY = "test_install_banner_snooze_v1";

beforeEach(() => {
  window.localStorage.clear();
});

describe("installBannerSnooze — TTL", () => {
  it("no persisted state → not snoozed", () => {
    expect(readInstallBannerSnooze(KEY)).toBeNull();
    expect(isInstallBannerSnoozed(null)).toBe(false);
  });

  it("snoozing persists until = now + 30d and count = 1", () => {
    const now = 1_000_000;
    const state = snoozeInstallBanner(KEY, null, now);
    expect(state).toEqual({ until: now + INSTALL_BANNER_SNOOZE_MS, count: 1 });
    expect(readInstallBannerSnooze(KEY)).toEqual(state);
  });

  it("stays hidden the instant after snoozing (regression: this used to be permanent)", () => {
    const now = 1_000_000;
    const state = snoozeInstallBanner(KEY, null, now);
    expect(isInstallBannerSnoozed(state, now + 1)).toBe(true);
  });

  it("reappears exactly once the 30-day window has elapsed", () => {
    const now = 1_000_000;
    const state = snoozeInstallBanner(KEY, null, now);
    // One ms before expiry → still hidden.
    expect(
      isInstallBannerSnoozed(state, now + INSTALL_BANNER_SNOOZE_MS - 1),
    ).toBe(true);
    // At/after expiry → visible again.
    expect(isInstallBannerSnoozed(state, now + INSTALL_BANNER_SNOOZE_MS)).toBe(
      false,
    );
  });

  it("each snooze bumps the count and resets the window from `now`", () => {
    let state = snoozeInstallBanner(KEY, null, 0);
    expect(state.count).toBe(1);
    state = snoozeInstallBanner(KEY, state, 100);
    expect(state.count).toBe(2);
    expect(state.until).toBe(100 + INSTALL_BANNER_SNOOZE_MS);
  });

  it("after INSTALL_BANNER_MAX_SNOOZES, banner stays hidden even past the TTL window", () => {
    let state: ReturnType<typeof snoozeInstallBanner> | null = null;
    for (let i = 0; i < INSTALL_BANNER_MAX_SNOOZES; i++) {
      state = snoozeInstallBanner(KEY, state, i);
    }
    expect(state?.count).toBe(INSTALL_BANNER_MAX_SNOOZES);
    // Far in the future — well past any TTL window — still suppressed
    // because the show-count cap, not the timer, is now the gate.
    expect(isInstallBannerSnoozed(state, Number.MAX_SAFE_INTEGER)).toBe(true);
  });

  it('readInstallBannerSnooze ignores corrupt/legacy shapes (e.g. old "1" flag) instead of throwing', () => {
    window.localStorage.setItem(KEY, "1");
    expect(readInstallBannerSnooze(KEY)).toBeNull();
    window.localStorage.setItem(KEY, JSON.stringify({ count: 1 }));
    expect(readInstallBannerSnooze(KEY)).toBeNull();
  });
});
