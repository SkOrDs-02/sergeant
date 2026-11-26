// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { act, render, screen, cleanup } from "@testing-library/react";
import { coreMessages } from "@shared/i18n/uk.core";
import { HeroRecoveryBars } from "./HeroRecoveryBars";
import {
  __resetInitialPullStateForTests,
  markFirstPullPending,
  markFirstPullSettled,
} from "../../../../core/syncEngine/initialPullState";

/**
 * FULL-20261126-UX-1: на холодному старті, поки перший pull іде, Огляд не
 * каже «Історії тренувань ще немає» (data-59/60).
 */
beforeEach(() => __resetInitialPullStateForTests());
afterEach(() => {
  cleanup();
  __resetInitialPullStateForTests();
});

describe("Огляд Фізрука під час першого pull", () => {
  it("замість «Історії немає» показує «Завантажую з хмари…»", () => {
    render(
      <HeroRecoveryBars rows={[]} recoverByDate={{}} onOpenAtlas={vi.fn()} />,
    );
    expect(screen.getByText(/Історії тренувань ще немає/)).toBeInTheDocument();

    act(() => markFirstPullPending());
    expect(
      screen.getByText(coreMessages.firstCloudPull.loadingTitle),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Історії тренувань ще немає/)).toBeNull();

    act(() => markFirstPullSettled());
    expect(screen.getByText(/Історії тренувань ще немає/)).toBeInTheDocument();
  });
});
