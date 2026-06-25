import { describe, expect, it } from "vitest";
import {
  assertAuthFixturesValid,
  authActiveFixtures,
  authLoggedOutFixture,
} from "./auth";
import {
  assertBarcodeFixturesValid,
  barcodeErrorFixtures,
  barcodeSuccessFixtures,
} from "./barcode";
import {
  assertCspReportFixturesValid,
  cspReportFixtureSchemas,
  cspReportFixtures,
} from "./cspReport";
import {
  assertFinykCashflowFixturesValid,
  finykCashflowFixtures,
} from "./finyk-cashflow";
import {
  assertFoodSearchFixturesValid,
  foodSearchErrorFixtures,
  foodSearchSuccessFixtures,
} from "./food-search";
import {
  assertParsePantryFixturesValid,
  parsePantryFixtures,
} from "./parse-pantry";
import {
  assertSyncV2FixturesValid,
  syncV2PullFixtures,
  syncV2PushFixtures,
} from "./sync-v2";

describe("product contract fixtures", () => {
  it("validates auth, csp, and sync-v2 fixtures", () => {
    expect(() => assertAuthFixturesValid()).not.toThrow();
    expect(authLoggedOutFixture).toBeNull();
    expect(Object.keys(authActiveFixtures)).toEqual([
      "webCookieSession",
      "bearerMobileSession",
      "unverifiedEmailSession",
    ]);

    expect(() => assertCspReportFixturesValid()).not.toThrow();
    for (const [name, fixture] of Object.entries(cspReportFixtures)) {
      const schema =
        cspReportFixtureSchemas[name as keyof typeof cspReportFixtureSchemas];
      expect(schema.safeParse(fixture).success).toBe(true);
    }

    expect(() => assertSyncV2FixturesValid()).not.toThrow();
    expect(syncV2PushFixtures.pushAllApplied.accepted).toBe(2);
    expect(syncV2PullFixtures.pullFirstPage.next_cursor).toBe(1002);
  });

  it("validates nutrition and finyk wire fixtures", () => {
    expect(() => assertBarcodeFixturesValid()).not.toThrow();
    expect(barcodeSuccessFixtures.upcitemdbPartial.product.partial).toBe(true);
    expect(barcodeErrorFixtures.badRequest.error).toContain("barcode");

    expect(() => assertFoodSearchFixturesValid()).not.toThrow();
    expect(foodSearchSuccessFixtures.multiSource.products).toHaveLength(2);
    expect(foodSearchErrorFixtures.upstreamTimeout.error).toBeTruthy();

    expect(() => assertParsePantryFixturesValid()).not.toThrow();
    expect(parsePantryFixtures.twoItemsWithQty.items[0]?.qty).toBe(1);

    expect(() => assertFinykCashflowFixturesValid()).not.toThrow();
    expect(
      finykCashflowFixtures.twoTransactionsWithCursor.nextCursor,
    ).toContain("tx-pact-0004");
  });
});
