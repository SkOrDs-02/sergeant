// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  PENDING_SIGN_OUT_KEY,
  clearPendingSignOut,
  hasPendingSignOut,
  isSignOutConfirmed,
  markPendingSignOut,
  retryPendingSignOut,
} from "./pendingSignOut";
import { purgeAppOwnedLocalData } from "../../shared/lib/storage/purgeLocalData";

afterEach(() => {
  localStorage.removeItem(PENDING_SIGN_OUT_KEY);
});

describe("isSignOutConfirmed (sec-07)", () => {
  it("2xx (немає error) і 401 підтверджують вихід, решта ні", () => {
    expect(isSignOutConfirmed(undefined)).toBe(true);
    expect(isSignOutConfirmed({ error: null })).toBe(true);
    expect(isSignOutConfirmed({ error: { status: 401 } })).toBe(true);
    expect(isSignOutConfirmed({ error: { status: 500 } })).toBe(false);
    expect(isSignOutConfirmed({ error: { status: 429 } })).toBe(false);
    expect(isSignOutConfirmed({ error: {} })).toBe(false);
  });
});

describe("pendingSignOut marker (sec-07)", () => {
  it("mark / has / clear", () => {
    expect(hasPendingSignOut()).toBe(false);
    markPendingSignOut();
    expect(hasPendingSignOut()).toBe(true);
    clearPendingSignOut();
    expect(hasPendingSignOut()).toBe(false);
  });

  it("переживає purgeAppOwnedLocalData: інакше teardown logout() стер би його одразу", async () => {
    markPendingSignOut();
    localStorage.setItem("finyk_tx_cache", "[]");

    await purgeAppOwnedLocalData();

    expect(localStorage.getItem("finyk_tx_cache")).toBeNull();
    expect(hasPendingSignOut()).toBe(true);
  });
});

describe("retryPendingSignOut (sec-07)", () => {
  it("без маркера нічого не викликає", async () => {
    const signOutFn = vi.fn(async () => undefined);
    expect(await retryPendingSignOut(signOutFn)).toBe("none");
    expect(signOutFn).not.toHaveBeenCalled();
  });

  it("2xx знімає маркер; помилка чи виняток лишають", async () => {
    markPendingSignOut();
    expect(
      await retryPendingSignOut(async () => ({ error: { status: 500 } })),
    ).toBe("failed");
    expect(hasPendingSignOut()).toBe(true);

    expect(
      await retryPendingSignOut(async () => {
        throw new Error("Failed to fetch");
      }),
    ).toBe("failed");
    expect(hasPendingSignOut()).toBe(true);

    expect(await retryPendingSignOut(async () => ({ error: null }))).toBe(
      "confirmed",
    );
    expect(hasPendingSignOut()).toBe(false);
  });

  it("401 знімає маркер (сесії на сервері вже немає)", async () => {
    markPendingSignOut();
    expect(
      await retryPendingSignOut(async () => ({ error: { status: 401 } })),
    ).toBe("confirmed");
    expect(hasPendingSignOut()).toBe(false);
  });

  it("паралельні виклики ділять один запит", async () => {
    markPendingSignOut();
    const signOutFn = vi.fn(async () => undefined);
    const [a, b] = await Promise.all([
      retryPendingSignOut(signOutFn),
      retryPendingSignOut(signOutFn),
    ]);
    expect(signOutFn).toHaveBeenCalledTimes(1);
    expect([a, b]).toEqual(["confirmed", "confirmed"]);
  });
});
