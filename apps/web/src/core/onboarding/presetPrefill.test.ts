/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from "vitest";

import { consumePresetPrefill, writePresetPrefill } from "./presetPrefill";

describe("presetPrefill (session-scoped handoff)", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("writes and consumes a prefill exactly once", () => {
    writePresetPrefill("finyk", { amount: 100, category: "food" });
    expect(consumePresetPrefill("finyk")).toEqual({
      amount: 100,
      category: "food",
    });
    // one-shot: a second consume returns null
    expect(consumePresetPrefill("finyk")).toBeNull();
  });

  it("returns null when no prefill exists", () => {
    expect(consumePresetPrefill("routine")).toBeNull();
  });

  it("clears the slot when data is null/undefined", () => {
    writePresetPrefill("finyk", { amount: 1 });
    writePresetPrefill("finyk", null);
    expect(consumePresetPrefill("finyk")).toBeNull();
  });

  it("ignores non-object data on write", () => {
    writePresetPrefill("finyk", undefined);
    expect(consumePresetPrefill("finyk")).toBeNull();
  });

  it("returns null for an array payload (defensive)", () => {
    sessionStorage.setItem(
      "hub_preset_prefill_v1:finyk",
      JSON.stringify([1, 2, 3]),
    );
    expect(consumePresetPrefill("finyk")).toBeNull();
  });

  it("returns null for malformed JSON", () => {
    sessionStorage.setItem("hub_preset_prefill_v1:finyk", "{not json");
    expect(consumePresetPrefill("finyk")).toBeNull();
  });

  it("keeps prefills isolated per module", () => {
    writePresetPrefill("finyk", { a: 1 });
    writePresetPrefill("routine", { b: 2 });
    expect(consumePresetPrefill("routine")).toEqual({ b: 2 });
    expect(consumePresetPrefill("finyk")).toEqual({ a: 1 });
  });
});
