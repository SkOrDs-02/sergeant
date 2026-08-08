// @vitest-environment jsdom
/**
 * Tests for CollapsibleTrendCard — the collapsible section card used on the
 * Body page. Covers initial collapsed/expanded state (from localStorage),
 * toggle on click, cross-tab sync via the storage event, delta colour
 * variants, and null/zero value rendering.
 */
import { describe, it, expect, afterEach } from "vitest";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  act,
} from "@testing-library/react";
import { MINUS_SIGN } from "@sergeant/shared";
import { flatText } from "@shared/testing/numberText";
import { CollapsibleTrendCard } from "./CollapsibleTrendCard";
import { TREND_STORAGE_PREFIX } from "./storage";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

function renderCard(
  overrides: Partial<React.ComponentProps<typeof CollapsibleTrendCard>> = {},
) {
  return render(
    <CollapsibleTrendCard
      storageKey="weight"
      title="Вага"
      latestValue={80}
      latestUnit="кг"
      delta={null}
      ariaLabel="Графік ваги"
      {...overrides}
    >
      <div data-testid="chart">chart content</div>
    </CollapsibleTrendCard>,
  );
}

describe("CollapsibleTrendCard — initial state", () => {
  it("starts collapsed by default when localStorage has no value", () => {
    renderCard();
    expect(screen.queryByTestId("chart")).not.toBeInTheDocument();
  });

  it("starts expanded when localStorage has '1' for the storage key", () => {
    localStorage.setItem(`${TREND_STORAGE_PREFIX}weight`, "1");
    renderCard();
    expect(screen.getByTestId("chart")).toBeInTheDocument();
  });

  it("renders the title", () => {
    renderCard();
    expect(screen.getByText("Вага")).toBeInTheDocument();
  });

  it("renders the latest value and unit", () => {
    renderCard();
    expect(flatText(screen.getByTestId("trend-latest-value"))).toBe("80 кг");
  });
});

describe("CollapsibleTrendCard — heading semantics (defect #2)", () => {
  // A heading nested INSIDE a native `<button>` loses its heading role for
  // most AT — the fix wraps the whole toggle button in `<h2>` instead
  // (WAI-ARIA disclosure/accordion pattern).
  it("exposes the title as an h2 heading, and the toggle stays a single button", () => {
    renderCard();
    expect(
      screen.getByRole("heading", { level: 2, name: /Вага/ }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });
});

describe("CollapsibleTrendCard — toggle", () => {
  it("expands on click and shows children", () => {
    renderCard();
    expect(screen.queryByTestId("chart")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByTestId("chart")).toBeInTheDocument();
  });

  it("collapses again on second click", () => {
    localStorage.setItem(`${TREND_STORAGE_PREFIX}weight`, "1");
    renderCard();
    expect(screen.getByTestId("chart")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button"));
    expect(screen.queryByTestId("chart")).not.toBeInTheDocument();
  });

  it("persists state to localStorage on toggle", () => {
    renderCard();
    fireEvent.click(screen.getByRole("button"));
    expect(localStorage.getItem(`${TREND_STORAGE_PREFIX}weight`)).toBe("1");
    fireEvent.click(screen.getByRole("button"));
    expect(localStorage.getItem(`${TREND_STORAGE_PREFIX}weight`)).toBe("0");
  });

  it("sets aria-expanded correctly", () => {
    renderCard();
    const btn = screen.getByRole("button");
    expect(btn).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(btn);
    expect(btn).toHaveAttribute("aria-expanded", "true");
  });
});

describe("CollapsibleTrendCard — cross-tab sync", () => {
  it("expands when another tab writes '1' to the storage key", () => {
    renderCard();
    expect(screen.queryByTestId("chart")).not.toBeInTheDocument();
    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: `${TREND_STORAGE_PREFIX}weight`,
          newValue: "1",
        }),
      );
    });
    expect(screen.getByTestId("chart")).toBeInTheDocument();
  });

  it("collapses when another tab writes '0' to the storage key", () => {
    localStorage.setItem(`${TREND_STORAGE_PREFIX}weight`, "1");
    renderCard();
    expect(screen.getByTestId("chart")).toBeInTheDocument();
    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: `${TREND_STORAGE_PREFIX}weight`,
          newValue: "0",
        }),
      );
    });
    expect(screen.queryByTestId("chart")).not.toBeInTheDocument();
  });

  it("ignores storage events for a different key", () => {
    renderCard();
    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: `${TREND_STORAGE_PREFIX}sleep`,
          newValue: "1",
        }),
      );
    });
    expect(screen.queryByTestId("chart")).not.toBeInTheDocument();
  });
});

