/**
 * Тести union-селектора ваги (W1-WEIGHT-SOT, стадія 1).
 *
 * Ключове, що фіксуємо:
 *  - жоден запис користувача не зникає (union, не заміна джерела);
 *  - дедуп рахує день у Europe/Kyiv, а не в UTC;
 *  - при колізії дня виграє новіший `at`;
 *  - tombstone-записи (`deleted_at`) не враховуються.
 */
import { describe, expect, it } from "vitest";

import {
  buildBodyWeightSeries,
  hasAnyBodyWeightSample,
  selectBodyWeightSamples,
  selectLatestBodyWeight,
  toBodyWeightEntries,
  type BodyWeightRecordInput,
} from "./bodyWeight.js";
import {
  buildBodySummariesWithWeightUnion,
  buildBodyWeightSummary,
} from "./summary.js";

describe("selectBodyWeightSamples", () => {
  it("обʼєднує обидва сховища — жоден день не губиться", () => {
    const samples = selectBodyWeightSamples(
      [{ id: "dl1", at: "2026-06-20T08:00:00Z", weightKg: 82 }],
      [{ id: "m1", at: "2026-06-22T08:00:00Z", weightKg: 81 }],
    );
    expect(samples.map((s) => s.dayKey)).toEqual(["2026-06-22", "2026-06-20"]);
    expect(samples.map((s) => s.source)).toEqual(["measurements", "dailyLog"]);
  });

  it("дедуплікує один і той самий weigh-in, віддзеркалений у два сховища", () => {
    const mirrored = { at: "2026-06-22T08:00:00.000Z", weightKg: 80.5 };
    const samples = selectBodyWeightSamples(
      [{ id: "dl1", ...mirrored }],
      [{ id: "m1", ...mirrored }],
    );
    expect(samples).toHaveLength(1);
    expect(samples[0]?.weightKg).toBe(80.5);
  });

  it("при колізії дня виграє новіший `at`, незалежно від сховища", () => {
    const daily = selectBodyWeightSamples(
      [{ id: "dl1", at: "2026-06-22T19:00:00Z", weightKg: 79 }],
      [{ id: "m1", at: "2026-06-22T06:00:00Z", weightKg: 83 }],
    );
    expect(daily).toHaveLength(1);
    expect(daily[0]?.weightKg).toBe(79);
    expect(daily[0]?.source).toBe("dailyLog");

    const measured = selectBodyWeightSamples(
      [{ id: "dl1", at: "2026-06-22T06:00:00Z", weightKg: 83 }],
      [{ id: "m1", at: "2026-06-22T19:00:00Z", weightKg: 79 }],
    );
    expect(measured[0]?.weightKg).toBe(79);
    expect(measured[0]?.source).toBe("measurements");
  });

  it("день рахується в Europe/Kyiv, а не в UTC", () => {
    // 21:30 UTC 21 червня = 00:30 Kyiv 22 червня (літо, UTC+3).
    const samples = selectBodyWeightSamples(
      [{ id: "dl1", at: "2026-06-21T21:30:00Z", weightKg: 80 }],
      null,
    );
    expect(samples[0]?.dayKey).toBe("2026-06-22");
  });

  it("два записи, що в UTC один день, а в Kyiv різні — лишаються обидва", () => {
    const samples = selectBodyWeightSamples(
      [
        { id: "dl1", at: "2026-06-21T10:00:00Z", weightKg: 80 },
        { id: "dl2", at: "2026-06-21T21:30:00Z", weightKg: 81 },
      ],
      null,
    );
    expect(samples).toHaveLength(2);
    expect(samples.map((s) => s.dayKey)).toEqual(["2026-06-22", "2026-06-21"]);
  });

  it("ігнорує tombstone-записи в обох варіантах написання", () => {
    const samples = selectBodyWeightSamples(
      [
        {
          id: "dl1",
          at: "2026-06-22T08:00:00Z",
          weightKg: 80,
          deletedAt: "2026-06-23T08:00:00Z",
        },
      ],
      [
        {
          id: "m1",
          at: "2026-06-20T08:00:00Z",
          weightKg: 82,
          deleted_at: "2026-06-23T08:00:00Z",
        } as BodyWeightRecordInput,
      ],
    );
    expect(samples).toEqual([]);
    expect(hasAnyBodyWeightSample(null, null)).toBe(false);
  });

  it("приймає snake_case-форму сирого SQLite-рядка", () => {
    const samples = selectBodyWeightSamples(null, [
      {
        id: "m1",
        measured_at: "2026-06-22T08:00:00Z",
        weight_kg: "77.4",
      } as BodyWeightRecordInput,
    ]);
    expect(samples[0]?.weightKg).toBeCloseTo(77.4, 5);
    expect(samples[0]?.at).toBe("2026-06-22T08:00:00Z");
  });

  it("відкидає невалідні значення й дати, не ламаючи решту", () => {
    const samples = selectBodyWeightSamples(
      [
        { id: "bad-date", at: "не-дата", weightKg: 80 },
        { id: "no-weight", at: "2026-06-19T08:00:00Z", weightKg: null },
        { id: "negative", at: "2026-06-18T08:00:00Z", weightKg: -5 },
        { id: "ok", at: "2026-06-17T08:00:00Z", weightKg: 80 },
      ],
      undefined,
    );
    expect(samples.map((s) => s.id)).toEqual(["ok"]);
  });
});

