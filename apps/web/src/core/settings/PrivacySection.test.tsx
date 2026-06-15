/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

import type { UserPreferences } from "@shared/api";
import type { UseAppLockReturn } from "../security/useAppLock";

// --- Mocks -----------------------------------------------------------------
//
// The point of this suite is to lock in the audit-F16 fix: PrivacySection
// must drive PIN state through the *user-scoped* `useAppLockContext` helpers
// (`hasPin` / `disablePin`), never the bare `lockStorage` functions that
// default to the `anon` partition. We therefore stub the context and assert
// the right closures are invoked.

const appLock: UseAppLockReturn = {
  state: "idle",
  startSetup: vi.fn(),
  startChange: vi.fn(),
  unlock: vi.fn().mockResolvedValue(true),
  finishSetup: vi.fn(),
  lock: vi.fn(),
  savePin: vi.fn().mockResolvedValue(undefined),
  hasPin: vi.fn().mockResolvedValue(false),
  disablePin: vi.fn().mockResolvedValue(undefined),
};
vi.mock("../security/AppLockContext", () => ({
  useAppLockContext: () => appLock,
}));

const { mockUseFlag, mockSetFlag } = vi.hoisted(() => ({
  mockUseFlag: vi.fn().mockReturnValue(false),
  mockSetFlag: vi.fn(),
}));
vi.mock("../lib/featureFlags", () => ({
  useFlag: mockUseFlag,
  setFlag: mockSetFlag,
}));

vi.mock("@shared/api", () => {
  // Inlined inside the factory — `vi.mock` is hoisted above module-level
  // consts, so referencing `DEFAULT_PREFS` here would hit a TDZ error.
  const prefs: UserPreferences = {
    analytics: true,
    aiMemory: true,
    pushNotifications: false,
    updatedAt: null,
  };
  return {
    meApi: {
      getPreferences: vi.fn().mockResolvedValue(prefs),
      updatePreferences: vi.fn().mockResolvedValue(prefs),
    },
  };
});

// LegalLinks pulls in router-aware navigation we don't exercise here.
vi.mock("../legal/LegalLinks", () => ({
  LegalLinks: () => null,
}));

import { PrivacySection } from "./PrivacySection";

async function openSection() {
  const trigger = await screen.findByRole("button", {
    name: /Конфіденційність/i,
  });
  fireEvent.click(trigger);
}

describe("PrivacySection — audit F16 (per-user PIN scoping)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseFlag.mockReturnValue(false);
    appLock.hasPin = vi.fn().mockResolvedValue(false);
    appLock.disablePin = vi.fn().mockResolvedValue(undefined);
    appLock.startSetup = vi.fn();
  });

  afterEach(() => {
    cleanup();
  });

  it("enabling the lock checks the user-scoped partition (appLock.hasPin), not anon", async () => {
    render(<PrivacySection />);
    await openSection();

    const toggle = screen.getByRole("switch", { name: /Блокування додатку/i });
    fireEvent.click(toggle);

    // hasPin() (scoped to user?.id) drives the setup decision — and with no
    // PIN on file the setup flow opens.
    await waitFor(() => expect(appLock.hasPin).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(appLock.startSetup).toHaveBeenCalledTimes(1));
    expect(mockSetFlag).toHaveBeenCalledWith("app-lock-enabled", true);
  });

  it("does NOT open setup when the signed-in user already has a PIN", async () => {
    appLock.hasPin = vi.fn().mockResolvedValue(true);
    render(<PrivacySection />);
    await openSection();

    fireEvent.click(
      screen.getByRole("switch", { name: /Блокування додатку/i }),
    );

    await waitFor(() => expect(appLock.hasPin).toHaveBeenCalledTimes(1));
    expect(appLock.startSetup).not.toHaveBeenCalled();
  });

  it("disabling the lock clears the user-scoped credential (appLock.disablePin)", async () => {
    // Flag already on → the toggle renders checked; clicking it disables.
    mockUseFlag.mockReturnValue(true);
    render(<PrivacySection />);
    await openSection();

    fireEvent.click(
      screen.getByRole("switch", { name: /Блокування додатку/i }),
    );

    // Confirm the destructive action in the modal.
    const confirm = await screen.findByRole("button", { name: "Вимкнути" });
    fireEvent.click(confirm);

    await waitFor(() => expect(appLock.disablePin).toHaveBeenCalledTimes(1));
    expect(mockSetFlag).toHaveBeenCalledWith("app-lock-enabled", false);
  });
});
