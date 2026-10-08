// @vitest-environment jsdom
/**
 * Фіксує одноразовість озвучення в ефектах `RestTimerOverlay` і `BodyAtlas`
 * (директиви `exhaustive-deps` зняті 2026-10): ±15/±30 (змінюють `total`) і
 * оновлення `data` не мають повторно кидати `announce`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

const announce = vi.hoisted(() => vi.fn());
vi.mock("@shared/components/ui/ScreenReaderAnnouncer", () => ({
  useAnnounce: () => ({ announce }),
}));

import { RestTimerOverlay } from "./workouts/RestTimerOverlay";
import { BodyAtlas, type AtlasMuscleDatum } from "./BodyAtlas";

beforeEach(() => {
  // jsdom не реалізує scrollIntoView.
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  announce.mockClear();
});

describe("RestTimerOverlay — milestone announce", () => {
  it("«відпочинок почато» рівно раз: зміна total (±15/±30) не повторює", () => {
    const { rerender, unmount } = render(
      <RestTimerOverlay
        restTimer={{ remaining: 90, total: 90 }}
        onCancel={vi.fn()}
      />,
    );
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce.mock.calls[0]?.[0]).toContain("90");

    rerender(
      <RestTimerOverlay
        restTimer={{ remaining: 105, total: 105 }}
        onCancel={vi.fn()}
      />,
    );
    rerender(
      <RestTimerOverlay
        restTimer={{ remaining: 100, total: 105 }}
        onCancel={vi.fn()}
      />,
    );
    expect(announce).toHaveBeenCalledTimes(1);

    unmount();
    expect(announce).toHaveBeenCalledTimes(2);
  });
});

describe("BodyAtlas — focusMuscleId announce", () => {
  const datum = (status: AtlasMuscleDatum["status"]): AtlasMuscleDatum => ({
    fatigue: 0.5,
    daysSince: 1,
    load7d: 1000,
    status,
    exercises: [],
  });

  it("озвучує вхідний фокус рівно раз; нові `data` не повторюють", () => {
    const { rerender } = render(
      <BodyAtlas data={{ chest: datum("red") }} focusMuscleId="chest" />,
    );
    expect(announce).toHaveBeenCalledTimes(1);

    rerender(
      <BodyAtlas data={{ chest: datum("green") }} focusMuscleId="chest" />,
    );
    rerender(
      <BodyAtlas data={{ chest: datum("yellow") }} focusMuscleId="chest" />,
    );
    expect(announce).toHaveBeenCalledTimes(1);
  });

  it("новий focusMuscleId озвучується знову", () => {
    const data = { chest: datum("red"), biceps: datum("green") };
    const { rerender } = render(
      <BodyAtlas data={data} focusMuscleId="chest" />,
    );
    rerender(<BodyAtlas data={data} focusMuscleId="biceps" />);
    expect(announce).toHaveBeenCalledTimes(2);
  });
});
