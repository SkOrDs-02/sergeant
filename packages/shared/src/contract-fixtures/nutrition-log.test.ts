import { describe, expect, it } from "vitest";
import {
  assertNutritionLogFixturesValid,
  nutritionLogPushOpFixtures,
  nutritionLogPushOpRawFixtures,
  nutritionLogPushResponseFixtures,
  nutritionLogPushResponseRawFixtures,
  type NutritionLogPushOpFixture,
  type NutritionLogPushResponseFixture,
  type NutritionMealRowFixture,
} from "./nutrition-log";

function withPatched<T extends object, K extends keyof T>(
  target: T,
  key: K,
  value: T[K],
  assertion: () => void,
): void {
  const hadKey = Object.prototype.hasOwnProperty.call(target, key);
  const original = target[key];
  target[key] = value;
  try {
    assertion();
  } finally {
    if (hadKey) {
      target[key] = original;
    } else {
      delete target[key];
    }
  }
}

describe("nutrition-log contract fixtures", () => {
  it("passes the canonical self-check", () => {
    expect(() => assertNutritionLogFixturesValid()).not.toThrow();
  });

  it("exposes raw push-op and response views for runtime parsers", () => {
    expect(nutritionLogPushOpRawFixtures.insertFullMacros).toBe(
      nutritionLogPushOpFixtures.insertFullMacros,
    );
    expect(nutritionLogPushOpRawFixtures.softDelete).toBe(
      nutritionLogPushOpFixtures.softDelete,
    );
    expect(nutritionLogPushResponseRawFixtures.allApplied).toBe(
      nutritionLogPushResponseFixtures.allApplied,
    );
    expect(nutritionLogPushResponseRawFixtures.rejected).toBe(
      nutritionLogPushResponseFixtures.rejected,
    );
  });

  it("rejects invalid push-op envelopes", () => {
    const fixture =
      nutritionLogPushOpFixtures.insertFullMacros as NutritionLogPushOpFixture;

    withPatched(
      fixture,
      "table",
      "wrong_table" as NutritionLogPushOpFixture["table"],
      () => {
        expect(() => assertNutritionLogFixturesValid()).toThrow(
          /table.*nutrition_meals/,
        );
      },
    );

    withPatched(
      fixture,
      "op",
      "upsert" as NutritionLogPushOpFixture["op"],
      () => {
        expect(() => assertNutritionLogFixturesValid()).toThrow(
          /op.*insert\|update\|delete/,
        );
      },
    );

    withPatched(
      fixture,
      "idempotency_key",
      42 as unknown as NutritionLogPushOpFixture["idempotency_key"],
      () => {
        expect(() => assertNutritionLogFixturesValid()).toThrow(
          /idempotency_key.*string/,
        );
      },
    );
  });

  it("rejects invalid nutrition meal rows", () => {
    const row = nutritionLogPushOpFixtures.insertFullMacros
      .row as NutritionMealRowFixture;

    withPatched(row, "id", "", () => {
      expect(() => assertNutritionLogFixturesValid()).toThrow(
        /row\.id.*non-empty string/,
      );
    });

    withPatched(row, "user_id", "", () => {
      expect(() => assertNutritionLogFixturesValid()).toThrow(
        /row\.user_id.*non-empty string/,
      );
    });

    withPatched(row, "eaten_at", "", () => {
      expect(() => assertNutritionLogFixturesValid()).toThrow(
        /row\.eaten_at.*non-empty ISO-8601 string/,
      );
    });
  });

  it("rejects invalid push responses", () => {
    const response =
      nutritionLogPushResponseFixtures.allApplied as NutritionLogPushResponseFixture;

    withPatched(
      response,
      "accepted",
      "1" as unknown as NutritionLogPushResponseFixture["accepted"],
      () => {
        expect(() => assertNutritionLogFixturesValid()).toThrow(
          /accepted.*number/,
        );
      },
    );

    withPatched(
      response,
      "last_op_id",
      "2001" as unknown as NutritionLogPushResponseFixture["last_op_id"],
      () => {
        expect(() => assertNutritionLogFixturesValid()).toThrow(
          /last_op_id.*number/,
        );
      },
    );

    withPatched(
      response,
      "results",
      null as unknown as NutritionLogPushResponseFixture["results"],
      () => {
        expect(() => assertNutritionLogFixturesValid()).toThrow(
          /results.*array/,
        );
      },
    );
  });
});
