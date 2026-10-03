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

  it("emits no op for a new reference with identical fields", () => {
    expect(
      diffMeasurementsOps([baseMeasurement()], [baseMeasurement()]),
    ).toEqual([]);
  });

  it("upserts when a measured value changes", () => {
    const ops = diffMeasurementsOps(
      [baseMeasurement()],
      [baseMeasurement({ weightKg: 81.9 })],
    );
    expect(ops).toEqual([
      {
        kind: "measurement-upsert",
        measurement: baseMeasurement({ weightKg: 81.9 }),
      },
    ]);
  });

  it("upserts when a field is added or removed", () => {
    const withWaist = baseMeasurement({ waistCm: 84 });
    expect(diffMeasurementsOps([baseMeasurement()], [withWaist])).toEqual([
      { kind: "measurement-upsert", measurement: withWaist },
    ]);
    expect(diffMeasurementsOps([withWaist], [baseMeasurement()])).toEqual([
      { kind: "measurement-upsert", measurement: baseMeasurement() },
    ]);
  });

  it("touches only the changed row when the whole list is a new array", () => {
    const untouched = baseMeasurement({
      id: "m0",
      at: "2026-06-30T10:00:00.000Z",
    });
    const prev = [untouched, baseMeasurement()];
    const next = [{ ...untouched }, baseMeasurement({ weightKg: 83 })];
    expect(diffMeasurementsOps(prev, next)).toEqual([
      {
        kind: "measurement-upsert",
        measurement: baseMeasurement({ weightKg: 83 }),
      },
    ]);
  });
});
