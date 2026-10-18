// @vitest-environment jsdom
/**
 * Tests for dashboardCards same-tab storage-refresh (audit-02 F3 / F10).
 *
 * Verifies that `StreakIndicator` re-reads from
 * storage and update their output when the `hubBus "storageUpdated"` signal
 * fires (same-tab path) after new entries are written to localStorage.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { emitHubBus, __resetHubBusForTests } from "@shared/lib/modules/hubBus";
import { StreakIndicator } from "./dashboardCards";
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

  // Бейдж підписаний «днів поспіль», а стрік Фізрука рахується в ТИЖНЯХ
  // (`computeWeeklyStreakWeeks`). Поки він потрапляв у той самий `Math.max`,
  // сім тижнів підряд ставали «7 днів поспіль» і в бейджі, і в
  // `streak_milestone_reached` (аудит L-8, 2026-08-07).
  it("не бере тижневий стрік Фізрука у бейдж днів", () => {
    localStorage.setItem(
      STORAGE_KEYS.FIZRUK_QUICK_STATS,
      JSON.stringify({ streak: 9 }),
    );

    const { container } = render(<StreakIndicator />);

    expect(container.firstChild).toBeNull();
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
