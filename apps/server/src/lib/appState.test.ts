import { beforeEach, describe, expect, it } from "vitest";

import {
  __resetAppStateForTests,
  appState,
  markStartupComplete,
} from "./appState.js";

describe("appState", () => {
  beforeEach(() => {
    __resetAppStateForTests();
  });

  it("starts incomplete and can be marked complete", () => {
    expect(appState.startupComplete).toBe(false);

    markStartupComplete();

    expect(appState.startupComplete).toBe(true);
  });

  it("allows tests to reset the startup flag", () => {
    markStartupComplete();
    __resetAppStateForTests();

    expect(appState.startupComplete).toBe(false);
  });

  it("keeps markStartupComplete idempotent", () => {
    markStartupComplete();
    markStartupComplete();

    expect(appState.startupComplete).toBe(true);
  });
});