describe("CollapsibleTrendCard — delta display", () => {
  // Defect #7: `delta.toFixed(1)` printed a decimal POINT in a
  // comma-locale UI ("+2.0 кг"). `Measure` formats via `uk-UA` and uses
  // the real minus glyph (U+2212, not a hyphen) for negative deltas.
  it("renders positive delta when delta > 0, locale-formatted with a comma", () => {
    renderCard({ delta: 1.2 });
    expect(flatText(screen.getByTestId("trend-delta"))).toBe("+1,2 кг");
  });

  it("renders negative delta when delta < 0, with the U+2212 minus glyph", () => {
    renderCard({ delta: -0.5 });
    expect(flatText(screen.getByTestId("trend-delta"))).toBe(
      `${MINUS_SIGN}0,5 кг`,
    );
  });

  it("hides delta when delta is null", () => {
    renderCard({ delta: null });
    expect(screen.queryByTestId("trend-delta")).not.toBeInTheDocument();
  });

  it("hides delta when delta is exactly 0", () => {
    renderCard({ delta: 0 });
    expect(screen.queryByTestId("trend-delta")).not.toBeInTheDocument();
  });
});

describe("CollapsibleTrendCard — deltaDirection", () => {
  // Regression coverage for the inverted-colour bug: rising sleep/energy/mood
  // used to render as `text-warning` (a "watch out" tone) even though more
  // is better for those metrics. `up-is-good` must flip that to success.
  it("defaults to down-is-good: a positive delta renders warning (weight-loss framing)", () => {
    renderCard({ delta: 1.2 });
    const label = screen.getByTestId("trend-delta");
    expect(label.className).toContain("text-warning-strong");
    expect(label.className).not.toContain("text-success-strong");
  });

  it("defaults to down-is-good: a negative delta renders success", () => {
    renderCard({ delta: -0.5 });
    const label = screen.getByTestId("trend-delta");
    expect(label.className).toContain("text-success-strong");
    expect(label.className).not.toContain("text-warning-strong");
  });

  it("up-is-good: a positive delta (more sleep) renders success, not warning", () => {
    renderCard({ delta: 1.2, deltaDirection: "up-is-good" });
    const label = screen.getByTestId("trend-delta");
    expect(label.className).toContain("text-success-strong");
    expect(label.className).not.toContain("text-warning-strong");
  });

  it("up-is-good: a negative delta (less sleep) renders warning, not success", () => {
    renderCard({ delta: -0.5, deltaDirection: "up-is-good" });
    const label = screen.getByTestId("trend-delta");
    expect(label.className).toContain("text-warning-strong");
    expect(label.className).not.toContain("text-success-strong");
  });

  it("neutral: neither positive nor negative delta uses success/warning colour", () => {
    const { rerender } = renderCard({ delta: 1.2, deltaDirection: "neutral" });
    let label = screen.getByTestId("trend-delta");
    expect(label.className).not.toContain("text-success-strong");
    expect(label.className).not.toContain("text-warning-strong");
    expect(label.className).toContain("text-subtle");

    rerender(
      <CollapsibleTrendCard
        storageKey="weight"
        title="Вага"
        latestValue={80}
        latestUnit="кг"
        delta={-0.5}
        deltaDirection="neutral"
        ariaLabel="Графік ваги"
      >
        <div data-testid="chart">chart content</div>
      </CollapsibleTrendCard>,
    );
    label = screen.getByTestId("trend-delta");
    expect(label.className).not.toContain("text-success-strong");
    expect(label.className).not.toContain("text-warning-strong");
    expect(label.className).toContain("text-subtle");
  });
});

describe("CollapsibleTrendCard — null latestValue", () => {
  it("hides value/unit display when latestValue is null", () => {
    renderCard({ latestValue: null, latestUnit: "кг" });
    expect(screen.queryByTestId("trend-latest-value")).not.toBeInTheDocument();
    expect(screen.queryByTestId("trend-delta")).not.toBeInTheDocument();
  });
});

describe("CollapsibleTrendCard — latest-value fraction digits (defect #7)", () => {
  it("shows whole-number values without a forced decimal (energy/mood scale)", () => {
    renderCard({ latestValue: 4, latestUnit: "/5" });
    expect(flatText(screen.getByTestId("trend-latest-value"))).toBe("4 /5");
  });

  it("shows a single decimal, comma-separated, for fractional values", () => {
    renderCard({ latestValue: 82.5, latestUnit: "кг" });
    expect(flatText(screen.getByTestId("trend-latest-value"))).toBe("82,5 кг");
  });
});
