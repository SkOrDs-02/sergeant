import { describe, expect, it } from "vitest";
import { ManualExpenseCreateResponseSchema } from "@sergeant/shared";
import { serializeManualExpense } from "./manualExpenses.js";

const CREATED_AT = new Date("2026-06-11T10:00:00.000Z");
const UPDATED_AT = new Date("2026-06-11T11:00:00.000Z");

const BASE_BLOB = {
  id: "0b7e6c3a-7e0f-4b59-9b39-2f4f7f6f9d11",
  date: "2026-06-11",
  description: "кава",
  amount: 120, // hryvnyas (major units stored in blob)
  category: "food",
};

function makeRow(
  blobOverride?: Partial<typeof BASE_BLOB>,
  rowOverride?: { created_at?: Date; updated_at?: Date },
) {
  return {
    id: BASE_BLOB.id,
    data_json: { ...BASE_BLOB, ...blobOverride },
    created_at: rowOverride?.created_at ?? CREATED_AT,
    updated_at: rowOverride?.updated_at ?? UPDATED_AT,
  };
}

describe("serializeManualExpense — contract fixture (Hard Rule #3)", () => {
  it("converts blob.amount hryvnyas to amountKopiykas (×100)", () => {
    expect(serializeManualExpense(makeRow()).amountKopiykas).toBe(12000);
  });

  it("maps description field to note", () => {
    expect(serializeManualExpense(makeRow()).note).toBe("кава");
  });

  it("formats Date objects to ISO strings", () => {
    const result = serializeManualExpense(makeRow());
    expect(result.createdAt).toBe("2026-06-11T10:00:00.000Z");
    expect(result.updatedAt).toBe("2026-06-11T11:00:00.000Z");
  });

  it("parses data_json when pg returns it as a raw JSON string", () => {
    const row = {
      id: BASE_BLOB.id,
      data_json: JSON.stringify(BASE_BLOB),
      created_at: CREATED_AT,
      updated_at: UPDATED_AT,
    };
    expect(serializeManualExpense(row).amountKopiykas).toBe(12000);
  });

  it("rounds float kopiykas to avoid 0.1 + 0.2 drift", () => {
    // 0.1 + 0.2 = 0.30000000000000004 in IEEE-754; × 100 = 30.000000000000004
    const result = serializeManualExpense(makeRow({ amount: 0.1 + 0.2 }));
    expect(Number.isInteger(result.amountKopiykas)).toBe(true);
    expect(result.amountKopiykas).toBe(30);
  });

  it("output passes ManualExpenseCreateResponseSchema — contract triplet anchor", () => {
    const expense = serializeManualExpense(makeRow());
    expect(() =>
      ManualExpenseCreateResponseSchema.parse({ ok: true, expense }),
    ).not.toThrow();
  });

  it("full shape matches the api-client EXPENSE_FIXTURE", () => {
    expect(serializeManualExpense(makeRow())).toEqual({
      id: "0b7e6c3a-7e0f-4b59-9b39-2f4f7f6f9d11",
      amountKopiykas: 12000,
      category: "food",
      date: "2026-06-11",
      note: "кава",
      createdAt: "2026-06-11T10:00:00.000Z",
      updatedAt: "2026-06-11T11:00:00.000Z",
    });
  });
});
