import { describe, expect, it } from "vitest";
import { SyncV2PushSchema } from "@sergeant/shared";

import {
  NUTRITION_PREFS_MERGE_FIELD,
  type NutritionPrefsSyncRow,
  type SyncV2PushOp,
} from "./syncV2";

/**
 * Контракт data-04 (Hard Rule #3): клієнтський тип `NutritionPrefsSyncRow` і
 * серверна схема пуша (`SyncV2PushSchema`) приймають патч `prefs_merge`, а
 * ім'я прапорця — одне джерело (`@sergeant/shared`), яке читає й applier.
 */
describe("nutrition_prefs prefs_merge: контракт sync v2", () => {
  it("прапорець зветься prefs_merge", () => {
    expect(NUTRITION_PREFS_MERGE_FIELD).toBe("prefs_merge");
  });

  it("op із патчем проходить серверну схему пуша", () => {
    const row: NutritionPrefsSyncRow = {
      user_id: "user-1",
      prefs_json: { waterGoalMl: 2750 },
      prefs_merge: true,
    };
    const op: SyncV2PushOp = {
      table: "nutrition_prefs",
      op: "update",
      row: { ...row },
      client_ts: "2026-10-20T10:00:00.000Z",
      idempotency_key: "idem-prefs-1",
    };
    const parsed = SyncV2PushSchema.safeParse({ ops: [op] });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.ops[0]?.row[NUTRITION_PREFS_MERGE_FIELD]).toBe(true);
    }
  });

  it("op старого клієнта (без прапорця, рядковий prefs_json) теж валідний", () => {
    const row: NutritionPrefsSyncRow = {
      user_id: "user-1",
      prefs_json: '{"waterGoalMl":2000}',
    };
    const parsed = SyncV2PushSchema.safeParse({
      ops: [
        {
          table: "nutrition_prefs",
          op: "update",
          row,
          client_ts: "2026-10-20T10:00:00.000Z",
          idempotency_key: "idem-prefs-2",
        },
      ],
    });
    expect(parsed.success).toBe(true);
  });
});
