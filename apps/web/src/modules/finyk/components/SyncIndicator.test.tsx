// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { getSyncTone } from "./SyncIndicator";

describe("getSyncTone", () => {
  it("returns the disconnected tone when not connected", () => {
    const tone = getSyncTone({ status: "success" }, false);
    expect(tone.text).toBe("не підключено");
    expect(tone.dot).toBe("bg-muted");
    expect(tone.icon).toBe("wifi-off");
  });

  it("returns the error tone for status=error", () => {
    const tone = getSyncTone({ status: "error" });
    expect(tone.text).toBe("помилка");
    expect(tone.dot).toBe("bg-danger");
    expect(tone.icon).toBe("alert-circle");
  });

  it("returns the partial tone for status=partial", () => {
    const tone = getSyncTone({ status: "partial" });
    expect(tone.text).toBe("частково");
    expect(tone.dot).toBe("bg-warning");
    expect(tone.icon).toBe("alert-triangle");
  });

  it("returns the loading tone for status=loading", () => {
    const tone = getSyncTone({ status: "loading" });
    expect(tone.text).toBe("оновлення");
    expect(tone.dot).toBe("bg-muted");
    expect(tone.icon).toBe("refresh-cw");
  });

  it("falls back to the ok tone for unknown / missing status", () => {
    expect(getSyncTone(undefined).text).toBe("ок");
    expect(getSyncTone(null).text).toBe("ок");
    expect(getSyncTone({ status: "whatever" }).text).toBe("ок");
    expect(getSyncTone({}).dot).toBe("bg-success");
    expect(getSyncTone({}).icon).toBe("check-circle");
  });

  // Regression: founder report 2026-07-31 — «Бейдж ок перекриває хедер
  // модуля». The header row is fixed-width on a phone; the healthy pill costs
  // ~54px there while carrying no text (`hidden sm:inline`), which squeezed
  // the module title out. `needsAttention` is the flag `SyncPill` uses to hide
  // only the uninformative "ок" state on narrow viewports.
  it("marks only the healthy tone as not needing attention", () => {
    expect(getSyncTone({ status: "success" }).needsAttention).toBe(false);
    expect(getSyncTone(undefined).needsAttention).toBe(false);
    expect(getSyncTone({ status: "whatever" }).needsAttention).toBe(false);
  });

  it("marks every actionable tone as needing attention", () => {
    expect(getSyncTone({ status: "success" }, false).needsAttention).toBe(true);
    expect(getSyncTone({ status: "error" }).needsAttention).toBe(true);
    expect(getSyncTone({ status: "partial" }).needsAttention).toBe(true);
    expect(getSyncTone({ status: "loading" }).needsAttention).toBe(true);
  });
});
