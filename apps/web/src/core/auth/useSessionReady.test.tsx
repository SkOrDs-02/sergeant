// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

let mockAuth: { status: string } | null = null;
vi.mock("./AuthContext", () => ({ useAuthOptional: () => mockAuth }));

import { useSessionReady } from "./useSessionReady";

afterEach(() => {
  mockAuth = null;
});

describe("useSessionReady (FULL-20261119-PERF-1)", () => {
  it.each([
    ["loading", false],
    ["unauthenticated", false],
    ["pending_deletion", false],
    ["authenticated", true],
  ])("status %s → %s", (status, ready) => {
    mockAuth = { status };
    expect(renderHook(() => useSessionReady()).result.current).toBe(ready);
  });

  it("поза AuthProvider лишає попередню поведінку (true)", () => {
    mockAuth = null;
    expect(renderHook(() => useSessionReady()).result.current).toBe(true);
  });
});
