import { describe, expect, it } from "vitest";

import {
  APPLY_REJECT_REASONS,
  ENGINE_REJECT_REASONS,
  type AppliedStatus,
  type RejectReason,
  type SyncV2Outcome,
} from "./syncV2-types.js";

describe("syncV2 wire reason/type registries", () => {
  it("keeps apply-level reject reasons unique and label-safe", () => {
    // CodeRabbit PR #627: +1 `invalid_tz_offset_min` (tz_offset_min range
    // validation) — mirrors the count bump in `obs/metrics.test.ts`.
    // Спека fizruk-readiness-check: +1 `invalid_chosen_variant` — значення
    // поза переліком відкидається на рівні sync, а не доходить до CHECK у
    // міграції 134 і не стає 500-кою.
    expect(APPLY_REJECT_REASONS).toHaveLength(65);
    expect(new Set(APPLY_REJECT_REASONS).size).toBe(
      APPLY_REJECT_REASONS.length,
    );
    expect(APPLY_REJECT_REASONS).toEqual(
      expect.arrayContaining([
        "lww_conflict",
        "tombstoned",
        "missing_user_id",
        "invalid_delta",
        // Append-only ledger комори (W1-PANTRY-APPEND стадія 1).
        "invalid_event_kind",
        "missing_delta_or_abs",
        // Append-only журнал цілей КБЖВ (W1-KBJU-APPEND стадія 1).
        "invalid_goal_origin",
        // Pre-beta input-boundaries audit — unbounded name/label/note/text
        // fields in sync payloads.
        "text_too_long",
      ]),
    );
    for (const reason of APPLY_REJECT_REASONS) {
      expect(reason).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });

  it("keeps engine-level reject reasons unique and label-safe", () => {
    expect(ENGINE_REJECT_REASONS).toEqual([
      "clock_skew",
      "table_not_allowed",
      "apply_failed",
      "duplicate",
      "op_not_supported",
    ]);
    expect(new Set(ENGINE_REJECT_REASONS).size).toBe(
      ENGINE_REJECT_REASONS.length,
    );
  });

  it("accepts the exported discriminated status/outcome unions at compile time", () => {
    const rejected: AppliedStatus = {
      status: "rejected",
      reason: "missing_user_id",
    };
    const applied: AppliedStatus = { status: "applied" };
    const reason: RejectReason = "table_not_allowed";
    const outcomes: SyncV2Outcome[] = [
      "ok",
      "empty",
      "partial",
      "conflict",
      "invalid",
      "too_large",
      "unauthorized",
      "error",
    ];

    expect(rejected.reason).toBe("missing_user_id");
    expect(applied.status).toBe("applied");
    expect(reason).toBe("table_not_allowed");
    expect(outcomes).toHaveLength(8);
  });
});
