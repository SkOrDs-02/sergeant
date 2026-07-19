/** @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import type { UseAppLockReturn } from "./useAppLock";

const mockAppLock = vi.fn<() => UseAppLockReturn>();

vi.mock("./useAppLock", () => ({
  useAppLock: () => mockAppLock(),
}));

import { AppLockProvider, useAppLockContext } from "./AppLockContext";

afterEach(cleanup);

function makeAppLockReturn(
  overrides: Partial<UseAppLockReturn> = {},
): UseAppLockReturn {
  return {
    state: "idle",
    startSetup: vi.fn(),
    startChange: vi.fn(),
    unlock: vi.fn(async () => true),
    finishSetup: vi.fn(),
    lock: vi.fn(),
    savePin: vi.fn(async () => {}),
    ...overrides,
  } as UseAppLockReturn;
}

function Consumer() {
  const { state } = useAppLockContext();
  return <div data-testid="state">{state}</div>;
}

describe("AppLockContext", () => {
  it("provides the useAppLock() value to descendants", () => {
    mockAppLock.mockReturnValue(makeAppLockReturn({ state: "locked" }));
    render(
      <AppLockProvider>
        <Consumer />
      </AppLockProvider>,
    );
    expect(screen.getByTestId("state").textContent).toBe("locked");
  });

  it("useAppLockContext throws when used outside the provider", () => {
    // Suppress React's expected error-boundary-less console noise.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Consumer />)).toThrow(
      "useAppLockContext must be used inside AppLockProvider",
    );
    spy.mockRestore();
  });

  it("re-renders consumers when the underlying hook value changes", () => {
    mockAppLock.mockReturnValue(makeAppLockReturn({ state: "idle" }));
    const { rerender } = render(
      <AppLockProvider>
        <Consumer />
      </AppLockProvider>,
    );
    expect(screen.getByTestId("state").textContent).toBe("idle");

    mockAppLock.mockReturnValue(makeAppLockReturn({ state: "setup" }));
    rerender(
      <AppLockProvider>
        <Consumer />
      </AppLockProvider>,
    );
    expect(screen.getByTestId("state").textContent).toBe("setup");
  });
});
