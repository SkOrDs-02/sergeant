import { describe, it, expect } from "vitest";
import {
  normalizeFinykBackup,
  normalizeFinykSyncPayload,
  FINYK_BACKUP_VERSION,
} from "./finykBackup";

describe("normalizeFinykBackup", () => {
  it("приймає мінімальний v1 без додаткових полів", () => {
    expect(normalizeFinykBackup({ version: 1, budgets: [] })).toEqual({
      budgets: [],
    });
  });

  it("приймає повний v2", () => {
    const full: Record<string, unknown> = {
      version: FINYK_BACKUP_VERSION,
      budgets: [] as unknown[],
      subscriptions: [] as unknown[],
      manualAssets: [] as unknown[],
      manualDebts: [] as unknown[],
      receivables: [] as unknown[],
      hiddenAccounts: [] as unknown[],
      hiddenTxIds: [] as unknown[],
      monthlyPlan: { income: "", expense: "", savings: "" },
      txCategories: { a: "b" },
      txSplits: {},
      monoDebtLinkedTxIds: {},
      networthHistory: [{ month: "2026-01", networth: 100 }],
      customCategories: [{ id: "cus_x", label: "Моя" }],
    };
    expect(normalizeFinykBackup(full)).toMatchObject({
      txCategories: { a: "b" },
      networthHistory: [{ month: "2026-01", networth: 100 }],
      customCategories: [{ id: "cus_x", label: "Моя" }],
    });
  });

  it("відхиляє txCategories-масив", () => {
    expect(() =>
      normalizeFinykBackup({ version: 2, txCategories: [] }),
    ).toThrow(/об'єктом/);
  });
});

describe("normalizeFinykSyncPayload", () => {
  it("розгортає компактний v3 і валідує поля", () => {
    const compact: Record<string, unknown> = {
      v: 3,
      b: [] as unknown[],
      s: [] as unknown[],
      a: [] as unknown[],
      d: [] as unknown[],
      r: [] as unknown[],
      mp: { income: "", expense: "", savings: "" },
      tc: { x: "y" },
      ts: {},
      md: {},
      nh: [{ month: "2026-01", networth: 1 }],
      cc: [{ id: "cus_a", label: "Тест" }],
    };
    expect(normalizeFinykSyncPayload(compact)).toMatchObject({
      txCategories: { x: "y" },
      networthHistory: [{ month: "2026-01", networth: 1 }],
      customCategories: [{ id: "cus_a", label: "Тест" }],
    });
  });

  it("приймає повний бекап як у файлі", () => {
    expect(normalizeFinykSyncPayload({ version: 1, budgets: [] })).toEqual({
      budgets: [],
    });
  });

  it("відхиляє зіпсований компактний tc", () => {
    expect(() => normalizeFinykSyncPayload({ v: 3, b: [], tc: [] })).toThrow(
      /об'єктом/,
    );
  });
});
