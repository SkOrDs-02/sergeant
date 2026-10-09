import { describe, expect, it } from "vitest";
import { buildSpendLine, DAY_FROM, DAY_TO, LINE_W } from "./spendHeroLine";

describe("buildSpendLine", () => {
  it("starts at 06:00 on the bottom and ends at the now point", () => {
    const line = buildSpendLine([[10 * 60, 100]], 12 * 60, 200);
    expect(line.path.startsWith("M0 ")).toBe(true);
    const nowX = ((12 * 60 - DAY_FROM) / (DAY_TO - DAY_FROM)) * LINE_W;
    expect(line.now.x).toBeCloseTo(nowX);
    // 100 з плану 200 (масштаб 210): точка нижче пунктиру плану.
    expect(line.planY).not.toBeNull();
    expect(line.now.y).toBeGreaterThan(line.planY!);
  });

  it("clamps spends before 06:00 to the line start and skips future points", () => {
    const line = buildSpendLine(
      [
        [60, 50],
        [20 * 60, 70],
      ],
      9 * 60,
      null,
    );
    expect(line.path).toContain("H0.0 V");
    expect(line.planY).toBeNull();
    // Ранкова витрата вже на лінії, вечірня ще ні: точка «зараз» над дном.
    expect(line.path).not.toContain("H233");
    expect(line.now.y).toBeLessThan(54);
  });

  it("keeps an overspent day inside the box", () => {
    const line = buildSpendLine([[13 * 60, 900]], 14 * 60, 300);
    expect(line.now.y).toBeGreaterThanOrEqual(0);
    expect(line.planY!).toBeGreaterThan(line.now.y);
  });
});
