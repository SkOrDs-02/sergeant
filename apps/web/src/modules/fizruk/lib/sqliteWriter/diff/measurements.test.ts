import { describe, it, expect } from "vitest";
import {
  diffMeasurementsOps,
  type FizrukMeasurementSnapshot,
} from "./measurements";

function baseMeasurement(
  overrides: Partial<FizrukMeasurementSnapshot> = {},
): FizrukMeasurementSnapshot {
  return {
    id: "m1",
    at: "2026-07-01T10:00:00.000Z",
    weightKg: 82.5,
    ...overrides,
  };
}

describe("diffMeasurementsOps", () => {
  it("emits a measurement-upsert for a measurement new to next", () => {
    const ops = diffMeasurementsOps([], [baseMeasurement()]);
    expect(ops).toEqual([
      { kind: "measurement-upsert", measurement: baseMeasurement() },
    ]);
  });

  it("emits a measurement-delete for a measurement missing from next", () => {
    const ops = diffMeasurementsOps([baseMeasurement()], []);
    expect(ops).toEqual([{ kind: "measurement-delete", measurementId: "m1" }]);
  });

  it("emits no op when the reference is identical", () => {
    const m = baseMeasurement();
    expect(diffMeasurementsOps([m], [m])).toEqual([]);
  });

  it("always upserts on reference change, even with identical field values", () => {
    const ops = diffMeasurementsOps([baseMeasurement()], [baseMeasurement()]);
    expect(ops).toEqual([
      { kind: "measurement-upsert", measurement: baseMeasurement() },
    ]);
  });
});
