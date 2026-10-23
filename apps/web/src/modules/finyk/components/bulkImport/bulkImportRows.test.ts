import { describe, expect, it } from "vitest";
import type {
  ImportScreenshotRow,
  ImportStatementRow,
} from "@sergeant/api-client";
import { INTERNAL_TRANSFER_ID } from "@sergeant/finyk-domain/constants";
import {
  applyBulkCategory,
  screenshotRowsToBulkReviewRows,
  selectedRowCount,
  setAllSelected,
  setRowDirection,
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

  it("monoMatchLikely знято з вибору за замовчуванням і не потрапляє в рядок без мітки (data-30)", () => {
    const rows = statementRowsToBulkReviewRows(
      [
        {
          date: "2026-08-16",
          amountKopiykas: 9500,
          direction: "expense",
          description: "АТБ",
          monoMatchLikely: true,
        },
        {
          date: "2026-08-18",
          amountKopiykas: 12000,
          direction: "expense",
          description: "Сільпо",
        },
      ],
      rowOptions,
    );
    expect(rows[0]).toMatchObject({ monoMatchLikely: true, selected: false });
    expect(rows[1]?.selected).toBe(true);
    expect("monoMatchLikely" in rows[1]!).toBe(false);
    expect(toggleRowSelected(rows, rows[0]!.id)[0]?.selected).toBe(true);
  });

  it("monoMatchLikely працює і для скрін-рядків", () => {
    const rows = screenshotRowsToBulkReviewRows(
      [
        {
          date: "2026-08-16",
          time: "10:00",
          amountKopiykas: 9500,
          direction: "expense",
          description: "АТБ",
          confidence: 0.9,
          monoMatchLikely: true,
        },
      ],
      rowOptions,
    );
    expect(rows[0]).toMatchObject({ monoMatchLikely: true, selected: false });
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

describe("setRowDirection (logic-06)", () => {
  const debitAsIncome = (
    overrides: Partial<ImportStatementRow> = {},
  ): ImportStatementRow => ({
    date: "2026-09-21",
    amountKopiykas: 35000,
    direction: "income",
    description: "ДК-1 Сільпо",
    occurrenceIndex: 0,
    ...overrides,
  });

  it("перемикає напрям лише цільового рядка", () => {
    const rows = statementRowsToBulkReviewRows(
      [debitAsIncome(), debitAsIncome({ description: "ДК-3 Аптека" })],
      rowOptions,
    );
    const next = setRowDirection(
      rows,
      "statement-0",
      "expense",
      defaultCategoryFor,
    );
    expect(next[0]!.direction).toBe("expense");
    expect(next[1]!.direction).toBe("income");
    expect(next[1]).toBe(rows[1]);
  });

  it("скидає категорію на дефолт нового напряму: витратного слага в надходженні не буває", () => {
    const rows = statementRowsToBulkReviewRows([debitAsIncome()], rowOptions);
    expect(rows[0]!.category).toBe("salary");
    const next = setRowDirection(
      rows,
      "statement-0",
      "expense",
      defaultCategoryFor,
    );
    expect(next[0]!.category).toBe("other");
    expect(toCommitRows(setAllSelected(next, true))[0]).toMatchObject({
      direction: "expense",
      category: "other",
    });
  });

  it("«Внутрішній переказ» лишається: він є в обох пікерах", () => {
    const rows = updateRowField(
      statementRowsToBulkReviewRows([debitAsIncome()], rowOptions),
      "statement-0",
      { category: INTERNAL_TRANSFER_ID },
    );
    const next = setRowDirection(
      rows,
      "statement-0",
      "expense",
      defaultCategoryFor,
    );
    expect(next[0]!.category).toBe(INTERNAL_TRANSFER_ID);
  });

  it("скидає occurrenceIndex і мітки, звірені з урахуванням напряму", () => {
    const rows = statementRowsToBulkReviewRows(
      [
        debitAsIncome({
          occurrenceIndex: 2,
          duplicateLikely: true,
          monoMatchLikely: true,
          transferLikely: true,
        }),
      ],
      rowOptions,
    );
    const next = setRowDirection(
      rows,
      "statement-0",
      "expense",
      defaultCategoryFor,
    );
    expect(next[0]).not.toHaveProperty("occurrenceIndex");
    expect(next[0]).not.toHaveProperty("monoMatchLikely");
    expect(next[0]!.duplicateLikely).toBe(false);
    // Переказ сервер бачить за описом, тож мітка лишається.
    expect(next[0]!.transferLikely).toBe(true);
    expect(toCommitRows(setAllSelected(next, true))[0]).not.toHaveProperty(
      "occurrenceIndex",
    );
  });

  it("вибір рядка не змінює: галочку ставить людина", () => {
    const rows = statementRowsToBulkReviewRows([debitAsIncome()], rowOptions);
    expect(rows[0]!.selected).toBe(false);
    const next = setRowDirection(
      rows,
      "statement-0",
      "expense",
      defaultCategoryFor,
    );
    expect(next[0]!.selected).toBe(false);
  });

  it("той самий напрям – рядок без змін", () => {
    const rows = statementRowsToBulkReviewRows([debitAsIncome()], rowOptions);
    const next = setRowDirection(
      rows,
      "statement-0",
      "income",
      defaultCategoryFor,
    );
    expect(next[0]).toBe(rows[0]);
  });
});

describe("occurrenceIndex з превʼю (data-29)", () => {
  const coffee = (occurrenceIndex?: number): ImportStatementRow => ({
    date: "2026-07-16",
    amountKopiykas: 9500,
    direction: "expense",
    description: "Кава",
    ...(occurrenceIndex === undefined ? {} : { occurrenceIndex }),
  });

  it("друга кава шлеться з індексом превʼю, навіть коли перша не вибрана", () => {
    // Сервер позначив першу каву duplicateLikely: вона знята з вибору, тож у
    // commit іде лише друга. Без індексу сервер рахував би її першою (0).
    const rows = statementRowsToBulkReviewRows(
      [{ ...coffee(0), duplicateLikely: true }, coffee(1)],
      rowOptions,
    );
    expect(rows.map((r) => r.selected)).toEqual([false, true]);
    expect(toCommitRows(rows)).toEqual([
      expect.objectContaining({ description: "Кава", occurrenceIndex: 1 }),
    ]);
  });

  it("скрін-рядки теж несуть індекс", () => {
    const rows = screenshotRowsToBulkReviewRows(
      [{ ...coffee(1), time: "12:10", confidence: 0.9 }],
      rowOptions,
    );
    expect(toCommitRows(rows)[0]?.occurrenceIndex).toBe(1);
  });

  it("без індексу від сервера (старий сервер) ключ не додається до commit-рядка", () => {
    const rows = statementRowsToBulkReviewRows([coffee()], rowOptions);
    const [commitRow] = toCommitRows(rows);
    expect(commitRow).toBeDefined();
    expect("occurrenceIndex" in commitRow!).toBe(false);
  });

  it("правка опису чи суми скидає індекс: рядок міг опинитись в іншій групі", () => {
    const rows = statementRowsToBulkReviewRows([coffee(1)], rowOptions);
    const id = rows[0]!.id;
    const renamed = updateRowField(rows, id, { description: "Чай" });
    expect(renamed[0]?.occurrenceIndex).toBeUndefined();
    const repriced = updateRowField(rows, id, { amountKopiykas: 10000 });
    expect(repriced[0]?.occurrenceIndex).toBeUndefined();
  });

  it("зміна категорії або те саме значення опису індекс зберігає", () => {
    const rows = statementRowsToBulkReviewRows([coffee(1)], rowOptions);
    const id = rows[0]!.id;
    expect(
      updateRowField(rows, id, { category: "cafe" })[0]?.occurrenceIndex,
    ).toBe(1);
    expect(
      updateRowField(rows, id, { description: "Кава" })[0]?.occurrenceIndex,
    ).toBe(1);
  });
});
