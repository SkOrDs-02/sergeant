// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

// Aggregate helpers read from localStorage inside `useWeeklyDigest`. We
// stub them at the module boundary so the integration test doesn't have
// to seed the store.
vi.mock("../../insights/useWeeklyDigest", () => ({
  aggregateFinyk: () => null,
  aggregateFizruk: () => null,
  aggregateNutrition: () => null,
  aggregateRoutine: () => null,
}));

beforeAll(() => {
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
});

afterEach(() => {
  cleanup();
  document.body.style.overflow = "";
});

import { WeeklyDigestStories } from "../WeeklyDigestStories";

describe("WeeklyDigestStories (integration smoke)", () => {
  it("renders null when there are no slides", () => {
    const { container } = render(
      <WeeklyDigestStories digest={null} weekKey="W1" />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders into document.body with dialog role when slides exist", () => {
    render(<WeeklyDigestStories digest={{}} weekKey="W1" weekRange="1–7" />);
    const dialog = document.body.querySelector('[role="dialog"]');
    expect(dialog).toBeTruthy();
    expect(dialog?.getAttribute("aria-modal")).toBe("true");
  });

  it("does not throw when onClose is omitted", () => {
    expect(() =>
      render(<WeeklyDigestStories digest={{}} weekKey="W1" />),
    ).not.toThrow();
  });

  it("locks body scroll while mounted and restores on unmount", () => {
    document.body.style.overflow = "auto";
    const { unmount } = render(
      <WeeklyDigestStories digest={{}} weekKey="W1" />,
    );
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).toBe("auto");
  });

  it("calls onClose from the header close button and Escape key", () => {
    const onClose = vi.fn();
    render(<WeeklyDigestStories digest={{}} weekKey="W1" onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: "Закрити" }));
    fireEvent.keyDown(window, { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("calls onClose when the story surface is swiped down", () => {
    const onClose = vi.fn();
    render(<WeeklyDigestStories digest={{}} weekKey="W1" onClose={onClose} />);

    const surface = document.body.querySelector(".touch-none") as HTMLElement;
    fireEvent.pointerDown(surface, { pointerId: 1, clientX: 40, clientY: 0 });
    fireEvent.pointerMove(surface, { pointerId: 1, clientX: 40, clientY: 180 });
    fireEvent.pointerUp(surface, { pointerId: 1, clientX: 40, clientY: 180 });

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
