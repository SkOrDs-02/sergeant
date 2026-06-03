// @vitest-environment jsdom
/**
 * Tests for dashboardCards same-tab storage-refresh (audit-02 F3 / F10).
 *
 * Verifies that `MotivationalFooter` and `StreakIndicator` re-read from
 * storage and update their output when the `hubBus "storageUpdated"` signal
 * fires (same-tab path) after new entries are written to localStorage.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { emitHubBus, __resetHubBusForTests } from "@shared/lib/modules/hubBus";
import { MotivationalFooter, StreakIndicator } from "./dashboardCards";
import { STORAGE_KEYS } from "@sergeant/shared";

beforeEach(() => {
  localStorage.clear();
  __resetHubBusForTests();
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  __resetHubBusForTests();
});

describe("MotivationalFooter — same-tab storage refresh (F10)", () => {
  it("renders null when localStorage is empty", () => {
    const { container } = render(<MotivationalFooter />);
    expect(container.firstChild).toBeNull();
  });

  it("shows entry count when LS already has a real entry on mount", () => {
    // Seed a real (non-demo) fizruk workout before mount.
    localStorage.setItem(
      "fizruk_workouts_v1",
      JSON.stringify([{ id: "w1", startedAt: "2026-06-01T10:00:00.000Z" }]),
    );

    render(<MotivationalFooter />);

    expect(screen.getByText("Вже 1 запис — продовжуй!")).toBeInTheDocument();
  });

  it("re-counts after storageUpdated signal fires with new LS data", () => {
    // Start with one workout so MotivationalFooter renders (entryCount=1).
    localStorage.setItem(
      "fizruk_workouts_v1",
      JSON.stringify([{ id: "w1", startedAt: "2026-06-01T10:00:00.000Z" }]),
    );

    render(<MotivationalFooter />);
    expect(screen.getByText("Вже 1 запис — продовжуй!")).toBeInTheDocument();

    // Add a second workout directly to LS (simulating a same-tab write),
    // then fire the storageUpdated signal.
    act(() => {
      localStorage.setItem(
        "fizruk_workouts_v1",
        JSON.stringify([
          { id: "w1", startedAt: "2026-06-01T10:00:00.000Z" },
          { id: "w2", startedAt: "2026-06-02T10:00:00.000Z" },
        ]),
      );
      emitHubBus("storageUpdated", undefined);
    });

    expect(screen.getByText("Вже 2 записів — продовжуй!")).toBeInTheDocument();
  });

  it("re-counts after native window storage event fires (cross-tab path)", () => {
    localStorage.setItem(
      "fizruk_workouts_v1",
      JSON.stringify([{ id: "w1", startedAt: "2026-06-01T10:00:00.000Z" }]),
    );

    render(<MotivationalFooter />);
    expect(screen.getByText("Вже 1 запис — продовжуй!")).toBeInTheDocument();

    act(() => {
      localStorage.setItem(
        "fizruk_workouts_v1",
        JSON.stringify([
          { id: "w1", startedAt: "2026-06-01T10:00:00.000Z" },
          { id: "w2", startedAt: "2026-06-02T10:00:00.000Z" },
        ]),
      );
      // Simulate cross-tab write via native storage event.
      window.dispatchEvent(
        new StorageEvent("storage", { key: "fizruk_workouts_v1" }),
      );
    });

    expect(screen.getByText("Вже 2 записів — продовжуй!")).toBeInTheDocument();
  });
});

describe("StreakIndicator — same-tab storage refresh (F10)", () => {
  it("renders null when no streak data in LS", () => {
    const { container } = render(<StreakIndicator />);
    expect(container.firstChild).toBeNull();
  });

  it("shows streak badge when quick-stats have streak ≥ 2", () => {
    localStorage.setItem(
      STORAGE_KEYS.ROUTINE_QUICK_STATS,
      JSON.stringify({ streak: 5 }),
    );

    render(<StreakIndicator />);

    // StreakBadge renders the streak count; just verify something is rendered.
    expect(document.body.textContent).toContain("5");
  });

  it("re-reads streak after storageUpdated signal fires with updated LS data", () => {
    localStorage.setItem(
      STORAGE_KEYS.ROUTINE_QUICK_STATS,
      JSON.stringify({ streak: 5 }),
    );

    render(<StreakIndicator />);
    expect(document.body.textContent).toContain("5");

    act(() => {
      localStorage.setItem(
        STORAGE_KEYS.ROUTINE_QUICK_STATS,
        JSON.stringify({ streak: 7 }),
      );
      emitHubBus("storageUpdated", undefined);
    });

    expect(document.body.textContent).toContain("7");
  });
});
