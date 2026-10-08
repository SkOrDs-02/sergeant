/** @vitest-environment jsdom */
/**
 * Реконсиляційний ефект `AppLockSettings` (директиву `exhaustive-deps` знято
 * 2026-10): контекст повертає НОВИЙ обʼєкт щорендера, але `state`/`hasPin`
 * стабільні, тож `hasPin()` має викликатись рівно раз, а не щорендера.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

import type { UseAppLockReturn } from "./useAppLock";

const hasPin = vi.hoisted(() => vi.fn().mockResolvedValue(true));
vi.mock("./AppLockContext", () => ({
  useAppLockContext: (): UseAppLockReturn => ({
    state: "idle",
    startSetup: vi.fn(),
    startChange: vi.fn(),
    unlock: vi.fn(),
    finishSetup: vi.fn(),
    lock: vi.fn(),
    savePin: vi.fn(),
    hasPin,
    disablePin: vi.fn(),
  }),
}));
vi.mock("../lib/featureFlags", () => ({
  useFlag: () => true,
  setFlag: vi.fn(),
}));

import { AppLockSettings } from "./AppLockSettings";

afterEach(() => {
  cleanup();
  hasPin.mockClear();
});

describe("AppLockSettings — reconcile effect", () => {
  it("не ганяє hasPin() на ре-рендерах із новим обʼєктом контексту", () => {
    const { rerender } = render(<AppLockSettings />);
    expect(hasPin).toHaveBeenCalledTimes(1);
    rerender(<AppLockSettings />);
    rerender(<AppLockSettings />);
    expect(hasPin).toHaveBeenCalledTimes(1);
  });
});
