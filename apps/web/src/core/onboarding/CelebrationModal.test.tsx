// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { CelebrationModal } from "./CelebrationModal";

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

describe("CelebrationModal — celebration_shown payload (PR-A)", () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.mocked(trackEvent).mockClear();
  });

  it("includes tipVariant + ctaLabel for every dashboard module id", () => {
    const moduleIds = ["finyk", "fizruk", "routine", "nutrition"] as const;
    for (const moduleId of moduleIds) {
      vi.mocked(trackEvent).mockClear();
      render(
        <CelebrationModal
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
      // Stronger structural assertion — copy must be non-empty.
      const [, payload] = vi.mocked(trackEvent).mock.calls[0]!;
      const typed = payload as { tipVariant: string; ctaLabel: string };
      expect(typed.tipVariant.length).toBeGreaterThan(0);
      expect(typed.ctaLabel.length).toBeGreaterThan(0);
      cleanup();
    }
  });

  it("falls back gracefully when moduleId is null (default copy)", () => {
    render(
      <CelebrationModal open onClose={() => {}} ttvMs={null} moduleId={null} />,
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
