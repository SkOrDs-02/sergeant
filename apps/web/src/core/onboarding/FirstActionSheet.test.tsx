// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FirstActionHeroCard } from "./FirstActionSheet";
import { ANALYTICS_EVENTS, trackEvent } from "../observability/analytics";

vi.mock("../observability/analytics", async () => {
  const actual = await vi.importActual<
    typeof import("../observability/analytics")
  >("../observability/analytics");
  return {
    ...actual,
    trackEvent: vi.fn(),
  };
});

const VIBE_PICKS_KEY = "hub_onboarding_vibes_v1";

describe("FirstActionHeroCard", () => {
  afterEach(cleanup);

  beforeEach(() => {
    localStorage.clear();
    vi.mocked(trackEvent).mockClear();
  });

  it("asks the user to choose when no modules were picked", () => {
    render(<FirstActionHeroCard />);

    expect(screen.getByText("З чого хочеш почати?")).toBeInTheDocument();
    expect(
      screen.getByText(/Routine не відкриється автоматично/),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Рутина/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Фінік/ })).toBeInTheDocument();
    expect(
      vi
        .mocked(trackEvent)
        .mock.calls.some(
          ([event]) => event === ANALYTICS_EVENTS.ONBOARDING_FIRST_ACTION_SHOWN,
        ),
    ).toBe(false);
  });

  it("keeps picked modules equal when several modules were picked", () => {
    localStorage.setItem(VIBE_PICKS_KEY, JSON.stringify(["routine", "finyk"]));

    render(<FirstActionHeroCard />);

    expect(screen.getByText("З чого хочеш почати?")).toBeInTheDocument();
    expect(screen.getByText(/без прихованого пріоритету/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Фінік/ })).toBeInTheDocument();
  });
});
