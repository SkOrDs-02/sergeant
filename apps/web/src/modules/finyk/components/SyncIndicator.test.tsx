// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import {
  getSyncTone,
  SwipeProgressBar,
  SWIPE_THRESHOLD_PX,
} from "./SyncIndicator";

describe("getSyncTone", () => {
  it("returns the disconnected tone when not connected", () => {
    const tone = getSyncTone({ status: "success" }, false);
    expect(tone.text).toBe("не підключено");
    expect(tone.dot).toBe("bg-muted");
  });

  it("returns the error tone for status=error", () => {
    const tone = getSyncTone({ status: "error" });
    expect(tone.text).toBe("помилка");
    expect(tone.dot).toBe("bg-danger");
  });

  it("returns the partial tone for status=partial", () => {
    const tone = getSyncTone({ status: "partial" });
    expect(tone.text).toBe("частково");
    expect(tone.dot).toBe("bg-warning");
  });

  it("returns the loading tone for status=loading", () => {
    const tone = getSyncTone({ status: "loading" });
    expect(tone.text).toBe("оновлення");
    expect(tone.dot).toBe("bg-muted");
  });

  it("falls back to the ok tone for unknown / missing status", () => {
    expect(getSyncTone(undefined).text).toBe("ок");
    expect(getSyncTone(null).text).toBe("ок");
    expect(getSyncTone({ status: "whatever" }).text).toBe("ок");
    expect(getSyncTone({}).dot).toBe("bg-success");
  });

  it("exposes the canonical swipe threshold", () => {
    expect(SWIPE_THRESHOLD_PX).toBe(60);
  });
});

describe("SwipeProgressBar", () => {
  it("renders nothing when swipeDx is 0", () => {
    const { container } = render(
      <SwipeProgressBar swipeDx={0} threshold={SWIPE_THRESHOLD_PX} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders a progress bar capped at 100% width when over threshold", () => {
    const { container } = render(
      <SwipeProgressBar swipeDx={120} threshold={SWIPE_THRESHOLD_PX} />,
    );
    const outer = container.firstChild as HTMLElement;
    expect(outer).not.toBeNull();
    const bar = outer.firstChild as HTMLElement;
    // 120 / 60 = 200% → clamped to 100%.
    expect(bar.style.width).toBe("100%");
    // Past-threshold uses the solid accent fill.
    expect(bar.className).toContain("bg-finyk");
    // Rightward swipe → not pinned to the right (marginLeft 0, not "auto").
    expect(bar.style.marginLeft).not.toBe("auto");
  });

  it("uses the soft fill and partial width below threshold and mirrors leftward swipes", () => {
    const { container } = render(
      <SwipeProgressBar swipeDx={-30} threshold={SWIPE_THRESHOLD_PX} />,
    );
    const bar = container.firstChild?.firstChild as HTMLElement;
    // abs(-30)/60 = 50%.
    expect(bar.style.width).toBe("50%");
    expect(bar.className).toContain("bg-finyk/40");
    // Leftward swipe pins the bar to the right.
    expect(bar.style.marginLeft).toBe("auto");
  });
});
