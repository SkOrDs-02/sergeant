import { describe, it, expect } from "vitest";
import {
  chartSeries,
  chartAxis,
  chartGrid,
  chartTick,
  chartHeatmap,
  chartGradients,
} from "./chartTheme";

describe("chartTheme", () => {
  it("exposes primary/secondary/surface tokens for every module in chartSeries", () => {
    for (const mod of ["finyk", "fizruk", "routine", "nutrition"] as const) {
      expect(chartSeries[mod]).toHaveProperty("primary");
      expect(chartSeries[mod]).toHaveProperty("secondary");
      expect(chartSeries[mod]).toHaveProperty("surface");
      expect(typeof chartSeries[mod].primary).toBe("string");
    }
  });

  it("exposes axis line and label style objects", () => {
    expect(chartAxis.line.className).toContain("stroke-line");
    expect(chartAxis.label.className).toContain("fill-muted");
  });

  it("exposes horizontal/vertical grid styles", () => {
    expect(chartGrid.horizontal.strokeDasharray).toBe("3 3");
    expect(chartGrid.vertical.strokeDasharray).toBe("2 4");
  });

  it("exposes tick label defaults with centered text anchor", () => {
    expect(chartTick.textAnchor).toBe("middle");
  });

  it("exposes a 4-step routine heatmap level scale plus empty/future/ring/outline", () => {
    expect(chartHeatmap.routine.levels).toHaveLength(4);
    expect(chartHeatmap.routine.empty).toContain("bg-panelHi");
    expect(chartHeatmap.routine.future).toContain("bg-line");
    expect(chartHeatmap.routine.ring).toContain("ring-coral");
    expect(chartHeatmap.routine.outline).toContain("outline-coral");
  });

  it("builds two-stop gradients (opaque → transparent) for every module", () => {
    for (const mod of ["finyk", "fizruk", "routine", "nutrition"] as const) {
      const stops = chartGradients[mod];
      expect(stops).toHaveLength(2);
      expect(stops[0]!.offset).toBe("0%");
      expect(stops[1]!.offset).toBe("100%");
      expect(stops[1]!.stopOpacity).toBe(0);
      expect(stops[0]!.stopColor).toBe(chartSeries[mod].primary);
    }
  });
});
