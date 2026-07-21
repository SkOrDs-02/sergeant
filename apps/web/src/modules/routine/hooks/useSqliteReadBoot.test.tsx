// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook, waitFor } from "@testing-library/react";

const bootMock = vi.fn();
const emitMock = vi.fn();
let authUser: { id: string } | null = null;
let demoActive = false;

vi.mock("../../../core/auth/AuthContext", () => ({
  useAuth: () => ({ user: authUser }),
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
    demoActive = false;
    bootMock.mockResolvedValue(false);
  });

  afterEach(() => {
    cleanup();
    authUser = null;
    demoActive = false;
  });

  it("stays dormant without an auth user or active demo", () => {
    renderHook(() => useSqliteReadBoot());

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
