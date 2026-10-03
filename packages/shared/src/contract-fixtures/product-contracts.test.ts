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

function withPatched<T extends object, K extends keyof T>(
  target: T,
  key: K,
  value: T[K],
  assertion: () => void,
): void {
  const original = target[key];
  target[key] = value;
  try {
    assertion();
  } finally {
    target[key] = original;
  }
}

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

  it("rejects parse-pantry fixtures with invalid item payloads", () => {
    const fixture = parsePantryFixtures.twoItemsWithQty as { items: unknown };
    withPatched(fixture, "items", "not-an-array", () => {
      expect(() => assertParsePantryFixturesValid()).toThrow(/items/);
    });

    const namedItem = parsePantryFixtures.twoItemsWithQty.items[0] as {
      name: unknown;
    };
    withPatched(namedItem, "name", "", () => {
      expect(() => assertParsePantryFixturesValid()).toThrow(/non-empty/);
    });

    const item = parsePantryFixtures.twoItemsWithQty.items[0] as {
      qty: unknown;
    };
    withPatched(item, "qty", "1", () => {
      expect(() => assertParsePantryFixturesValid()).toThrow(/item\.qty/);
    });

    const rawTextFixture = parsePantryFixtures.twoItemsWithQty as {
      rawText: unknown;
    };
    withPatched(rawTextFixture, "rawText", 42, () => {
      expect(() => assertParsePantryFixturesValid()).toThrow(/rawText/);
    });
  });

  it("rejects sync-v2 fixtures that leak non-number cursors or ids", () => {
    const push = syncV2PushFixtures.pushAllApplied as { accepted: unknown };
    withPatched(push, "accepted", "2", () => {
      expect(() => assertSyncV2FixturesValid()).toThrow(/accepted/);
    });

    const pushCursor = syncV2PushFixtures.pushAllApplied as {
      last_op_id: unknown;
    };
    withPatched(pushCursor, "last_op_id", "1042", () => {
      expect(() => assertSyncV2FixturesValid()).toThrow(/last_op_id/);
    });

    const pushResults = syncV2PushFixtures.pushAllApplied as {
      results: unknown;
    };
    withPatched(pushResults, "results", null, () => {
      expect(() => assertSyncV2FixturesValid()).toThrow(/results/);
    });

    const pull = syncV2PullFixtures.pullFirstPage as { ops: unknown };
    withPatched(pull, "ops", "not-an-array", () => {
      expect(() => assertSyncV2FixturesValid()).toThrow(/ops/);
    });

    const op = syncV2PullFixtures.pullFirstPage.ops[0] as { id: unknown };
    withPatched(op, "id", "1001", () => {
      expect(() => assertSyncV2FixturesValid()).toThrow(/op\.id/);
    });

    const pullCursor = syncV2PullFixtures.pullFirstPage as {
      next_cursor: unknown;
    };
    withPatched(pullCursor, "next_cursor", "1002", () => {
      expect(() => assertSyncV2FixturesValid()).toThrow(/next_cursor/);
    });
  });

  it("rejects schema-backed fixtures when their envelopes drift", () => {
    const authUser = authActiveFixtures.webCookieSession.user as {
      email: unknown;
    };
    withPatched(authUser, "email", "not-an-email", () => {
      expect(() => assertAuthFixturesValid()).toThrow(/auth\.active/);
    });

    const barcodeProduct = barcodeSuccessFixtures.offFull.product as {
      name: unknown;
    };
    withPatched(barcodeProduct, "name", "", () => {
      expect(() => assertBarcodeFixturesValid()).toThrow(/barcode\.success/);
    });

    const barcodeError = barcodeErrorFixtures.badRequest as { error: unknown };
    withPatched(barcodeError, "error", "", () => {
      expect(() => assertBarcodeFixturesValid()).toThrow(/barcode\.error/);
    });

    const cspReport = cspReportFixtures.legacyEnvelope as {
      "csp-report": unknown;
    };
    withPatched(cspReport, "csp-report", null, () => {
      expect(() => assertCspReportFixturesValid()).toThrow(/csp-report/);
    });

    const foodProduct = foodSearchSuccessFixtures.offSingleHit.products[0] as {
      id: unknown;
    };
    withPatched(foodProduct, "id", "", () => {
      expect(() => assertFoodSearchFixturesValid()).toThrow(
        /food-search\.success/,
      );
    });

    const foodError = foodSearchErrorFixtures.serverError as { error: unknown };
    withPatched(foodError, "error", "", () => {
      expect(() => assertFoodSearchFixturesValid()).toThrow(
        /food-search\.error/,
      );
    });

    const cashflow = finykCashflowFixtures.singleExpense as {
      nextCursor: unknown;
    };
    withPatched(cashflow, "nextCursor", 123, () => {
      expect(() => assertFinykCashflowFixturesValid()).toThrow(
        /finyk-cashflow/,
      );
    });
  });
});
