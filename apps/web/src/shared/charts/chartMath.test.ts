/**
 * Last validated: 2026-08-28
 * Status: Active
 *
 * Golden-тести піксельного паритету chartMath. Літеральні рядки нижче —
 * ФАКТИЧНИЙ вихід ручних формул чартів ДО рефакторингу (знято з
 * WeeklyVolumeChart / ExerciseProgressChart / NetworthChart на тих самих
 * вхідних масивах). Якщо тест червоніє — зрушено пікселі всіх чартів.
 */
import { describe, it, expect } from "vitest";
import {
  seriesExtent,
  pointStep,
  xAt,
  fractionX,
  linearY,
  linearSpan,
  clampToDomain,
  buildLinePath,
  buildAreaPath,
  buildPolylinePoints,
  buildAreaPolygonPoints,
} from "./chartMath";

describe("seriesExtent", () => {
  it("повертає min/max/range для звичайної серії", () => {
    expect(seriesExtent([50, 55, 60])).toEqual({ min: 50, max: 60, range: 10 });
  });

  it("деґенерований домен (плоска серія) → range 1", () => {
    expect(seriesExtent([70, 70])).toEqual({ min: 70, max: 70, range: 1 });
  });

  it("одна точка → range 1", () => {
    expect(seriesExtent([42])).toEqual({ min: 42, max: 42, range: 1 });
  });

  it("порожня серія → Infinity/-Infinity (семантика Math.min/max)", () => {
    const e = seriesExtent([]);
    expect(e.min).toBe(Infinity);
    expect(e.max).toBe(-Infinity);
  });
});

describe("pointStep / xAt", () => {
  it("n точок → innerW / (n - 1)", () => {
    expect(pointStep(276, 7)).toBe(46);
    expect(xAt(36, 3, 46)).toBe(174);
  });

  it("деґенерація: одна точка → крок = innerW, без Infinity", () => {
    expect(pointStep(276, 1)).toBe(276);
  });
});

describe("linearY / linearSpan / clampToDomain", () => {
  it("мапить домен у піксельну вісь (інверсія Y)", () => {
    // ExerciseProgressChart: padT=10, innerH=56, домен [50, 60]
    expect(linearY(50, 50, 10, 10, 56)).toBe(66);
    expect(linearY(60, 50, 10, 10, 56)).toBe(10);
    expect(linearY(55, 50, 10, 10, 56)).toBe(38);
  });

  it("деґенерований домен (range 1) кладе всі точки на базову лінію", () => {
    expect(linearY(70, 70, 1, 10, 56)).toBe(66);
  });

  it("linearSpan — висота бара WellbeingChart (шкала 1..5, innerH=60)", () => {
    expect(linearSpan(5, 1, 4, 60)).toBe(60);
    expect(linearSpan(1, 1, 4, 60)).toBe(0);
    expect(linearSpan(3, 1, 4, 60)).toBe(30);
  });

  it("clampToDomain обрізає в [min, max]", () => {
    expect(clampToDomain(120, 0, 100)).toBe(100);
    expect(clampToDomain(-5, 0, 100)).toBe(0);
    expect(clampToDomain(50, 0, 100)).toBe(50);
  });
});

