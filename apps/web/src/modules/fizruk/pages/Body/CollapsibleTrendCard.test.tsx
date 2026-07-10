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
    expect(screen.getByText(/80.*кг/)).toBeInTheDocument();
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
  it("renders positive delta when delta > 0", () => {
    renderCard({ delta: 1.2 });
    expect(screen.getByText("+1.2 кг")).toBeInTheDocument();
  });

  it("renders negative delta when delta < 0", () => {
    renderCard({ delta: -0.5 });
    expect(screen.getByText("-0.5 кг")).toBeInTheDocument();
  });

  it("hides delta when delta is null", () => {
    renderCard({ delta: null });
    // neither + nor - delta label should appear
    expect(screen.queryByText(/\+/)).not.toBeInTheDocument();
    expect(screen.queryByText(/-\d/)).not.toBeInTheDocument();
  });

  it("hides delta when delta is exactly 0", () => {
    renderCard({ delta: 0 });
    expect(screen.queryByText(/\+0/)).not.toBeInTheDocument();
  });
});

describe("CollapsibleTrendCard — null latestValue", () => {
  it("hides value/unit display when latestValue is null", () => {
    renderCard({ latestValue: null, latestUnit: "кг" });
    expect(screen.queryByText(/кг/)).not.toBeInTheDocument();
  });
});