describe("selectLatestBodyWeight", () => {
  it("повертає найсвіжіше зважування з обох сховищ", () => {
    const latest = selectLatestBodyWeight(
      [{ id: "dl1", at: "2026-06-20T08:00:00Z", weightKg: 82 }],
      [{ id: "m1", at: "2026-06-22T08:00:00Z", weightKg: 81 }],
    );
    expect(latest?.weightKg).toBe(81);
  });

  it("повертає null, коли даних немає взагалі", () => {
    expect(selectLatestBodyWeight(null, [])).toBeNull();
  });
});

describe("buildBodyWeightSeries", () => {
  it("віддає точки старішими зліва й ріже до limit", () => {
    const series = buildBodyWeightSeries(
      [
        { id: "dl1", at: "2026-06-18T08:00:00Z", weightKg: 84 },
        { id: "dl2", at: "2026-06-19T08:00:00Z", weightKg: 83 },
      ],
      [
        { id: "m1", at: "2026-06-20T08:00:00Z", weightKg: 82 },
        { id: "m2", at: "2026-06-21T08:00:00Z", weightKg: 81 },
      ],
      3,
    );
    expect(series.map((p) => p.value)).toEqual([83, 82, 81]);
    expect(series[0]?.label).not.toBe("");
  });
});

describe("toBodyWeightEntries", () => {
  it("проєктує семпли на measurement-подібні записи", () => {
    const entries = toBodyWeightEntries(
      selectBodyWeightSamples(
        [{ id: "dl1", at: "2026-06-20T08:00:00Z", weightKg: 82 }],
        null,
      ),
    );
    expect(entries).toEqual([
      { id: "dl1", at: "2026-06-20T08:00:00Z", weightKg: 82 },
    ]);
  });
});

describe("buildBodyWeightSummary / buildBodySummariesWithWeightUnion", () => {
  const NOW = "2026-06-22T12:00:00Z";

  it("рахує дельту по union-у, а не по одному сховищу", () => {
    const summary = buildBodyWeightSummary(
      [{ id: "dl1", at: "2026-06-18T08:00:00Z", weightKg: 84 }],
      [{ id: "m1", at: "2026-06-22T08:00:00Z", weightKg: 81 }],
      7,
      NOW,
    );
    expect(summary.latest).toBe(81);
    expect(summary.delta).toBe(-3);
    expect(summary.direction).toBe("down");
  });

  it("mobile Body бачить daily_log-історію (регресія, яку закриває стадія 1)", () => {
    const summaries = buildBodySummariesWithWeightUnion(
      [{ id: "dl1", at: "2026-06-22T08:00:00Z", weightKg: 79 }],
      [{ id: "m1", at: "2026-06-18T08:00:00Z", waistCm: 82 }],
      ["weightKg", "waistCm"],
      7,
      NOW,
    );
    expect(summaries.weightKg?.latest).toBe(79);
    // Не-вагові поля рахуються як і раніше — тільки з `measurements`.
    expect(summaries.waistCm?.latest).toBe(82);
  });

  it("не чіпає результат, коли weightKg не запитували", () => {
    const summaries = buildBodySummariesWithWeightUnion(
      [{ id: "dl1", at: "2026-06-22T08:00:00Z", weightKg: 79 }],
      [{ id: "m1", at: "2026-06-18T08:00:00Z", waistCm: 82 }],
      ["waistCm"],
      7,
      NOW,
    );
    expect(summaries.weightKg).toBeUndefined();
    expect(summaries.waistCm?.latest).toBe(82);
  });
});
