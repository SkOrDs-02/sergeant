import { describe, expect, it } from "vitest";
import {
  FEATURES,
  FEATURE_IDS,
  hasFeature,
  nextWeekStartKyivMs,
  weekStartKyiv,
  weeklyLimit,
} from "./entitlements";

describe("weekStartKyiv", () => {
  it("неділя 23:59 Kyiv належить тижню, що почався попереднього понеділка", () => {
    // 2026-06-14 (неділя) 23:59 Kyiv = 20:59Z (літо, UTC+3).
    expect(weekStartKyiv("2026-06-14T20:59:00Z")).toBe("2026-06-08");
  });

  it("понеділок 00:00 Kyiv відкриває новий тиждень", () => {
    // 2026-06-15 (понеділок) 00:00 Kyiv = 2026-06-14T21:00Z.
    expect(weekStartKyiv("2026-06-14T21:00:00Z")).toBe("2026-06-15");
  });

  it("тиждень із переходом на літній час (29.03.2026) тримає понеділок 23.03", () => {
    expect(weekStartKyiv("2026-03-29T00:30:00Z")).toBe("2026-03-23");
    expect(weekStartKyiv("2026-03-29T22:00:00Z")).toBe("2026-03-30");
  });

  it("тиждень із переходом на зимовий час (25.10.2026) тримає понеділок 19.10", () => {
    expect(weekStartKyiv("2026-10-25T21:59:00Z")).toBe("2026-10-19");
    // Понеділок 26.10 00:00 Kyiv вже взимку = 25.10 22:00Z.
    expect(weekStartKyiv("2026-10-25T22:00:00Z")).toBe("2026-10-26");
  });
});

describe("nextWeekStartKyivMs", () => {
  it("віддає наступний понеділок 00:00 Kyiv", () => {
    expect(
      new Date(nextWeekStartKyivMs("2026-06-10T12:00:00Z")).toISOString(),
    ).toBe("2026-06-14T21:00:00.000Z");
  });

  it("через перехід на зимовий час зсуває офсет на UTC+2", () => {
    expect(
      new Date(nextWeekStartKyivMs("2026-10-21T12:00:00Z")).toISOString(),
    ).toBe("2026-10-25T22:00:00.000Z");
  });
});

describe("FEATURES", () => {
  it("Free: 20 дій, 3 фото і 5 vision-сканів на тиждень", () => {
    expect(weeklyLimit("free", "ai.actions")).toBe(20);
    expect(weeklyLimit("free", "ai.photo")).toBe(3);
    expect(weeklyLimit("free", "ai.finykVision")).toBe(5);
  });

  it("Premium не має тижневих лімітів і відкриває кожну фічу", () => {
    for (const id of FEATURE_IDS) {
      expect(weeklyLimit("pro", id)).toBeNull();
      expect(hasFeature("pro", id)).toBe(true);
    }
  });

  it("закриті на Free лише Premium-фічі зі спеки", () => {
    const closed = FEATURE_IDS.filter((id) => !hasFeature("free", id)).sort();
    expect(closed).toEqual(
      [
        "ai.memoryRecall",
        "ai.proactive",
        "ai.voice",
        "export.pdf",
        "nutrition.weekPlan",
      ].sort(),
    );
  });

  it("Mono-синк і хмарний синк лишаються у Free", () => {
    expect(FEATURES["bank.monoSync"].free).toBe(true);
    expect(FEATURES["sync.cloud"].free).toBe(true);
  });
});
