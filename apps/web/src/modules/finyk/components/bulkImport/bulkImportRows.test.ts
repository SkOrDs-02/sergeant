import { describe, expect, it } from "vitest";
import type {
  ImportScreenshotRow,
  ImportStatementRow,
} from "@sergeant/api-client";
import {
  applyBulkCategory,
  screenshotRowsToBulkReviewRows,
  selectedRowCount,
  setAllSelected,
  statementRowsToBulkReviewRows,
  toCommitRows,
  toggleRowSelected,
  updateRowField,
} from "./bulkImportRows";

const defaultCategoryFor = (direction: "expense" | "income") =>
  direction === "income" ? "salary" : "other";

describe("screenshotRowsToBulkReviewRows / statementRowsToBulkReviewRows", () => {
  const screenshotRows: ImportScreenshotRow[] = [
    {
      date: "2026-08-01",
      time: "10:00",
      amountKopiykas: 15000,
      direction: "expense",
      description: "Сільпо",
      confidence: 0.92,
    },
    {
      date: "2026-08-02",
      time: null,
      amountKopiykas: 500000,
      direction: "income",
      description: "Зарплата",
      confidence: 0.8,
    },
  ];

  it("maps screenshot rows and defaults income rows to unselected (expense stays selected)", () => {
    const rows = screenshotRowsToBulkReviewRows(
      screenshotRows,
      defaultCategoryFor,
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      date: "2026-08-01",
      description: "Сільпо",
      amountKopiykas: 15000,
      direction: "expense",
      category: "other",
      confidence: 0.92,
      selected: true,
    });
    expect(rows[1]).toMatchObject({
      direction: "income",
      selected: false,
      category: "salary",
    });
  });

  it("maps statement rows with confidence always null", () => {
    const statementRows: ImportStatementRow[] = [
      {
        date: "2026-08-03",
        amountKopiykas: 25000,
        direction: "expense",
        description: "АТБ",
      },
    ];
    const rows = statementRowsToBulkReviewRows(
      statementRows,
      defaultCategoryFor,
    );
    expect(rows[0]).toMatchObject({ confidence: null, selected: true });
  });

  it("assigns stable, distinct ids per row", () => {
    const rows = screenshotRowsToBulkReviewRows(
      screenshotRows,
      defaultCategoryFor,
    );
    expect(new Set(rows.map((r) => r.id)).size).toBe(2);
  });
});

describe("toggleRowSelected / setAllSelected", () => {
  const base = screenshotRowsToBulkReviewRows(
    [
      {
        date: "2026-08-01",
        time: null,
        amountKopiykas: 100,
        direction: "expense",
        description: "a",
        confidence: 1,
      },
      {
        date: "2026-08-01",
        time: null,
        amountKopiykas: 200,
        direction: "expense",
        description: "b",
        confidence: 1,
      },
    ],
    defaultCategoryFor,
  );

  it("toggles exactly the targeted row", () => {
    const next = toggleRowSelected(base, base[0]!.id);
    expect(next[0]?.selected).toBe(false);
    expect(next[1]?.selected).toBe(true);
  });

  it("setAllSelected(false) unchecks every row; setAllSelected(true) checks every row", () => {
    expect(setAllSelected(base, false).every((r) => !r.selected)).toBe(true);
    expect(setAllSelected(base, true).every((r) => r.selected)).toBe(true);
  });
});

describe("applyBulkCategory", () => {
  const rows = screenshotRowsToBulkReviewRows(
    [
      {
        date: "2026-08-01",
        time: null,
        amountKopiykas: 100,
        direction: "expense",
        description: "a",
        confidence: 1,
      },
      {
        date: "2026-08-01",
        time: null,
        amountKopiykas: 200,
        direction: "expense",
        description: "b",
        confidence: 1,
      },
    ],
    defaultCategoryFor,
  );

  it("applies the category only to SELECTED rows by default", () => {
    const withOneUnselected = toggleRowSelected(rows, rows[1]!.id);
    const next = applyBulkCategory(withOneUnselected, "groceries");
    expect(next[0]?.category).toBe("groceries");
    expect(next[1]?.category).toBe("other"); // untouched — was deselected
  });

  it("applies to every row when onlySelected=false", () => {
    const withOneUnselected = toggleRowSelected(rows, rows[1]!.id);
    const next = applyBulkCategory(withOneUnselected, "groceries", false);
    expect(next.every((r) => r.category === "groceries")).toBe(true);
  });
});

describe("updateRowField", () => {
  it("patches only the targeted row's editable fields", () => {
    const rows = screenshotRowsToBulkReviewRows(
      [
        {
          date: "2026-08-01",
          time: null,
          amountKopiykas: 100,
          direction: "expense",
          description: "a",
          confidence: 1,
        },
      ],
      defaultCategoryFor,
    );
    const next = updateRowField(rows, rows[0]!.id, {
      description: "виправлено",
      amountKopiykas: 999,
    });
    expect(next[0]).toMatchObject({
      description: "виправлено",
      amountKopiykas: 999,
    });
  });
});

describe("selectedRowCount / toCommitRows", () => {
  const rows = screenshotRowsToBulkReviewRows(
    [
      {
        date: "2026-08-01",
        time: null,
        amountKopiykas: 100,
        direction: "expense",
        description: "a",
        confidence: 1,
      },
      {
        date: "2026-08-02",
        time: null,
        amountKopiykas: 500000,
        direction: "income",
        description: "b",
        confidence: 1,
      },
    ],
    defaultCategoryFor,
  );

  it("counts only selected rows", () => {
    expect(selectedRowCount(rows)).toBe(1); // income row starts unselected
  });

  it("toCommitRows emits ONLY the selected rows, in ImportCommitRow shape", () => {
    const commitRows = toCommitRows(rows);
    expect(commitRows).toEqual([
      {
        date: "2026-08-01",
        amountKopiykas: 100,
        direction: "expense",
        description: "a",
        category: "other",
      },
    ]);
  });

  it("toCommitRows includes an income row once it's selected", () => {
    const withIncomeSelected = toggleRowSelected(rows, rows[1]!.id);
    expect(toCommitRows(withIncomeSelected)).toHaveLength(2);
  });
});
