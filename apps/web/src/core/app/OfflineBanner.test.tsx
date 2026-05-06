/** @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, cleanup, act } from "@testing-library/react";

// Mock the two hooks. The component is small and self-contained, so
// driving the hook return values directly is simpler — and keeps the
// test stable against changes in the cloudSync engine.
const onlineRef: { value: boolean } = { value: true };
const retrySyncV2DeadLetters = vi.fn();
const syncStatusRef: {
  dirtyCount: number;
  queuedCount: number;
  syncV2DeadLetterCount: number;
  retrySyncV2DeadLetters: () => Promise<void>;
} = {
  dirtyCount: 0,
  queuedCount: 0,
  syncV2DeadLetterCount: 0,
  retrySyncV2DeadLetters,
};

vi.mock("@shared/hooks/useOnlineStatus", () => ({
  useOnlineStatus: () => onlineRef.value,
}));

vi.mock("../cloudSync/useCloudSync", () => ({
  useSyncStatus: () => ({ ...syncStatusRef, isOnline: onlineRef.value }),
}));

import { OfflineBanner } from "./OfflineBanner";

beforeEach(() => {
  onlineRef.value = true;
  syncStatusRef.dirtyCount = 0;
  syncStatusRef.queuedCount = 0;
  syncStatusRef.syncV2DeadLetterCount = 0;
  retrySyncV2DeadLetters.mockReset();
});
afterEach(cleanup);

describe("OfflineBanner", () => {
  it("renders nothing when online and nothing pending (happy path)", () => {
    onlineRef.value = true;
    syncStatusRef.dirtyCount = 0;
    syncStatusRef.queuedCount = 0;
    const { queryByTestId } = render(<OfflineBanner />);
    expect(queryByTestId("offline-banner")).toBeNull();
  });

  it("renders an 'offline' pill with role=status when offline", () => {
    onlineRef.value = false;
    const { getByTestId } = render(<OfflineBanner />);
    const pill = getByTestId("offline-banner");
    expect(pill.getAttribute("data-state")).toBe("offline");
    expect(pill.getAttribute("role")).toBe("status");
    expect(pill.getAttribute("aria-live")).toBe("polite");
    expect(pill.textContent).toContain("Офлайн");
    // No queue — should not include a count.
    expect(pill.textContent).not.toContain("·");
  });

  it("includes the queue count in the offline label when items are pending", () => {
    onlineRef.value = false;
    syncStatusRef.queuedCount = 3;
    const { getByTestId } = render(<OfflineBanner />);
    const pill = getByTestId("offline-banner");
    expect(pill.getAttribute("data-state")).toBe("offline");
    expect(pill.textContent).toContain("Офлайн");
    expect(pill.textContent).toContain("3");
    expect(pill.textContent).toContain("в черзі");
  });

  it("renders a 'syncing' pill when online with pending changes", () => {
    onlineRef.value = true;
    // Take the max of dirty/queued — exercise the dirty branch too.
    syncStatusRef.dirtyCount = 5;
    syncStatusRef.queuedCount = 2;
    const { getByTestId } = render(<OfflineBanner />);
    const pill = getByTestId("offline-banner");
    expect(pill.getAttribute("data-state")).toBe("syncing");
    expect(pill.getAttribute("role")).toBe("status");
    expect(pill.textContent).toContain("Синхронізація");
    expect(pill.textContent).toContain("5");
    expect(pill.textContent).toContain("в черзі");
  });

  it("transitions cleanly between states on rerender", () => {
    onlineRef.value = false;
    const { queryByTestId, rerender } = render(<OfflineBanner />);
    expect(queryByTestId("offline-banner")?.getAttribute("data-state")).toBe(
      "offline",
    );

    // Reconnect, but with pending queue.
    act(() => {
      onlineRef.value = true;
      syncStatusRef.queuedCount = 1;
    });
    rerender(<OfflineBanner />);
    expect(queryByTestId("offline-banner")?.getAttribute("data-state")).toBe(
      "syncing",
    );

    // Queue drains.
    act(() => {
      syncStatusRef.queuedCount = 0;
    });
    rerender(<OfflineBanner />);
    expect(queryByTestId("offline-banner")).toBeNull();
  });

  it("shows a retry action when sync v2 has dead-letter rows", async () => {
    onlineRef.value = true;
    syncStatusRef.syncV2DeadLetterCount = 3;
    const { getByRole, getByTestId } = render(<OfflineBanner />);

    const pill = getByTestId("offline-banner");
    expect(pill.getAttribute("data-state")).toBe("blocked");
    expect(pill.textContent).toContain("3");
    // The pill must be UA-only (no English fallback strings).
    expect(pill.textContent).toContain("помилки синхронізації");
    expect(pill.textContent).not.toMatch(/blocked/i);

    await act(async () => {
      getByRole("button", { name: /Повторити/i }).click();
    });

    expect(retrySyncV2DeadLetters).toHaveBeenCalledTimes(1);
  });
});
