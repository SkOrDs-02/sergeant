// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import { DailyNudge } from "./DailyNudge";
import { ANALYTICS_EVENTS } from "../observability/analytics";
import type { NudgeDefinition } from "@sergeant/shared";

const trackEventMock = vi.fn();

vi.mock("../observability/analytics", async () => {
  const actual = await vi.importActual<
    typeof import("../observability/analytics")
  >("../observability/analytics");
  return {
    ...actual,
    trackEvent: (...args: unknown[]) => trackEventMock(...args),
  };
});

const NUDGE: NudgeDefinition = {
  id: "day3_chat",
  day: 3,
  message: "3 дні з Sergeant! Спробуй AI-чат для плану на день.",
};

describe("DailyNudge — single-primary affordance (S6.7 audit-guard)", () => {
  // The repo's vitest setup does not auto-cleanup RTL renders.
  afterEach(cleanup);

  beforeEach(() => {
    localStorage.clear();
    trackEventMock.mockReset();
  });

  it("renders exactly one primary CTA — not 3 buttons at the same rank", () => {
    render(
      <DailyNudge
        nudge={NUDGE}
        sessionDays={3}
        onDismiss={() => {}}
        onAction={() => {}}
      />,
    );
    // The OLD shape had 3 in-row affordances at the same rank:
    // "Спробувати" / "Зрозуміло" / "Нагадай за тиждень".
    // After S6.7 only the primary is in-row; the rest live behind "…".
    expect(screen.queryByRole("button", { name: /^Спробувати$/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Зрозуміло$/ })).toBeNull();
    // The snooze affordance is hidden until the overflow menu opens.
    expect(
      screen.queryByRole("menuitem", { name: /^Нагадай за тиждень$/ }),
    ).toBeNull();
  });

  it("exposes a dismiss-X with an explicit «Закрити» a11y name", () => {
    render(<DailyNudge nudge={NUDGE} sessionDays={3} onDismiss={() => {}} />);
    // Audit-guard: the corner X must be a *dismiss*, not a "snooze for N days"
    // — the previous implementation labelled it «Сховати на 7 днів» which
    // overloaded one slot with two distinct semantics.
    expect(screen.getByRole("button", { name: /^Закрити$/ })).toBeTruthy();
    expect(document.body.textContent ?? "").not.toMatch(/Сховати на \d+ днів/);
  });

  it("hides the snooze affordance behind an «Інші дії» overflow menu", () => {
    render(<DailyNudge nudge={NUDGE} sessionDays={3} onDismiss={() => {}} />);
    const trigger = screen.getByLabelText("Інші дії");
    expect(trigger).toBeTruthy();
    // Closed by default — snooze menuitem is not in the DOM.
    expect(
      screen.queryByRole("menuitem", { name: /^Нагадай за тиждень$/ }),
    ).toBeNull();
    fireEvent.click(trigger);
    // Open — snooze menuitem is now reachable.
    expect(
      screen.getByRole("menuitem", { name: /^Нагадай за тиждень$/ }),
    ).toBeTruthy();
  });

  it("emits a unified `daily_nudge_action` event with a typed discriminator", async () => {
    const onDismiss = vi.fn();
    const onAction = vi.fn();
    render(
      <DailyNudge
        nudge={NUDGE}
        sessionDays={3}
        onDismiss={onDismiss}
        onAction={onAction}
      />,
    );

    // Impression event always fires once.
    expect(trackEventMock).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.DAILY_NUDGE_SHOWN,
      { day: 3, nudgeId: "day3_chat" },
    );

    // 1. primary
    fireEvent.click(screen.getByRole("button", { name: /^Спробувати$/ }));
    expect(trackEventMock).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.DAILY_NUDGE_ACTION,
      { day: 3, nudgeId: "day3_chat", type: "primary" },
    );
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);

    cleanup();
    trackEventMock.mockReset();
    onDismiss.mockReset();

    // 2. dismiss
    render(<DailyNudge nudge={NUDGE} sessionDays={3} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByRole("button", { name: /^Закрити$/ }));
    expect(trackEventMock).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.DAILY_NUDGE_ACTION,
      { day: 3, nudgeId: "day3_chat", type: "dismiss" },
    );
    expect(onDismiss).toHaveBeenCalledTimes(1);

    cleanup();
    trackEventMock.mockReset();
    onDismiss.mockReset();

    // 3. snooze (via overflow)
    render(<DailyNudge nudge={NUDGE} sessionDays={3} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByLabelText("Інші дії"));
    await waitFor(() =>
      expect(
        screen.getByRole("menuitem", { name: /^Нагадай за тиждень$/ }),
      ).toBeTruthy(),
    );
    fireEvent.click(
      screen.getByRole("menuitem", { name: /^Нагадай за тиждень$/ }),
    );
    expect(trackEventMock).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.DAILY_NUDGE_ACTION,
      { day: 3, nudgeId: "day3_chat", type: "snooze", snoozeDays: 7 },
    );
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("audit-guard: forbids the legacy granular event names", () => {
    // Once consolidated to `daily_nudge_action`, the granular events must not
    // come back — they make analytics dashboards ambiguous (was a snooze a
    // dismiss? was a primary a click?).
    expect(ANALYTICS_EVENTS).not.toHaveProperty("DAILY_NUDGE_CLICKED");
    expect(ANALYTICS_EVENTS).not.toHaveProperty("DAILY_NUDGE_DISMISSED");
    const events = Object.values(ANALYTICS_EVENTS);
    expect(events).not.toContain("daily_nudge_clicked");
    expect(events).not.toContain("daily_nudge_dismissed");
  });
});
