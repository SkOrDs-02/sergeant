// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { getFirstEntryCelebrationCopy } from "@sergeant/shared";
import { FirstEntryCelebrationModal } from "./FirstEntryCelebrationModal";

const { hapticTapMock } = vi.hoisted(() => ({
  hapticTapMock: vi.fn(),
}));

vi.mock("@shared/lib/adapters/haptic", () => ({
  hapticTap: hapticTapMock,
}));

// Stub the analytics sink so the assertion is deterministic — the real
// impl fan-outs to console + PostHog + AI-memory mirror. We only care
// that the `celebration_shown` payload contains the new copy fields
// (`tipVariant` + `ctaLabel`) so the dashboard catches silent-copy
// regression (FTUX roast §2.9 → pr-plan-ftux PR-A).
vi.mock("../observability/analytics", async () => {
  const actual = await vi.importActual<
    typeof import("../observability/analytics")
  >("../observability/analytics");
  return {
    ...actual,
    trackEvent: vi.fn(),
  };
});

import { trackEvent, ANALYTICS_EVENTS } from "../observability/analytics";

function renderOpenModal(
  props: Partial<Parameters<typeof FirstEntryCelebrationModal>[0]> = {},
) {
  const onClose = props.onClose ?? vi.fn();
  const view = render(
    <FirstEntryCelebrationModal
      open={false}
      onClose={onClose}
      ttvMs={null}
      moduleId={null}
      {...props}
    />,
  );
  view.rerender(
    <FirstEntryCelebrationModal
      open
      onClose={onClose}
      ttvMs={props.ttvMs ?? null}
      moduleId={props.moduleId ?? null}
    />,
  );
  return { onClose, ...view };
}

describe("FirstEntryCelebrationModal — celebration_shown payload (PR-A)", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  beforeEach(() => {
    vi.mocked(trackEvent).mockClear();
    hapticTapMock.mockClear();
    vi.useFakeTimers();
    Object.defineProperty(navigator, "vibrate", {
      configurable: true,
      value: vi.fn(),
      writable: true,
    });
  });

  it("includes tipVariant + ctaLabel for every dashboard module id", () => {
    const moduleIds = ["finyk", "fizruk", "routine", "nutrition"] as const;
    for (const moduleId of moduleIds) {
      vi.mocked(trackEvent).mockClear();
      render(
        <FirstEntryCelebrationModal
          open
          onClose={() => {}}
          ttvMs={42_000}
          moduleId={moduleId}
        />,
      );
      expect(trackEvent).toHaveBeenCalledWith(
        ANALYTICS_EVENTS.CELEBRATION_SHOWN,
        expect.objectContaining({
          ttvMs: 42_000,
          source: "first_entry",
          moduleId,
          tipVariant: expect.any(String),
          ctaLabel: expect.any(String),
        }),
      );
      const [, payload] = vi.mocked(trackEvent).mock.calls[0]!;
      const typed = payload as { tipVariant: string; ctaLabel: string };
      expect(typed.tipVariant.length).toBeGreaterThan(0);
      expect(typed.ctaLabel.length).toBeGreaterThan(0);
      cleanup();
    }
  });

  it("falls back gracefully when moduleId is null (default copy)", () => {
    render(
      <FirstEntryCelebrationModal
        open
        onClose={() => {}}
        ttvMs={null}
        moduleId={null}
      />,
    );
    expect(trackEvent).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.CELEBRATION_SHOWN,
      expect.objectContaining({
        ttvMs: null,
        source: "first_entry",
        moduleId: null,
        tipVariant: expect.any(String),
        ctaLabel: expect.any(String),
      }),
    );
  });
});

describe("FirstEntryCelebrationModal — interaction branches", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  beforeEach(() => {
    hapticTapMock.mockClear();
    vi.useFakeTimers();
    Object.defineProperty(navigator, "vibrate", {
      configurable: true,
      value: vi.fn(),
      writable: true,
    });
  });

  it("returns null while closed and mounts the dialog when open flips true", () => {
    const { rerender } = render(
      <FirstEntryCelebrationModal
        open={false}
        onClose={() => {}}
        ttvMs={null}
        moduleId={null}
      />,
    );
    expect(screen.queryByRole("dialog")).toBeNull();

    rerender(
      <FirstEntryCelebrationModal
        open
        onClose={() => {}}
        ttvMs={null}
        moduleId="finyk"
      />,
    );
    const { headline } = getFirstEntryCelebrationCopy("finyk");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(headline)).toBeInTheDocument();
  });

  it("closes via the primary CTA after the fade-out delay", () => {
    const onClose = vi.fn();
    const { primaryCtaLabel } = getFirstEntryCelebrationCopy("finyk");
    renderOpenModal({ onClose, ttvMs: 1000, moduleId: "finyk" });

    fireEvent.click(screen.getByRole("button", { name: primaryCtaLabel }));
    expect(hapticTapMock).toHaveBeenCalledTimes(1);
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes when Escape is pressed", () => {
    const onClose = vi.fn();
    renderOpenModal({ onClose, ttvMs: 1000, moduleId: "routine" });

    fireEvent.keyDown(window, { key: "Escape" });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("auto-dismisses after ten seconds", () => {
    const onClose = vi.fn();
    renderOpenModal({ onClose, ttvMs: 1000, moduleId: "nutrition" });

    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("triggers haptic feedback on open when vibrate is available", () => {
    renderOpenModal({ ttvMs: 500, moduleId: "fizruk" });
    expect(navigator.vibrate).toHaveBeenCalledWith([50, 30, 50]);
  });
});
