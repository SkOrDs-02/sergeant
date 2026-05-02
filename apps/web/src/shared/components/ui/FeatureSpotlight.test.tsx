/** @vitest-environment jsdom */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { FeatureSpotlight } from "./FeatureSpotlight";

// jsdom returns a zero-sized rect from `getBoundingClientRect` for unlayouted
// elements, which trips FeatureSpotlight's viewport-validity check (added in
// 28e69abe so a fixed-position button with a stale ref doesn't anchor the
// spotlight off-screen). Stub a realistic rect so the spotlight's "is the
// target actually visible" guard accepts the test target.
function stubBoundingClientRect(): () => void {
  const orig = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function (): DOMRect {
    return {
      x: 100,
      y: 100,
      top: 100,
      left: 100,
      bottom: 140,
      right: 200,
      width: 100,
      height: 40,
      toJSON() {
        return this;
      },
    } as DOMRect;
  };
  return () => {
    Element.prototype.getBoundingClientRect = orig;
  };
}

let restoreRect: () => void = () => undefined;

beforeEach(() => {
  restoreRect = stubBoundingClientRect();
});

afterEach(() => {
  restoreRect?.();
  cleanup();
  vi.useRealTimers();
});

describe("FeatureSpotlight", () => {
  it("keeps wrapped target visible and opens the spotlight after delay", () => {
    vi.useFakeTimers();

    const { getByRole, queryByRole, getByText } = render(
      <FeatureSpotlight
        id="assistant-fab-test"
        title="AI-асистент"
        description="Швидкий вхід у чат"
        placement="left"
        delay={100}
        skipPersist
      >
        <button type="button">Асистент</button>
      </FeatureSpotlight>,
    );

    expect(getByRole("button", { name: "Асистент" })).not.toBeNull();
    expect(queryByRole("dialog")).toBeNull();

    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(queryByRole("dialog")).not.toBeNull();
    expect(getByText("AI-асистент")).not.toBeNull();
  });
});
