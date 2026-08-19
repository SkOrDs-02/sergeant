import { afterEach, describe, expect, it } from "vitest";
import {
  clearRealEntryCounters,
  registerRealEntryCounter,
  webRealEntryProbe,
} from "./realEntryProbe";

describe("webRealEntryProbe", () => {
  afterEach(() => {
    clearRealEntryCounters();
  });

  it("reports 0 for a module that never registered a counter", () => {
    expect(webRealEntryProbe("finyk")).toBe(0);
  });

  it("returns the registered counter's current value", () => {
    let habits = 0;
    registerRealEntryCounter("routine", () => habits);

    expect(webRealEntryProbe("routine")).toBe(0);
    habits = 2;
    expect(webRealEntryProbe("routine")).toBe(2);
    expect(webRealEntryProbe("finyk")).toBe(0);
  });

  it("re-registration replaces the previous counter", () => {
    registerRealEntryCounter("fizruk", () => 1);
    registerRealEntryCounter("fizruk", () => 7);

    expect(webRealEntryProbe("fizruk")).toBe(7);
  });

  it("swallows a throwing counter — FTUX detection must not break the hub", () => {
    registerRealEntryCounter("nutrition", () => {
      throw new Error("cache exploded");
    });

    expect(webRealEntryProbe("nutrition")).toBe(0);
  });
});
