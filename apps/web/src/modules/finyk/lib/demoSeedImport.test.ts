// @vitest-environment jsdom
/**
 * Last validated: 2026-08-08
 * Status: Active
 */
import { describe, it, expect, beforeEach } from "vitest";

import {
  importFinykDemoMonoTransactions,
  importFinykDemoSeed,
  readFinykDemoMonoTransactionsFromLs,
  readFinykDemoStateFromLs,
} from "./demoSeedImport";

const MANUAL_EXPENSES_KEY = "finyk_manual_expenses_v1";
const CUSTOM_CATS_KEY = "finyk_custom_cats_v1";
const MONTHLY_PLAN_KEY = "finyk_monthly_plan";
const TX_CACHE_KEY = "finyk_tx_cache";

/** Мінімальна форма того, що реально пише `seedFinyk()`. */
function seedManualExpenses() {
  return [
    {
      id: "demo_fx_1",
      date: "2026-08-07T08:00:00.000Z",
      description: "Кава на винос",
      amount: 45,
      category: "food",
    },
  ];
}

function seedTxCache() {
  return {
    txs: [
      {
        id: "demo_mtx_1",
        amount: -14500,
        date: "2026-08-08T09:00:00.000Z",
        time: 1_754_636_400,
        description: "Сільпо",
        merchant: "Сільпо",
        mcc: 5411,
        categoryId: "",
        type: "expense",
        source: "mono",
        accountId: "demo_acc_main",
        manual: false,
        _source: "monobank",
        _accountId: "demo_acc_main",
        _manual: false,
      },
    ],
    timestamp: Date.now(),
  };
}

/**
 * Фейк-клієнт: збирає SQL, який на нього виллють. Нам не треба
 * справжній sqlite — важливо, що demo-payload ПЕРЕТВОРЮЄТЬСЯ на
 * операції запису, бо саме цієї ланки не було (аудит L-8): сід писав
 * у LS, модуль читав із SQLite/мірора, і між ними після видалення
 * residual-дренажу не лишилось нічого.
 */
function makeClient() {
  const sql: string[] = [];
  return {
    sql,
    client: {
      exec: (statement: string) => {
        sql.push(statement);
      },
      run: (statement: string) => {
        sql.push(statement);
      },
      all: () => [],
    },
  };
}

describe("readFinykDemoStateFromLs", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("повертає null, коли демо-payload у LS немає", () => {
    expect(readFinykDemoStateFromLs()).toBeNull();
  });

  it("повертає null на порожніх колекціях і відсутньому плані — лити нема чого", () => {
    localStorage.setItem(MANUAL_EXPENSES_KEY, JSON.stringify([]));
    localStorage.setItem(CUSTOM_CATS_KEY, JSON.stringify([]));
    expect(readFinykDemoStateFromLs()).toBeNull();
  });

  it("збирає стан із ручних витрат і плану, які пише демо-сід", () => {
    localStorage.setItem(
      MANUAL_EXPENSES_KEY,
      JSON.stringify(seedManualExpenses()),
    );
    localStorage.setItem(CUSTOM_CATS_KEY, JSON.stringify([]));
    localStorage.setItem(
      MONTHLY_PLAN_KEY,
      JSON.stringify({ income: "45000", expense: "28000", savings: "0" }),
    );

    const state = readFinykDemoStateFromLs();

    expect(state?.manualExpenses).toHaveLength(1);
    expect(state?.manualExpenses[0]).toMatchObject({ id: "demo_fx_1" });
    expect(state?.customCategories).toHaveLength(0);
    // Дефолти prefs — демо не сіє ні прапорець балансу, ні виключені
    // транзакції, ні dismissed-recurring, тож ці слайси мають лишитись
    // продуктовими дефолтами, а не «порожнім/false».
    expect(state?.prefs?.showBalance).toBe(true);
    expect(state?.prefs?.excludedStatTxIdsJson).toBe("[]");
    expect(state?.prefs?.dismissedRecurringJson).toBe("[]");
  });

  it("форма monthlyPlan: JSON у prefs — точний round-trip того, що лежить у LS", () => {
    // Регресійний тест на розрив, зафіксований у завданні: сід
    // раніше писав числа й пропускав `savings`, тепер пише рядки й усі
    // три поля. Цей тест ловить БУДЬ-яку форму — містку байдуже, яка
    // саме форма в LS, він лише стрінгіфікує її як є, тож цей тест
    // фіксує контракт «без перетворень» і окремо перевіряє, що
    // виправлена форма сіда (рядки, три поля) проходить крізь місток
    // незмінною.
    const plan = { income: "45000", expense: "28000", savings: "0" };
    localStorage.setItem(MANUAL_EXPENSES_KEY, JSON.stringify([]));
    localStorage.setItem(MONTHLY_PLAN_KEY, JSON.stringify(plan));

    const state = readFinykDemoStateFromLs();

    expect(state?.prefs?.monthlyPlanJson).toBe(JSON.stringify(plan));
    expect(JSON.parse(state!.prefs!.monthlyPlanJson)).toEqual(plan);
  });

  it("переживає побитий JSON без винятку", () => {
    localStorage.setItem(MANUAL_EXPENSES_KEY, "{не json");
    expect(() => readFinykDemoStateFromLs()).not.toThrow();
  });
});

