// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { RestTimerOverlay } from "./RestTimerOverlay";

describe("RestTimerOverlay", () => {
  afterEach(cleanup);

  it("renders nothing when restTimer is null", () => {
    const { container } = render(
      <RestTimerOverlay restTimer={null} onCancel={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows countdown and calls onCancel", () => {
    const onCancel = vi.fn();
    render(
      <RestTimerOverlay
        restTimer={{ remaining: 45, total: 90 }}
        onCancel={onCancel}
      />,
    );

    expect(screen.getByRole("timer")).toHaveAttribute(
      "aria-label",
      "Таймер відпочинку",
    );
    expect(screen.getByText("00:45")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Пропустити/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  // A11y regression guard (fixed 2026-08-08): `role="timer"` used to pair
  // with `aria-live="polite"` and an `aria-label` embedding `remaining`,
  // so a screen reader re-announced the label every time the parent
  // re-rendered with a new `remaining` prop (i.e. every second for the
  // whole rest period). The accessible name must now stay identical
  // across ticks — only the milestone `announce()` calls (start/finish,
  // asserted via `useAnnounce`-backed integration coverage) carry the
  // countdown to screen-reader users.
  it("keeps a stable aria-label across ticking `remaining` — no per-second chatter", () => {
    const { rerender } = render(
      <RestTimerOverlay
        restTimer={{ remaining: 45, total: 90 }}
        onCancel={vi.fn()}
      />,
    );
    const stableLabel = screen.getByRole("timer").getAttribute("aria-label");

    for (const remaining of [44, 43, 42, 41]) {
      rerender(
        <RestTimerOverlay
          restTimer={{ remaining, total: 90 }}
          onCancel={vi.fn()}
        />,
      );
      expect(screen.getByRole("timer").getAttribute("aria-label")).toBe(
        stableLabel,
      );
    }
    expect(screen.getByRole("timer")).not.toHaveAttribute("aria-live");
  });

  it("offers ±15/30 second adjustments", () => {
    const onAdjust = vi.fn();
    render(
      <RestTimerOverlay
        restTimer={{ remaining: 45, total: 90 }}
        onCancel={vi.fn()}
        onAdjust={onAdjust}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Додати 15 секунд" }));
    fireEvent.click(screen.getByRole("button", { name: "Відняти 30 секунд" }));
    expect(onAdjust).toHaveBeenNthCalledWith(1, 15);
    expect(onAdjust).toHaveBeenNthCalledWith(2, -30);
  });

  it("applies urgent styling when remaining is 10 seconds or less", () => {
    render(
      <RestTimerOverlay
        restTimer={{ remaining: 8, total: 60 }}
        onCancel={vi.fn()}
      />,
    );

    const panel = screen.getByRole("timer").closest(".fizruk-sheet");
    expect(panel).toHaveClass("border-warning/60");
  });

  // Responsive-pill fix (fixed 2026-08-08, live-measured 390×844): all 6
  // controls (dial+digits, ±30, ±15, skip) overflowed the pill on phone
  // widths, and — because nothing in the dial+digits flex item truncates
  // — the digits visually bled into the "−30" button. ±30 is now hidden
  // below the `sm` breakpoint (Tailwind default 640px), leaving ±15 +
  // skip, which fit comfortably on every phone width; ±30 returns at
  // `sm:` and up so desktop keeps the full control set.
  it("hides ±30 (but not ±15/skip) via the `hidden sm:inline-block` responsive pair", () => {
    render(
      <RestTimerOverlay
        restTimer={{ remaining: 45, total: 90 }}
        onCancel={vi.fn()}
        onAdjust={vi.fn()}
      />,
    );

    const minus30 = screen.getByRole("button", { name: "Відняти 30 секунд" });
    const plus30 = screen.getByRole("button", { name: "Додати 30 секунд" });
    expect(minus30.className).toMatch(/\bhidden\b/);
    expect(minus30.className).toMatch(/\bsm:inline-block\b/);
    expect(plus30.className).toMatch(/\bhidden\b/);
    expect(plus30.className).toMatch(/\bsm:inline-block\b/);

    const minus15 = screen.getByRole("button", { name: "Відняти 15 секунд" });
    const plus15 = screen.getByRole("button", { name: "Додати 15 секунд" });
    expect(minus15.className).not.toMatch(/\bhidden\b/);
    expect(plus15.className).not.toMatch(/\bhidden\b/);
    expect(
      screen.getByRole("button", { name: /Пропустити/i }).className,
    ).not.toMatch(/\bhidden\b/);

    // Touch targets stay ≥44px regardless of visibility breakpoint.
    for (const btn of [minus30, plus30, minus15, plus15]) {
      expect(btn.className).toMatch(/min-h-\[44px\]/);
      expect(btn.className).toMatch(/min-w-\[44px\]/);
    }
  });
});
