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
  hapticPattern: vi.fn(),
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

describe("FirstEntryCelebrationModal: celebration_shown payload (PR-A)", () => {
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

describe("FirstEntryCelebrationModal: interaction branches", () => {
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

  it("returns null while closed and mounts a polite status when open flips true", () => {
    const { rerender } = render(
      <FirstEntryCelebrationModal
        open={false}
        onClose={() => {}}
        ttvMs={null}
        moduleId={null}
      />,
    );
    expect(screen.queryByRole("status")).toBeNull();

    rerender(
      <FirstEntryCelebrationModal
        open
        onClose={() => {}}
        ttvMs={null}
        moduleId="finyk"
      />,
    );
    const { headline } = getFirstEntryCelebrationCopy("finyk");
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByText(headline)).toBeInTheDocument();
  });

  it("closes immediately from the unobtrusive close control", () => {
    const onClose = vi.fn();
    const view = renderOpenModal({ onClose, ttvMs: 1000, moduleId: "finyk" });

    fireEvent.click(screen.getByRole("button", { name: "Закрити" }));
    expect(onClose).toHaveBeenCalledTimes(1);

    // Компонент став повністю керованим поставкою 2f0c49a: внутрішні
    // `visible`/`animateOut` прибрані, видимість тримає лише проп `open`.
    // Тому клік сам собою нічого не ховає — ховає батько, і перевіряти
    // треба саме це, а не зникнення одразу після кліку.
    expect(screen.getByRole("status")).toBeInTheDocument();
    view.rerender(
      <FirstEntryCelebrationModal
        open={false}
        onClose={onClose}
        ttvMs={1000}
        moduleId="finyk"
      />,
    );
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("auto-dismisses after four seconds", () => {
    const onClose = vi.fn();
    renderOpenModal({ onClose, ttvMs: 1000, moduleId: "nutrition" });

    act(() => {
      vi.advanceTimersByTime(4_000);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("uses one short haptic tap when shown", () => {
    renderOpenModal({ ttvMs: 500, moduleId: "fizruk" });
    expect(hapticTapMock).toHaveBeenCalledTimes(1);
  });
});