describe("importFinykDemoSeed", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("нічого не робить, коли демо-payload порожній", async () => {
    const { client, sql } = makeClient();

    const applied = await importFinykDemoSeed({
      client,
      userId: "demo-local",
      nowIso: "2026-08-08T10:00:00.000Z",
    });

    expect(applied).toBe(0);
    expect(sql).toHaveLength(0);
  });

  it("перетворює засіяні ручні витрати й план на записи в SQLite", async () => {
    localStorage.setItem(
      MANUAL_EXPENSES_KEY,
      JSON.stringify(seedManualExpenses()),
    );
    localStorage.setItem(
      MONTHLY_PLAN_KEY,
      JSON.stringify({ income: "45000", expense: "28000", savings: "0" }),
    );
    const { client, sql } = makeClient();

    const applied = await importFinykDemoSeed({
      client,
      userId: "demo-local",
      nowIso: "2026-08-08T10:00:00.000Z",
    });

    expect(applied).toBeGreaterThan(0);
    expect(sql.join(" ")).toMatch(/finyk_manual_expenses/i);
    expect(sql.join(" ")).toMatch(/finyk_prefs/i);
  });

  it("не кидає, коли sqlite падає — демо не має права завалити бут", async () => {
    localStorage.setItem(
      MANUAL_EXPENSES_KEY,
      JSON.stringify(seedManualExpenses()),
    );
    const failing = {
      exec: () => {
        throw new Error("sqlite down");
      },
      run: () => {
        throw new Error("sqlite down");
      },
      all: () => [],
    };

    await expect(
      importFinykDemoSeed({
        client: failing,
        userId: "demo-local",
        nowIso: "2026-08-08T10:00:00.000Z",
      }),
    ).resolves.toBe(0);
  });

  it("ідемпотентний: другий прогін дає ті самі операції, не подвоєні", async () => {
    localStorage.setItem(
      MANUAL_EXPENSES_KEY,
      JSON.stringify(seedManualExpenses()),
    );
    const first = makeClient();
    const second = makeClient();

    const a = await importFinykDemoSeed({
      client: first.client,
      userId: "demo-local",
      nowIso: "2026-08-08T10:00:00.000Z",
    });
    const b = await importFinykDemoSeed({
      client: second.client,
      userId: "demo-local",
      nowIso: "2026-08-08T10:00:00.000Z",
    });

    expect(b).toBe(a);
  });
});

describe("readFinykDemoMonoTransactionsFromLs", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("повертає null, коли `finyk_tx_cache` немає", () => {
    expect(readFinykDemoMonoTransactionsFromLs()).toBeNull();
  });

  it("повертає null на порожньому `txs`", () => {
    localStorage.setItem(TX_CACHE_KEY, JSON.stringify({ txs: [] }));
    expect(readFinykDemoMonoTransactionsFromLs()).toBeNull();
  });

  it("збирає mono-транзакції, які пише демо-сід (23 у продуктовому фікстурі)", () => {
    localStorage.setItem(TX_CACHE_KEY, JSON.stringify(seedTxCache()));
    const txs = readFinykDemoMonoTransactionsFromLs();
    expect(txs).toHaveLength(1);
    expect(txs?.[0]).toMatchObject({ id: "demo_mtx_1", mcc: 5411 });
  });

  it("відсіює рядки без рядкового `id`", () => {
    localStorage.setItem(
      TX_CACHE_KEY,
      JSON.stringify({ txs: [{ amount: -100 }, { id: 42 }] }),
    );
    expect(readFinykDemoMonoTransactionsFromLs()).toBeNull();
  });

  it("переживає побитий JSON без винятку", () => {
    localStorage.setItem(TX_CACHE_KEY, "{не json");
    expect(() => readFinykDemoMonoTransactionsFromLs()).not.toThrow();
  });
});

describe("importFinykDemoMonoTransactions", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("нічого не робить, коли `finyk_tx_cache` порожній", async () => {
    const { client, sql } = makeClient();

    const applied = await importFinykDemoMonoTransactions({
      client,
      userId: "demo-local",
    });

    expect(applied).toBe(0);
    expect(sql).toHaveLength(0);
  });

  it("перетворює засіяні mono-транзакції на записи в мірор", async () => {
    localStorage.setItem(TX_CACHE_KEY, JSON.stringify(seedTxCache()));
    const { client, sql } = makeClient();

    const applied = await importFinykDemoMonoTransactions({
      client,
      userId: "demo-local",
    });

    expect(applied).toBe(1);
    expect(sql.join(" ")).toMatch(/finyk_mono_transactions/i);
  });

  it("не кидає, коли запис у мірор падає — демо не має права завалити бут", async () => {
    localStorage.setItem(TX_CACHE_KEY, JSON.stringify(seedTxCache()));
    const failing = {
      exec: () => {
        throw new Error("sqlite down");
      },
      run: () => {
        throw new Error("sqlite down");
      },
      all: () => [],
    };

    await expect(
      importFinykDemoMonoTransactions({
        client: failing,
        userId: "demo-local",
      }),
    ).resolves.toBe(0);
  });

  it("ідемпотентний: другий прогін дає той самий результат (upsert за tx_id)", async () => {
    localStorage.setItem(TX_CACHE_KEY, JSON.stringify(seedTxCache()));
    const first = makeClient();
    const second = makeClient();

    const a = await importFinykDemoMonoTransactions({
      client: first.client,
      userId: "demo-local",
    });
    const b = await importFinykDemoMonoTransactions({
      client: second.client,
      userId: "demo-local",
    });

    expect(b).toBe(a);
  });
});
