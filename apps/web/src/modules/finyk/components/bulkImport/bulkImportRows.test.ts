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

/** Той самий контракт, що й у `BulkImportSheet`: підказка сервера
 * приймається лише коли пікер справді має такий чип. */
const KNOWN_EXPENSE = new Set(["food", "cafe", "transport", "other"]);
const KNOWN_INCOME = new Set(["salary", "refund", "other-income"]);
const rowOptions = {
  defaultCategoryFor,
  isKnownCategory: (slug: string, direction: "expense" | "income") =>
    direction === "income" ? KNOWN_INCOME.has(slug) : KNOWN_EXPENSE.has(slug),
};

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
    const rows = screenshotRowsToBulkReviewRows(screenshotRows, rowOptions);
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
    const rows = statementRowsToBulkReviewRows(statementRows, rowOptions);
    expect(rows[0]).toMatchObject({ confidence: null, selected: true });
  });

  it("assigns stable, distinct ids per row", () => {
    const rows = screenshotRowsToBulkReviewRows(screenshotRows, rowOptions);
    expect(new Set(rows.map((r) => r.id)).size).toBe(2);
  });

  it("transferLikely-витрата знята з вибору за замовчуванням (переказ на власну банку — не витрата)", () => {
    const rows = statementRowsToBulkReviewRows(
      [
        {
          date: "2026-08-12",
          amountKopiykas: 500000,
          direction: "expense",
          description: "Поповнення «просто»",
          transferLikely: true,
        },
        {
          date: "2026-08-14",
          amountKopiykas: 12000,
          direction: "expense",
          description: "АТБ-Маркет",
        },
      ],
      rowOptions,
    );
    expect(rows[0]).toMatchObject({ transferLikely: true, selected: false });
    expect(rows[1]).toMatchObject({ transferLikely: false, selected: true });
    // Рядок видимий і вмикається одним тапом — детектор лише знімає
    // галочку, нічого не ховає.
    const next = toggleRowSelected(rows, rows[0]!.id);
    expect(next[0]?.selected).toBe(true);
  });

  it("transferLikely працює і для скрін-рядків (спільна серверна розмітка)", () => {
    const rows = screenshotRowsToBulkReviewRows(
      [
        {
          date: "2026-08-13",
          time: null,
          amountKopiykas: 35000,
          direction: "expense",
          description: "Поповнення «просто»",
          confidence: 0.9,
          transferLikely: true,
        },
      ],
      rowOptions,
    );
    expect(rows[0]).toMatchObject({ transferLikely: true, selected: false });
  });

  it("duplicateLikely-витрата знята з вибору за замовчуванням («сітка 2»: схожий запис уже збережено)", () => {
    const rows = statementRowsToBulkReviewRows(
      [
        {
          date: "2026-08-17",
          amountKopiykas: 84750,
          direction: "expense",
          description: "Сільпо",
          duplicateLikely: true,
        },
        {
          date: "2026-08-18",
          amountKopiykas: 12000,
          direction: "expense",
          description: "АТБ-Маркет",
        },
      ],
      rowOptions,
    );
    expect(rows[0]).toMatchObject({ duplicateLikely: true, selected: false });
    expect(rows[1]).toMatchObject({ duplicateLikely: false, selected: true });
    // Як і transferLikely: рядок видимий, вмикається одним тапом.
    const next = toggleRowSelected(rows, rows[0]!.id);
    expect(next[0]?.selected).toBe(true);
  });

  it("duplicateLikely працює і для скрін-рядків (головний споживач — повторний скрін)", () => {
    const rows = screenshotRowsToBulkReviewRows(
      [
        {
          date: "2026-08-17",
          time: "10:00",
          amountKopiykas: 9500,
          direction: "expense",
          description: "Кава",
          confidence: 0.9,
          duplicateLikely: true,
        },
      ],
      rowOptions,
    );
    expect(rows[0]).toMatchObject({ duplicateLikely: true, selected: false });
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
    rowOptions,
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
    rowOptions,
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

  it("never overwrites an income row's category, even when selected and onlySelected=false", () => {
    const mixed = [
      ...rows,
      ...screenshotRowsToBulkReviewRows(
        [
          {
            date: "2026-08-02",
            time: null,
            amountKopiykas: 500000,
            direction: "income",
            description: "salary",
            confidence: 1,
          },
        ],
        rowOptions,
      ),
    ];
    // Force the income row selected too — the guard must hold regardless of
    // selection state, not just because it's normally deselected by default.
    const allSelected = mixed.map((r) => ({ ...r, selected: true }));

    const next = applyBulkCategory(allSelected, "groceries", false);

    const incomeRow = next.find((r) => r.direction === "income");
    expect(incomeRow?.category).toBe("salary"); // untouched
    expect(
      next
        .filter((r) => r.direction === "expense")
        .every((r) => r.category === "groceries"),
    ).toBe(true);
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
      rowOptions,
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
    rowOptions,
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

describe("categoryHint — підказка категорії від сервера", () => {
  const base = {
    date: "2026-08-16",
    amountKopiykas: 1000,
    description: "Сільпо",
  } as const;

  it("бере підказку замість дефолту", () => {
    const [row] = statementRowsToBulkReviewRows(
      [{ ...base, direction: "expense", categoryHint: "food" }],
      rowOptions,
    );
    expect(row?.category).toBe("food");
  });

  it("без підказки лишається дефолт", () => {
    const [row] = statementRowsToBulkReviewRows(
      [{ ...base, direction: "expense" }],
      rowOptions,
    );
    expect(row?.category).toBe("other");
  });

  it("ігнорує слаг, якого пікер не знає", () => {
    // Сервер не знає ні про власні категорії користувача, ні про те, що
    // набори чипів витрат і надходжень різні. Невідомий слаг намалював
    // би порожній чип — тож тихо падаємо на дефолт.
    const [row] = statementRowsToBulkReviewRows(
      [{ ...base, direction: "expense", categoryHint: "нема-такого" }],
      rowOptions,
    );
    expect(row?.category).toBe("other");
  });

  it("ігнорує витратний слаг у рядку надходження", () => {
    const [row] = statementRowsToBulkReviewRows(
      [{ ...base, direction: "income", categoryHint: "food" }],
      rowOptions,
    );
    expect(row?.category).toBe("salary");
  });

  it("той самий контракт для рядків скріна", () => {
    const [row] = screenshotRowsToBulkReviewRows(
      [
        {
          ...base,
          direction: "expense",
          time: null,
          confidence: 0.9,
          categoryHint: "cafe",
        },
      ],
      rowOptions,
    );
    expect(row?.category).toBe("cafe");
  });
});
