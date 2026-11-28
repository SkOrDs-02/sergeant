// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { act, render, screen, cleanup } from "@testing-library/react";
import { coreMessages } from "@shared/i18n/uk.core";
import {
  __resetInitialPullStateForTests,
  markFirstPullPending,
  markFirstPullSettled,
} from "../../../core/syncEngine/initialPullState";

/**
 * A4: на свіжому пристрої «Прогрес» не каже «Даних ще немає», поки перший
 * pull з хмари ще йде.
 */
vi.mock("../../../core/db/kvStoreBoot", () => ({
  getActiveSqliteKvStore: () => null,
  bootstrapKvStore: () => Promise.resolve(),
}));
vi.mock("../hooks/useWorkouts", () => ({
  useWorkouts: () => ({ workouts: [], loaded: true }),
}));
vi.mock("../hooks/useMeasurements", () => ({
  useMeasurements: () => ({ entries: [] }),
}));
vi.mock("../hooks/useDailyLog", () => ({
  useDailyLog: () => ({ entries: [] }),
}));
vi.mock("../hooks/useExerciseCatalog", () => ({
  useExerciseCatalog: () => ({
    exercises: [],
    musclesUk: {},
    primaryGroupsUk: {},
  }),
}));

import { Progress } from "./Progress";
import { messages } from "@shared/i18n/uk";

beforeEach(() => __resetInitialPullStateForTests());
afterEach(() => {
  cleanup();
  __resetInitialPullStateForTests();
});

describe("Прогрес під час першого pull", () => {
  it("«Завантажую з хмари…» замість порожнього стану, потім звичайний", () => {
    render(<Progress onNavigate={vi.fn()} />);
    expect(
      screen.getByText(messages.fizruk.progress.emptyTitle),
    ).toBeInTheDocument();

    act(() => markFirstPullPending());
    expect(
      screen.getByText(coreMessages.firstCloudPull.loadingTitle),
    ).toBeInTheDocument();
    expect(screen.queryByText(messages.fizruk.progress.emptyTitle)).toBeNull();

    act(() => markFirstPullSettled());
    expect(
      screen.getByText(messages.fizruk.progress.emptyTitle),
    ).toBeInTheDocument();
  });
});
