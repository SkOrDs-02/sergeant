// @vitest-environment jsdom
/**
 * Status: Active
 *
 * Метрика `alcohol_spending` — денні витрати за ОДНІЄЮ категорією
 * (Silpo трек F). Тестуємо саме те, заради чого вона зʼявилась: суму бере
 * зі СПЛІТУ чека, а не з повної суми транзакції.
 *
 * Чому це варте тесту: помилка тут невидима. Невірний ключ дня або
 * пропущений фільтр дали б порожній ряд, а порожній ряд у продукті
 * виглядає не як баг, а як чесне «закономірностей не помічено».
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const { mockCachedFinyk, mockCachedFinykMonoMirror } = vi.hoisted(() => ({
  mockCachedFinyk: vi.fn(() => ({
    hiddenTransactions: [] as string[],
    manualExpenses: [] as unknown[],
    txCategories: {} as Record<string, string>,
    customCategories: [] as unknown[],
  })),
  mockCachedFinykMonoMirror: vi.fn(() => ({
    transactions: [] as unknown[],
    accounts: [] as unknown[],
    refreshedAt: null as string | null,
  })),
}));

vi.mock("../../../../modules/finyk/lib/sqliteReader", () => ({
  getCachedFinykSqliteState: mockCachedFinyk,
}));
vi.mock("../../../../modules/finyk/lib/monoMirrorReader", () => ({
  getCachedFinykMonoMirrorState: mockCachedFinykMonoMirror,
  getVisibleFinykMonoMirrorState: mockCachedFinykMonoMirror,
}));

import { buildDailySeries } from "./dailySeries";

const DAY = "2026-04-22";
/** Полудень Києва того дня — щоб денний ключ не зʼїхав через межу доби. */
const NOON_SEC = Math.floor(Date.parse(`${DAY}T09:00:00Z`) / 1000);

function seedTx(id: string, amountUah: number) {
  mockCachedFinykMonoMirror.mockReturnValue({
    transactions: [{ id, amount: -amountUah * 100, time: NOON_SEC }],
    accounts: [],
    refreshedAt: new Date().toISOString(),
  });
}

describe("alcohol_spending — денні витрати за категорією чека", () => {
  beforeEach(() => {
    localStorage.clear();
    mockCachedFinyk.mockReturnValue({
      hiddenTransactions: [],
      manualExpenses: [],
      txCategories: {},
      customCategories: [],
    });
  });

  it("бере частку спліту, а не всю суму покупки", () => {
    seedTx("tx-1", 1000);
    // Один похід у супермаркет, розбитий за чеком: 300 алкоголь, 700 їжа.
    localStorage.setItem(
      "finyk_tx_splits",
      JSON.stringify({
        "tx-1": [
          { categoryId: "alcohol", amount: 300 },
          { categoryId: "groceries", amount: 700 },
        ],
      }),
    );

    const s = buildDailySeries(["alcohol_spending"], { from: DAY, to: DAY });
    expect(s.raw["alcohol_spending"]![0]).toBe(300);
  });

  it("у межах покриття день без алкоголю — справжній нуль", () => {
    // Два дні: у першому алкоголь є, у другому лише їжа. Покриття
    // `zero-while-covered` живе рівно між першим і останнім днем із
    // даними — без першого дня метрика мовчала б узагалі, і саме так
    // і має бути для того, хто алкоголь не купує.
    mockCachedFinykMonoMirror.mockReturnValue({
      transactions: [
        { id: "tx-a", amount: -1000 * 100, time: NOON_SEC },
        { id: "tx-b", amount: -500 * 100, time: NOON_SEC + 86_400 },
        { id: "tx-c", amount: -800 * 100, time: NOON_SEC + 2 * 86_400 },
      ],
      accounts: [],
      refreshedAt: new Date().toISOString(),
    });
    localStorage.setItem(
      "finyk_tx_splits",
      JSON.stringify({
        "tx-a": [{ categoryId: "alcohol", amount: 300 }],
        "tx-b": [{ categoryId: "groceries", amount: 500 }],
        "tx-c": [{ categoryId: "alcohol", amount: 200 }],
      }),
    );

    const s = buildDailySeries(["alcohol_spending"], {
      from: DAY,
      to: "2026-04-24",
    });
    expect(s.raw["alcohol_spending"]).toEqual([300, 0, 200]);
  });

  it("прихована транзакція не потрапляє в метрику", () => {
    mockCachedFinykMonoMirror.mockReturnValue({
      transactions: [
        { id: "tx-visible", amount: -1000 * 100, time: NOON_SEC },
        { id: "tx-hidden", amount: -400 * 100, time: NOON_SEC + 86_400 },
        { id: "tx-later", amount: -800 * 100, time: NOON_SEC + 2 * 86_400 },
      ],
      accounts: [],
      refreshedAt: new Date().toISOString(),
    });
    localStorage.setItem(
      "finyk_tx_splits",
      JSON.stringify({
        "tx-visible": [{ categoryId: "alcohol", amount: 300 }],
        "tx-hidden": [{ categoryId: "alcohol", amount: 400 }],
        "tx-later": [{ categoryId: "alcohol", amount: 200 }],
      }),
    );
    mockCachedFinyk.mockReturnValue({
      hiddenTransactions: ["tx-hidden"],
      manualExpenses: [],
      txCategories: {},
      customCategories: [],
    });

    const s = buildDailySeries(["alcohol_spending"], {
      from: DAY,
      to: "2026-04-24",
    });
    // Другий день — нуль, бо єдина його покупка прихована.
    expect(s.raw["alcohol_spending"]).toEqual([300, 0, 200]);
  });
});

/**
 * `smoking_spending` — та сама механіка, інша категорія. Тест тут не
 * дублює алкогольний заради симетрії: він стереже рівно те, що ламається
 * при копіюванні метрики — забутий `case` у reader-і поверне порожній ряд,
 * і продукт покаже це як чесне «закономірностей не помічено», а не як баг.
 */
describe("smoking_spending — денні витрати на цигарки", () => {
  beforeEach(() => {
    localStorage.clear();
    mockCachedFinyk.mockReturnValue({
      hiddenTransactions: [],
      manualExpenses: [],
      txCategories: {},
      customCategories: [],
    });
  });

  it("бере частку спліту цигарок, а не всю суму покупки", () => {
    seedTx("tx-smoke", 900);
    localStorage.setItem(
      "finyk_tx_splits",
      JSON.stringify({
        "tx-smoke": [
          { categoryId: "smoking", amount: 250 },
          { categoryId: "groceries", amount: 650 },
        ],
      }),
    );

    const s = buildDailySeries(["smoking_spending"], { from: DAY, to: DAY });
    expect(s.raw["smoking_spending"]![0]).toBe(250);
  });

  it("не плутає категорії: алкоголь у той самий день не тече в тютюн", () => {
    seedTx("tx-both", 1000);
    localStorage.setItem(
      "finyk_tx_splits",
      JSON.stringify({
        "tx-both": [
          { categoryId: "smoking", amount: 200 },
          { categoryId: "alcohol", amount: 300 },
          { categoryId: "groceries", amount: 500 },
        ],
      }),
    );

    const s = buildDailySeries(["smoking_spending", "alcohol_spending"], {
      from: DAY,
      to: DAY,
    });
    expect(s.raw["smoking_spending"]![0]).toBe(200);
    expect(s.raw["alcohol_spending"]![0]).toBe(300);
  });
});
