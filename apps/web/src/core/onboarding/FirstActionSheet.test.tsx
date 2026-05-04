// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { FirstActionHeroCard } from "./FirstActionSheet";

// Stub the analytics sink so we can assert on `via`. The real impl
// fires console + posthog, neither of which is interesting to this
// component-level test.
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

const VIBE_PICKS_KEY = "hub_onboarding_vibes_v1";

describe("FirstActionHeroCard — inline chips (S2.3)", () => {
  // The repo's vitest setup does not auto-cleanup RTL renders.
  afterEach(cleanup);

  beforeEach(() => {
    localStorage.clear();
    vi.mocked(trackEvent).mockClear();
  });

  it("renders chip-row labels for non-primary picks", () => {
    // PRIORITY = ["routine", "finyk", "nutrition", "fizruk"], so with all
    // four picked the primary is `routine` and the chips cover the rest.
    localStorage.setItem(
      VIBE_PICKS_KEY,
      JSON.stringify(["routine", "finyk", "nutrition", "fizruk"]),
    );
    render(<FirstActionHeroCard />);

    // The legacy «Інший модуль» accordion is gone.
    expect(screen.queryByText(/Інший модуль/)).not.toBeInTheDocument();

    // Primary card surfaces the routine title.
    expect(screen.getByText("Створи першу звичку")).toBeInTheDocument();

    // Chip row exposes the three non-primary modules by their short
    // labels (icon-only would be ambiguous).
    expect(screen.getByRole("button", { name: /Фінік/ })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Харчування/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Фізрук/ })).toBeInTheDocument();
  });

  it('tracks chip taps with via="chip" so dashboards can compute switch-rate', () => {
    localStorage.setItem(VIBE_PICKS_KEY, JSON.stringify(["routine", "finyk"]));
    render(<FirstActionHeroCard />);

    fireEvent.click(screen.getByRole("button", { name: /Фінік/ }));

    const calls = vi
      .mocked(trackEvent)
      .mock.calls.filter(
        ([event]) => event === ANALYTICS_EVENTS.ONBOARDING_FIRST_ACTION_PICKED,
      );
    expect(calls).toHaveLength(1);
    expect(calls[0][1]).toMatchObject({
      module: "finyk",
      primary: "routine",
      via: "chip",
    });
  });

  it('tracks primary-card taps with via="primary"', () => {
    localStorage.setItem(VIBE_PICKS_KEY, JSON.stringify(["routine", "finyk"]));
    render(<FirstActionHeroCard />);

    // The primary CTA is the only button carrying the routine title.
    fireEvent.click(screen.getByText("Створи першу звичку"));

    const calls = vi
      .mocked(trackEvent)
      .mock.calls.filter(
        ([event]) => event === ANALYTICS_EVENTS.ONBOARDING_FIRST_ACTION_PICKED,
      );
    expect(calls).toHaveLength(1);
    expect(calls[0][1]).toMatchObject({
      module: "routine",
      primary: "routine",
      via: "primary",
    });
  });

  it("hides the chip row when only one module is picked", () => {
    localStorage.setItem(VIBE_PICKS_KEY, JSON.stringify(["routine"]));
    render(<FirstActionHeroCard />);
    expect(screen.queryByRole("group", { name: /Інший модуль/ })).toBeNull();
    expect(
      screen.queryByRole("button", { name: /Фінік/ }),
    ).not.toBeInTheDocument();
  });
});
