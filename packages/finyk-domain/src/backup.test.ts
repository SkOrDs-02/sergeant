import { describe, expect, it } from "vitest";

import {
  DEFAULT_FINYK_MONTHLY_PLAN,
  FINYK_BACKUP_VERSION,
  FINYK_FIELD_TO_STORAGE_KEY,
  normalizeFinykBackup,
} from "./backup.js";
import { FINYK_BACKUP_STORAGE_KEYS } from "./storageKeys.js";

describe("FINYK_BACKUP_VERSION", () => {
  it("is a positive integer", () => {
    expect(Number.isInteger(FINYK_BACKUP_VERSION)).toBe(true);
    expect(FINYK_BACKUP_VERSION).toBeGreaterThan(0);
  });
});

describe("DEFAULT_FINYK_MONTHLY_PLAN", () => {
  it("exposes income/expense/savings with empty string defaults", () => {
    expect(DEFAULT_FINYK_MONTHLY_PLAN).toEqual({
      income: "",
      expense: "",
      savings: "",
    });
  });
});

describe("FINYK_FIELD_TO_STORAGE_KEY", () => {
  it("mirrors FINYK_BACKUP_STORAGE_KEYS 1:1", () => {
    expect(FINYK_FIELD_TO_STORAGE_KEY).toBe(FINYK_BACKUP_STORAGE_KEYS);
  });

  it("contains all backup-relevant fields with finyk_ prefix", () => {
    for (const [field, key] of Object.entries(FINYK_FIELD_TO_STORAGE_KEY)) {
      expect(key.startsWith("finyk_")).toBe(true);
      expect(field).toBeTruthy();
    }
  });
});

describe("normalizeFinykBackup", () => {
  it("rejects non-object input", () => {
    expect(() => normalizeFinykBackup(null)).toThrow(
      /Файл має містити JSON-обʼєкт/,
    );
    expect(() => normalizeFinykBackup("hello")).toThrow(
      /Файл має містити JSON-обʼєкт/,
    );
    expect(() => normalizeFinykBackup([])).toThrow(
      /Файл має містити JSON-обʼєкт/,
    );
  });

  it("rejects empty object", () => {
    expect(() => normalizeFinykBackup({})).toThrow(/Порожній обʼєкт/);
  });

  it("rejects out-of-range version", () => {
    expect(() => normalizeFinykBackup({ version: 0, budgets: [] })).toThrow(
      /Невідома версія бекапу/,
    );
    expect(() => normalizeFinykBackup({ version: 1000, budgets: [] })).toThrow(
      /Невідома версія бекапу/,
    );
  });

  it("keeps arrays and drops undefined fields", () => {
    const out = normalizeFinykBackup({
      version: FINYK_BACKUP_VERSION,
      budgets: [{ id: "food", limit: 100 }],
      subscriptions: [],
    });
    expect(out.budgets).toEqual([{ id: "food", limit: 100 }]);
    expect(out.subscriptions).toEqual([]);
    expect(out.manualAssets).toBeUndefined();
  });

  it("rejects non-array arrays", () => {
    expect(() => normalizeFinykBackup({ version: 1, budgets: "oops" })).toThrow(
      /має бути масивом/,
    );
  });

  it("rejects non-object monthlyPlan", () => {
    expect(() => normalizeFinykBackup({ version: 1, monthlyPlan: [] })).toThrow(
      /monthlyPlan/,
    );
  });

  it("rejects malformed networthHistory rows", () => {
    expect(() =>
      normalizeFinykBackup({
        version: 1,
        networthHistory: [{ month: 123 }],
      }),
    ).toThrow(/networthHistory/);
  });

  it("rejects malformed customCategories rows", () => {
    expect(() =>
      normalizeFinykBackup({
        version: 1,
        customCategories: [{ id: "ok" }],
      }),
    ).toThrow(/customCategories/);
    expect(() =>
      normalizeFinykBackup({
        version: 1,
        customCategories: [{ id: "ok", label: "Ok" }],
      }),
    ).not.toThrow();
  });

  it("rejects non-string dismissedRecurring entries", () => {
    expect(() =>
      normalizeFinykBackup({
        version: 1,
        dismissedRecurring: [1, 2],
      }),
    ).toThrow(/dismissedRecurring/);
  });
});

describe("excludedStatTxIds round-trip", () => {
  it("survives normalizeFinykBackup export→import", () => {
    const out = normalizeFinykBackup({
      version: FINYK_BACKUP_VERSION,
      excludedStatTxIds: ["tx-1", "tx-2"],
    });
    expect(out.excludedStatTxIds).toEqual(["tx-1", "tx-2"]);
  });
});

describe("normalizeFinykBackup — txNotes (аудит 2026-10-01, data-27)", () => {
  it("мапить txNotes на LS-ключ finyk_tx_notes", () => {
    expect(FINYK_BACKUP_STORAGE_KEYS.txNotes).toBe("finyk_tx_notes");
  });

  it("пропускає мапу string→string", () => {
    const out = normalizeFinykBackup({
      version: FINYK_BACKUP_VERSION,
      txNotes: { "tx-1": "оренда" },
    });
    expect(out.txNotes).toEqual({ "tx-1": "оренда" });
  });

  it("старий бекап без txNotes проходить", () => {
    const out = normalizeFinykBackup({ version: 2, budgets: [] });
    expect(out.txNotes).toBeUndefined();
  });

  it("відхиляє масив і нерядкові значення", () => {
    expect(() => normalizeFinykBackup({ version: 3, txNotes: [] })).toThrow(
      /обʼєктом/,
    );
    expect(() =>
      normalizeFinykBackup({ version: 3, txNotes: { a: 5 } }),
    ).toThrow(/txNotes/);
  });
});
