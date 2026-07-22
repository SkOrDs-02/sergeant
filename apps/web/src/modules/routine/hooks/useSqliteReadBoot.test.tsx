// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook, waitFor } from "@testing-library/react";

const bootMock = vi.fn();
const emitMock = vi.fn();
let authUser: { id: string } | null = null;
let authStatus = "unauthenticated";
let demoActive = false;

vi.mock("../../../core/auth/AuthContext", () => ({
  useAuth: () => ({ user: authUser, status: authStatus }),
}));
vi.mock("../../../core/onboarding/onboardingGate", () => ({
  DEMO_LOCAL_USER_ID: "demo-local-user",
  isDemoActive: () => demoActive,
}));
vi.mock("../lib/sqliteReadBoot", () => ({
  bootSqliteReadPath: (...args: unknown[]) => bootMock(...args),
}));
vi.mock("../lib/routineStorage", () => ({
  emitRoutineStorage: () => emitMock(),
}));

import { useSqliteReadBoot } from "./useSqliteReadBoot";

describe("useSqliteReadBoot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authUser = null;
    authStatus = "unauthenticated";
    demoActive = false;
    bootMock.mockResolvedValue(false);
  });

  afterEach(() => {
    cleanup();
    authUser = null;
    authStatus = "unauthenticated";
    demoActive = false;
  });

  it("boots under the anonymous id when nobody is signed in", async () => {
    bootMock.mockResolvedValue(true);

    renderHook(() => useSqliteReadBoot());

    // Regression: this used to stay dormant, so an anonymous visitor's
    // habit was written to the warm cache only and vanished on reload.
    await waitFor(() => {
      expect(bootMock).toHaveBeenCalledWith("local-anon");
    });
  });

  it("stays dormant while the session is still resolving", () => {
    authStatus = "loading";

    renderHook(() => useSqliteReadBoot());

    // Booting the anon partition here would strand an authenticated
    // user's first writes in `sergeant-anon.db`.
    expect(bootMock).not.toHaveBeenCalled();
    expect(emitMock).not.toHaveBeenCalled();
  });

  it("boots once for the authenticated user and re-emits storage on activation", async () => {
    authUser = { id: "routine-u1" };
    bootMock.mockResolvedValue(true);

    const { rerender } = renderHook(() => useSqliteReadBoot());
    rerender();

    await waitFor(() => {
      expect(bootMock).toHaveBeenCalledWith("routine-u1");
      expect(emitMock).toHaveBeenCalledTimes(1);
    });
    expect(bootMock).toHaveBeenCalledTimes(1);
  });

  it("uses the synthetic demo user id when demo mode is active", async () => {
    demoActive = true;
    bootMock.mockResolvedValue(true);

    renderHook(() => useSqliteReadBoot());

    await waitFor(() => {
      expect(bootMock).toHaveBeenCalledWith("demo-local-user");
    });
  });

  it("does not emit storage when SQLite read boot does not activate", async () => {
    authUser = { id: "routine-u2" };
    bootMock.mockResolvedValue(false);

    renderHook(() => useSqliteReadBoot());

    await waitFor(() => {
      expect(bootMock).toHaveBeenCalledWith("routine-u2");
    });
    expect(emitMock).not.toHaveBeenCalled();
  });
});
