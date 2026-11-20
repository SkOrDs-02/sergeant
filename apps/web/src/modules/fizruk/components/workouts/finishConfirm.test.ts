import { describe, expect, it } from "vitest";
import {
  FINISH_UNDO_WINDOW_MS,
  buildFinishConfirmSummary,
} from "./finishConfirm";

describe("buildFinishConfirmSummary (Фз-2)", () => {
  it("collects duration, exercises, done sets and volume in one line", () => {
    expect(
      buildFinishConfirmSummary({
        durationSec: 30 * 60 + 6,
        items: 1,
        doneItems: 1,
        sets: 2,
        tonnageKg: 870,
      }),
    ).toBe("30 хв · 1 вправа · 2 підходи · 870 кг×повт");
  });

  it("каже зроблені з усіх, як плитка «Вправ N з M» підсумку (рішення 2026-11-18)", () => {
    expect(
      buildFinishConfirmSummary({
        durationSec: 26,
        items: 2,
        doneItems: 1,
        sets: 1,
        tonnageKg: 336,
      }),
    ).toBe("26 с · 1 з 2 вправ · 1 підхід · 336 кг×повт");
  });

  it("drops volume when there is none and keeps seconds for a sub-minute session", () => {
    expect(
      buildFinishConfirmSummary({
        durationSec: 42,
        items: 0,
        doneItems: 0,
        sets: 0,
        tonnageKg: 0,
      }),
    ).toBe("42 с · 0 вправ · 0 підходів");
  });

  it("the undo window is the founder's ten seconds", () => {
    expect(FINISH_UNDO_WINDOW_MS).toBe(10_000);
  });
});
