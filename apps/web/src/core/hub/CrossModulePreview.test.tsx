// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { ANALYTICS_EVENTS } from "@sergeant/shared";
import { CrossModulePreview } from "./CrossModulePreview";

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

describe("CrossModulePreview — single-primary affordance (S6.4 audit-guard)", () => {
  afterEach(cleanup);

  beforeEach(() => {
    trackEventMock.mockClear();
    localStorage.clear();
  });

  it("renders module-specific copy without falling back to a generic example", () => {
    render(<CrossModulePreview sourceModule="finyk" onClose={() => {}} />);
    // Body must contain the × pairing AND the forward-looking framing.
    const card = screen.getByLabelText("Що Sergeant покаже далі");
    expect(card.textContent ?? "").toMatch(/гроші\s*×\s*їжа/i);
    expect(card.textContent ?? "").toMatch(/коли додаси ще/i);
  });

  it("emits CROSS_MODULE_PREVIEW_SEEN exactly once on mount, with both modules in payload", () => {
    render(<CrossModulePreview sourceModule="routine" onClose={() => {}} />);
    const seenCalls = trackEventMock.mock.calls.filter(
      ([name]) => name === ANALYTICS_EVENTS.CROSS_MODULE_PREVIEW_SEEN,
    );
    expect(seenCalls.length).toBe(1);
    expect(seenCalls[0]?.[1]).toMatchObject({
      source_module: "routine",
      partner_module: "finyk",
    });
  });

  it("has exactly one primary CTA + dismiss-X — no third button", () => {
    render(<CrossModulePreview sourceModule="finyk" onClose={() => {}} />);
    const buttons = screen.getAllByRole("button");
    // Exactly two interactive surfaces: the dismiss-X and the «Зрозуміло» CTA.
    expect(buttons.length).toBe(2);
    expect(screen.getByRole("button", { name: "Зрозуміло" })).toBeTruthy();
    expect(screen.getByLabelText("Закрити підказку")).toBeTruthy();
  });

  it("CTA click marks seen, fires _CLICKED, and calls onClose", () => {
    const onClose = vi.fn();
    render(<CrossModulePreview sourceModule="fizruk" onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Зрозуміло" }));
    const clickedCalls = trackEventMock.mock.calls.filter(
      ([name]) => name === ANALYTICS_EVENTS.CROSS_MODULE_PREVIEW_CLICKED,
    );
    expect(clickedCalls.length).toBe(1);
    expect(clickedCalls[0]?.[1]).toMatchObject({ source_module: "fizruk" });
    expect(onClose).toHaveBeenCalledTimes(1);
    // Persistence flag — one-shot.
    expect(localStorage.getItem("hub_cross_module_preview_seen_v1")).toBe("1");
  });

  it("dismiss-X click marks seen, fires _DISMISSED (not _CLICKED), calls onClose", () => {
    const onClose = vi.fn();
    render(<CrossModulePreview sourceModule="nutrition" onClose={onClose} />);
    fireEvent.click(screen.getByLabelText("Закрити підказку"));
    const dismissedCalls = trackEventMock.mock.calls.filter(
      ([name]) => name === ANALYTICS_EVENTS.CROSS_MODULE_PREVIEW_DISMISSED,
    );
    const clickedCalls = trackEventMock.mock.calls.filter(
      ([name]) => name === ANALYTICS_EVENTS.CROSS_MODULE_PREVIEW_CLICKED,
    );
    expect(dismissedCalls.length).toBe(1);
    expect(clickedCalls.length).toBe(0);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem("hub_cross_module_preview_seen_v1")).toBe("1");
  });

  it("does not emit DISMISSED on initial mount (separation between SEEN and DISMISSED)", () => {
    render(<CrossModulePreview sourceModule="finyk" onClose={() => {}} />);
    const dismissedCalls = trackEventMock.mock.calls.filter(
      ([name]) => name === ANALYTICS_EVENTS.CROSS_MODULE_PREVIEW_DISMISSED,
    );
    expect(dismissedCalls.length).toBe(0);
  });
});