describe("паритет path-рядків (golden з ручних формул до рефакторингу)", () => {
  it("WeeklyVolumeChart: [1200, 0, 800, 1500.5, 0, 0, 300]", () => {
    // Геометрія WeeklyVolumeChart: w=320 h=120 padL=36 padR=8 padT=12 padB=28
    const vals = [1200, 0, 800, 1500.5, 0, 0, 300];
    const padT = 12;
    const innerH = 80;
    const step = pointStep(276, vals.length);
    const max = Math.max(1, ...vals);
    const points = vals.map((v, i) => ({
      x: xAt(36, i, step),
      y: linearY(Math.min(v, max), 0, max, padT, innerH),
    }));
    expect(buildLinePath(points)).toBe(
      "M 36.0 28.0 L 82.0 92.0 L 128.0 49.3 L 174.0 12.0 L 220.0 92.0 L 266.0 92.0 L 312.0 76.0",
    );
    expect(buildAreaPath(points, padT + innerH)).toBe(
      "M 36.0 28.0 L 82.0 92.0 L 128.0 49.3 L 174.0 12.0 L 220.0 92.0 L 266.0 92.0 L 312.0 76.0 L 312.0 92.0 L 36.0 92.0 Z",
    );
  });

  it("WeeklyVolumeChart: плоский тиждень [0×7] лягає на базову лінію", () => {
    const vals = [0, 0, 0, 0, 0, 0, 0];
    const step = pointStep(276, vals.length);
    const max = Math.max(1, ...vals);
    const points = vals.map((v, i) => ({
      x: xAt(36, i, step),
      y: linearY(Math.min(v, max), 0, max, 12, 80),
    }));
    expect(buildLinePath(points)).toBe(
      "M 36.0 92.0 L 82.0 92.0 L 128.0 92.0 L 174.0 92.0 L 220.0 92.0 L 266.0 92.0 L 312.0 92.0",
    );
    expect(buildAreaPath(points, 92)).toBe(
      "M 36.0 92.0 L 82.0 92.0 L 128.0 92.0 L 174.0 92.0 L 220.0 92.0 L 266.0 92.0 L 312.0 92.0 L 312.0 92.0 L 36.0 92.0 Z",
    );
  });

  it("ExerciseProgressChart: [50, 55, 60]", () => {
    // Геометрія ExerciseProgressChart: w=320 h=90 padL=38 padR=8 padT=10 padB=24
    const vals = [50, 55, 60];
    const { min, range } = seriesExtent(vals);
    const step = pointStep(274, vals.length);
    const points = vals.map((v, i) => ({
      x: xAt(38, i, step),
      y: linearY(v, min, range, 10, 56),
    }));
    expect(buildLinePath(points)).toBe("M 38.0 66.0 L 175.0 38.0 L 312.0 10.0");
    expect(buildAreaPath(points, 66)).toBe(
      "M 38.0 66.0 L 175.0 38.0 L 312.0 10.0 L 312.0 66.0 L 38.0 66.0 Z",
    );
  });

  it("ExerciseProgressChart: деґенерований домен [70, 70]", () => {
    const vals = [70, 70];
    const { min, range } = seriesExtent(vals);
    const step = pointStep(274, vals.length);
    const points = vals.map((v, i) => ({
      x: xAt(38, i, step),
      y: linearY(v, min, range, 10, 56),
    }));
    expect(buildLinePath(points)).toBe("M 38.0 66.0 L 312.0 66.0");
    expect(buildAreaPath(points, 66)).toBe(
      "M 38.0 66.0 L 312.0 66.0 L 312.0 66.0 L 38.0 66.0 Z",
    );
  });

  it("NetworthChart: [-500, 1200, 300] — сирі float-и без округлення", () => {
    // Геометрія NetworthChart: W=300 H=80 PAD={left:4,right:4,top:10,bottom:20}
    const values = [-500, 1200, 300];
    const { min, range } = seriesExtent(values);
    const points = values.map((v, i) => ({
      x: fractionX(4, i, values.length, 292),
      y: linearY(v, min, range, 10, 50),
    }));
    expect(buildPolylinePoints(points)).toBe(
      "4,60 150,10 296,36.470588235294116",
    );
    expect(buildAreaPolygonPoints(points, 60)).toBe(
      "4,60 4,60 150,10 296,36.470588235294116 296,60",
    );
  });

  it("NetworthChart: деґенерований домен [250, 250]", () => {
    const values = [250, 250];
    const { min, range } = seriesExtent(values);
    const points = values.map((v, i) => ({
      x: fractionX(4, i, values.length, 292),
      y: linearY(v, min, range, 10, 50),
    }));
    expect(buildPolylinePoints(points)).toBe("4,60 296,60");
    expect(buildAreaPolygonPoints(points, 60)).toBe("4,60 4,60 296,60 296,60");
  });

  it("порожня серія → порожні рядки", () => {
    expect(buildLinePath([])).toBe("");
    expect(buildAreaPath([], 92)).toBe("");
    expect(buildPolylinePoints([])).toBe("");
    expect(buildAreaPolygonPoints([], 60)).toBe("");
  });

  it("одна точка → лише M (line) і замкнена area на тій самій X", () => {
    const points = [{ x: 36, y: 28.14 }];
    expect(buildLinePath(points)).toBe("M 36.0 28.1");
    expect(buildAreaPath(points, 92)).toBe(
      "M 36.0 28.1 L 36.0 92.0 L 36.0 92.0 Z",
    );
  });
});
