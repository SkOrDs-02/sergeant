// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { setFlag, __flagsStoreForTests } from "../lib/featureFlags";
import { RoutineSpikeSection } from "./RoutineSpikeSection";

describe("RoutineSpikeSection", () => {
  beforeEach(() => {
    __flagsStoreForTests.reset();
  });

  afterEach(() => {
    cleanup();
    __flagsStoreForTests.reset();
  });

  it("shows the «enable the flag» hint when the SPIKE flag is off", () => {
    render(<RoutineSpikeSection />);
    expect(screen.getByText(/feature\.routine\.sqlite_v2/)).toBeTruthy();
    // The dev panel is lazy-loaded behind Suspense — when the flag is
    // off we never trigger the dynamic import, so the loading
    // placeholder must not appear either.
    expect(screen.queryByTestId("routine-spike-loading")).toBeNull();
  });

  it("expands the SettingsGroup so the placeholder text is visible after toggling", () => {
    setFlag("feature.routine.sqlite_v2", true);
    render(<RoutineSpikeSection />);
    // While the lazy chunk loads, Suspense renders the loading
    // placeholder (we cannot await the dynamic import in jsdom because
    // the panel reaches into sqlite-wasm during bootstrap; the lazy
    // boundary is the contract we test here).
    expect(screen.getByTestId("routine-spike-loading")).toBeTruthy();
  });
});
