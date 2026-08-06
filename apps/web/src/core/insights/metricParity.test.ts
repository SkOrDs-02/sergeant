// @vitest-environment jsdom
/**
 * Характеризаційний parity-тест: ОДИН спільний фікстур → УСІ наявні
 * конвеєри метрик → зафіксовані ПОТОЧНІ значення, включно з розбіжними.
 *
 * AI-CONTEXT (W1-CANON-AGG, стадія 1): цей файл — не гейт «усе збігається»,
 * а **реєстр боргу у виконуваній формі**. Кожен блок нижче помічений як
 * `ЗБІГ` або `РОЗБІЖНІСТЬ`; тест зелений із першого дня, бо фіксує те, що є
 * сьогодні. Кожна наступна стадія міграції (2-5) перевертає рядок
 * «розбіжність» → «збіг» і править очікування тут — саме так видно, що
 * число користувача зрушило, і це помічено свідомо.
 *
 * Текстовий реєстр із поясненнями:
 * `docs/02-engineering/architecture/metric-registry.md`.
 *
 * Конвеєри, які тут проганяються НА СПРАВЖНЬОМУ КОДІ:
 *   1. канон — `@sergeant/{finyk,nutrition,fizruk,routine}-domain`;
 *   2. тижневий дайджест — `useWeeklyDigest.ts` (`aggregate*`);
 *   3. Hub-Reports / hub-картки — `core/hub/hubReports.aggregation.ts`;
 *   4. HubChat-контекст — `core/lib/hubChatContext/readAllData.ts`;
 *   5. чат-тулза `aggregate_spending` — `core/lib/chatActions/queryFinykActions.ts`.
 * Mobile-конвеєри (`apps/mobile/**`) сюди не резолвляться (RN-граф) — вони
 * описані в реєстрі й отримають симетричний тест на стадії 3.
 *
 * Годинник: дайджест і Hub-Reports рахують межі доби host-local
 * (`localDateKey`), HubChat — Kyiv. Щоб цей тест міряв РІЗНИЦЮ ВСЕСВІТІВ, а
 * не різницю годинників, усі позначки часу у фікстурі стоять опівдні UTC —
 * тоді ключ доби однаковий для будь-якої реалістичної TZ. Розбіжність
 * годинників — окремий рядок реєстру (стадія 5г).
 */
import { beforeEach, describe, expect, it } from "vitest";

import {
  buildFinykSpendingUniverse,
  calcFinykPeriodAggregate,
} from "@sergeant/finyk-domain";
import { calcNutritionPeriodAverages } from "@sergeant/nutrition-domain";
import { calcFizrukPeriodAggregate } from "@sergeant/fizruk-domain";
import { completionRateForRange } from "@sergeant/routine-domain/streaks";

import {
  __setFinykMonoMirrorCacheForTests,
  clearFinykMonoMirrorCache,
} from "@finyk/lib/monoMirrorReader";
import { __setFinykSqliteStateCacheForTests } from "@finyk/lib/sqliteReader";
import { __setFizrukSqliteCacheForTests } from "@fizruk/lib/sqliteReader";
import { __setNutritionSqliteCacheForTests } from "@nutrition/lib/sqliteReader";
import {
  __setRoutineSqliteCompletionsCacheForTests,
  __setRoutineSqliteStateCacheForTests,
} from "@routine/lib/sqliteReader";

import {
  aggregateFinyk,
  aggregateFizruk,
  aggregateNutrition,
  aggregateRoutine,
} from "./useWeeklyDigest";
import {
  aggregateHabits,
  aggregateKcal,
  aggregateSpending as aggregateSpendingByDate,
} from "../hub/hubReports.aggregation";
import { readFinykStatsContext } from "@finyk/lib/lsStats";
import { readAllData } from "../lib/hubChatContext/readAllData";
import { aggregateSpending as chatAggregateSpending } from "../lib/chatActions/queryFinykActions";
import { calcFinykSpendingTotal } from "@sergeant/finyk-domain";

// ── Спільний фікстур ─────────────────────────────────────────────────────────

const WEEK_KEY = "2026-05-04"; // понеділок
const WEEK_DAYS = [
  "2026-05-04",
  "2026-05-05",
  "2026-05-06",
  "2026-05-07",
  "2026-05-08",
  "2026-05-09",
  "2026-05-10",
];

/** Секунди епохи для «опівдні UTC» вказаного дня. */
function noonSec(day: string): number {
  return Math.floor(Date.parse(`${day}T12:00:00.000Z`) / 1000);
}

/** Локальна північ дня — так само, як це робить дайджест. */
function localMidnightMs(day: string): number {
  return new Date(`${day}T00:00:00`).getTime();
}

const BANK_TXS = [
  // Звичайна витрата: 300 грн.
  { id: "t-food", amount: -30_000, time: noonSec("2026-05-05"), mcc: 5411 },
  // Витрата зі сплітом 600 грн «їжа» + 400 грн внутрішній переказ →
  // у статистику має піти лише 600 грн.
  { id: "t-split", amount: -100_000, time: noonSec("2026-05-06"), mcc: 5411 },
  // Явно виключена зі статистики (finyk_excluded_stat_txs): 200 грн.
  {
    id: "t-excl-stat",
    amount: -20_000,
    time: noonSec("2026-05-06"),
    mcc: 5411,
  },
  // Внутрішній переказ (finyk_tx_cats → internal_transfer).
  { id: "t-transfer", amount: -50_000, time: noonSec("2026-05-07") },
  // Прихована транзакція (finyk_hidden_txs).
  { id: "t-hidden", amount: -15_000, time: noonSec("2026-05-07") },
  // Погашення боргу, привʼязане до receivable (finyk_recv).
  { id: "t-recv", amount: -25_000, time: noonSec("2026-05-08") },
  // Дохід 2000 грн.
  { id: "t-income", amount: 200_000, time: noonSec("2026-05-04") },
];

/** Ручна (готівкова) витрата 250 грн — її сьогодні бачить лише Overview. */
const MANUAL_EXPENSES = [
  {
    id: "m-cash",
    date: "2026-05-06",
    amount: 250,
    description: "Ринок",
    category: "food",
    kind: "expense",
  },
];

const TX_CATEGORIES: Record<string, string> = {
  "t-food": "food",
  "t-split": "food",
  "t-excl-stat": "food",
  "t-transfer": "internal_transfer",
};
const TX_SPLITS: Record<string, unknown[]> = {
  "t-split": [
    { categoryId: "food", amount: 600 },
    { categoryId: "internal_transfer", amount: 400 },
  ],
};
const HIDDEN_TX_IDS = ["t-hidden"];
const EXCLUDED_STAT_TX_IDS = ["t-excl-stat"];
const RECEIVABLES = [
  { id: "r1", name: "Борг", amount: 250, linkedTxIds: ["t-recv"] },
];

/** Звичка «Пн/Ср/Пт», виконана 3 із 3 запланованих днів. */
const HABIT = {
  id: "h1",
  name: "Зарядка",
  createdAt: "2026-01-01T00:00:00.000Z",
  recurrence: "weekly",
  weekdays: [0, 2, 4], // Пн, Ср, Пт (isoWeekday: 0 = понеділок)
};
const COMPLETIONS: Record<string, string[]> = {
  h1: ["2026-05-04", "2026-05-06", "2026-05-08"],
};

/**
 * Лог харчування: 2 дні з прийомами + 1 день, для якого запис існує, але
 * `meals` порожній (це і є «неповний день» із канону nutrition §5.2).
 */
const NUTRITION_LOG = {
  "2026-05-04": {
    meals: [
      {
        id: "meal-1",
        macros: { kcal: 500, protein_g: 30, fat_g: 20, carbs_g: 50 },
      },
    ],
  },
  "2026-05-05": {
    meals: [
      {
        id: "meal-2",
        macros: { kcal: 700, protein_g: 50, fat_g: 30, carbs_g: 70 },
      },
    ],
  },
  "2026-05-06": { meals: [] },
};

const WORKOUTS = [
  {
    id: "w1",
    startedAt: "2026-05-04T12:00:00.000Z",
    endedAt: "2026-05-04T13:00:00.000Z",
    items: [
      {
        id: "i1",
        exerciseId: "squat",
        nameUk: "Присідання",
        type: "strength",
        sets: [
          { weightKg: 100, reps: 5 },
          { weightKg: 100, reps: 5 },
        ],
      },
    ],
    groups: [],
    warmup: null,
    cooldown: null,
    note: "",
  },
  {
    id: "w2",
    startedAt: "2026-05-06T12:00:00.000Z",
    endedAt: "2026-05-06T13:00:00.000Z",
    items: [
      {
        id: "i2",
        exerciseId: "bench",
        nameUk: "Жим",
        type: "strength",
        sets: [{ weightKg: 80, reps: 10 }],
      },
    ],
    groups: [],
    warmup: null,
    cooldown: null,
    note: "",
  },
];

beforeEach(() => {
  localStorage.clear();
  clearFinykMonoMirrorCache();

  // Джерела, які читають веб-конвеєри.
  __setFinykMonoMirrorCacheForTests({
    transactions: BANK_TXS as never[],
    accounts: [],
    refreshedAt: "2026-05-11T00:00:00.000Z",
  });
  __setFinykSqliteStateCacheForTests({
    manualExpenses: MANUAL_EXPENSES as never,
    txCategories: TX_CATEGORIES,
    txSplits: TX_SPLITS as never,
    hiddenTransactions: HIDDEN_TX_IDS,
    receivables: RECEIVABLES as never,
    excludedStatTxIds: EXCLUDED_STAT_TX_IDS,
    monthlyPlan: null,
  });
  __setFizrukSqliteCacheForTests({ workouts: WORKOUTS as never });
  __setNutritionSqliteCacheForTests({ log: NUTRITION_LOG as never });
  __setRoutineSqliteStateCacheForTests({ habits: [HABIT] as never });
  __setRoutineSqliteCompletionsCacheForTests({ completions: COMPLETIONS });

  // Ті самі дані у legacy-LS-ключах, які досі читають lsStats / HubChat.
  localStorage.setItem("finyk_hidden_txs", JSON.stringify(HIDDEN_TX_IDS));
  localStorage.setItem("finyk_tx_cats", JSON.stringify(TX_CATEGORIES));
  localStorage.setItem("finyk_tx_splits", JSON.stringify(TX_SPLITS));
  localStorage.setItem("finyk_recv", JSON.stringify(RECEIVABLES));
  localStorage.setItem(
    "finyk_excluded_stat_txs",
    JSON.stringify(EXCLUDED_STAT_TX_IDS),
  );
});

// ── Метрика 1: витрати за період ─────────────────────────────────────────────

describe("парність метрики «витрати за період»", () => {
  it("канон (всесвіт із ручними витратами) = 1150 грн", () => {
    // 300 (t-food) + 600 (спліт-частина t-split) + 250 (готівка) = 1150.
    const { transactions, excludedTxIds } = buildFinykSpendingUniverse({
      bankTxs: BANK_TXS,
      manualExpenses: MANUAL_EXPENSES,
      hiddenTxIds: HIDDEN_TX_IDS,
      txCategories: TX_CATEGORIES,
      receivables: RECEIVABLES,
      excludedStatTxIds: EXCLUDED_STAT_TX_IDS,
    });
    const canon = calcFinykPeriodAggregate(transactions, {
      start: localMidnightMs(WEEK_KEY),
      end: localMidnightMs(WEEK_KEY) + 7 * 86_400_000,
      excludedTxIds,
      txSplits: TX_SPLITS,
    });

    expect(canon.totalSpent).toBe(1150);
    expect(canon.totalIncome).toBe(2000);
  });

  it("ЗБІГ: дайджест бачить готівку — 1150 грн (стадія 2d)", () => {
    const digest = aggregateFinyk(WEEK_KEY);
    // Було 900: банк-only всесвіт губив рівно 250 грн ручної витрати.
    // Тепер `readFinykStatsContext` віддає канонічний всесвіт
    // (`buildFinykSpendingUniverse`), тож дайджест і коуч — обидва ходять
    // через нього — зійшлися з Overview і з каноном.
    expect(digest.totalSpent).toBe(1150);
    expect(digest.totalIncome).toBe(2000);
    // Готівка мусить осісти у своїй категорії, а не в «other»: інакше
    // топ-категорії дайджесту почали б брехати рівно на суму ручного світу.
    expect(digest.topCategories).toContainEqual({
      name: "🛒 Продукти",
      amount: 1150,
    });
  });

  it("ЗБІГ: Hub-Reports бачить готівку — 1150 грн (стадія 2d)", () => {
    // Входи будуються рівно так, як це робить `ExpensesCard`: через
    // `readFinykStatsContext`. Раніше тест збирав `txList`/`excludedTxIds`
    // вручну — і тому вимірював не той конвеєр, що бачить користувач.
    const { txs, excludedTxIds, txSplits } = readFinykStatsContext();
    const reports = aggregateSpendingByDate(
      {
        txList: txs as never,
        excludedTxIds,
        txSplits: txSplits as Record<string, unknown[]>,
      },
      WEEK_DAYS,
    );
    // Було 900 (банк-only). Тепер картка Витрат, тижневий дайджест і канон
    // дають одне число на одних даних.
    expect(reports.total).toBe(1150);
  });

  it("ЗБІГ: HubChat-контекст поважає finyk_excluded_stat_txs (стадія 2а)", () => {
    const d = readAllData();
    expect(d.excludedIds.has("t-hidden")).toBe(true);
    expect(d.excludedIds.has("t-transfer")).toBe(true);
    expect(d.excludedIds.has("t-recv")).toBe(true);
    // Борг закрито: `readAllData` збирає excluded-set канонічною
    // `buildFinykExcludedTxIds`, тож явно виключена зі статистики
    // транзакція більше не потрапляє у всесвіт чату (канон finyk §5).
    expect(d.excludedIds.has("t-excl-stat")).toBe(true);

    const chatSpent = calcFinykSpendingTotal(d.statTx, {
      txSplits: TX_SPLITS,
    });
    // 300 + 600 + 250 (готівка) = 1150. Шлях числа: 1100 (до стадії 2а,
    // `t-excl-stat` протікав) → 900 (2а) → 1150 (2d, зʼявилась готівка).
    // Контекст чату тепер сходиться і з чат-тулзою, і з дайджестом, і з
    // каноном — це було головне, бо модель отримує обидва в одній розмові.
    expect(chatSpent).toBe(1150);
  });

  it("ЗБІГ: чат-тулза aggregate_spending дає канонічні 1150 (стадія 2b)", () => {
    const out = chatAggregateSpending({
      type: "aggregate_spending",
      input: {
        date_from: "2026-05-04",
        date_to: "2026-05-10",
        group_by: "category",
        type: "expense",
      },
    } as never);

    // Було 2500 грн проти 1150 канонічних — найбільший розрив серед усіх
    // поверхонь: тулза виключала лише `hidden`, ігнорувала спліти /
    // внутрішні перекази / receivables / excluded_stat, зате мерджила
    // готівку. Тепер вона рахує канонічним excluded-set-ом і застосовує
    // спліт: t-food 300 + спліт-частка 600 + готівка 250 = 1150.
    //
    // Це перша поверхня, що ЗІЙШЛАСЯ З КАНОНОМ, а не з рештою: вона єдина
    // (крім Overview) бачить готівку. Дайджест, Hub-Reports і
    // HubChat-контекст досі дають 900 — їх підтягує стадія 2d.
    // Діапазон дат — «4–10 тра 2026», а не ISO: тулзи чату перейшли на
    // людські дати (`feat(web): людські дати замість ISO у текстах
    // чат-інструментів`). Снепшот тоді не оновили, і тест лишився
    // червоним у `main`. Предмет перевірки тут — ЧИСЛО 1150, а не запис
    // дати, тож знімок просто наздоганяє формат.
    expect(out).toMatchInlineSnapshot(
      `"Витрати за 4–10 тра 2026: 1150 грн усього (3 транзакц.). Розбивка за категоріями: 🛒 Продукти: 1150 грн (3)"`,
    );
  });
});

// ── Метрика 2: % виконання звичок ────────────────────────────────────────────

describe("парність метрики «% виконання звичок»", () => {
  it("канон (schedule-aware) = 100% для звички Пн/Ср/Пт, виконаної 3/3", () => {
    const canon = completionRateForRange(
      [HABIT] as never,
      COMPLETIONS,
      WEEK_DAYS[0]!,
      WEEK_DAYS[6]!,
    );
    expect(canon).toEqual({ completed: 3, scheduled: 3, rate: 1 });
  });

  it("ЗБІГ: дайджест рахує за розкладом — 100% (стадія 4)", () => {
    const digest = aggregateRoutine(WEEK_KEY);
    expect(digest).not.toBeNull();
    // `total` тепер «скільки днів звичка була запланована», а не «7».
    expect(digest!.habits[0]).toMatchObject({
      done: 3,
      total: 3,
      completionRate: 100,
    });
    expect(digest!.overallRate).toBe(100);
  });

  it("ЗБІГ: Hub-Reports теж рахує за розкладом — 100% (стадія 4)", () => {
    const reports = aggregateHabits(
      { habits: [HABIT] as never, completions: COMPLETIONS },
      WEEK_DAYS,
    );
    expect(reports.pct).toBe(100);
  });

  it("зрізана звичка без розкладу повертає старе плоске число", () => {
    // Регресія на AI-DANGER у `aggregateHabits`: якщо викликач знову почне
    // зрізати звички до `{id}`, `habitScheduledOnDate` візьме дефолтний
    // щоденний розклад — знаменник стане 7 і 43% тихо повернеться. Цей тест
    // існує, щоб таке падіння було видно як зміну ТЕСТУ, а не як тишу.
    const stripped = aggregateHabits(
      {
        habits: [{ id: "h1", name: "Зарядка" }] as never,
        completions: COMPLETIONS,
      },
      WEEK_DAYS,
    );
    expect(stripped.pct).toBe(43);
  });
});

// ── Метрика 3: середні ккал/день ─────────────────────────────────────────────

describe("парність метрики «середні ккал/день»", () => {
  it("канон = 600 ккал (знаменник — дні з ≥1 прийомом)", () => {
    const canon = calcNutritionPeriodAverages(NUTRITION_LOG, WEEK_DAYS);
    expect(canon).toMatchObject({
      avgKcal: 600,
      daysLogged: 2,
      daysInPeriod: 7,
    });
  });

  it("ЗБІГ: дайджест уже рахує за канонічною семантикою — 600 ккал", () => {
    const digest = aggregateNutrition(WEEK_KEY);
    expect(digest).not.toBeNull();
    expect(digest!.avgKcal).toBe(600);
    expect(digest!.daysLogged).toBe(2);
  });

  it("ЗБІГ: Hub-Reports більше не рахує порожній день — 600 ккал (стадія 4)", () => {
    const reports = aggregateKcal(NUTRITION_LOG as never, WEEK_DAYS);
    // `total` не рухався — рухався лише знаменник: 1200 / 2, а не 1200 / 3.
    // `2026-05-06` має запис із порожнім `meals` і більше не тягне середнє вниз.
    expect(reports.total).toBe(1200);
    expect(reports.avg).toBe(600);
  });
});

// ── Метрика 4: обʼєм тренувань ───────────────────────────────────────────────

describe("парність метрики «обʼєм тренувань за період»", () => {
  it("канон = 2 тренування / 1800 кг", () => {
    const canon = calcFizrukPeriodAggregate(WORKOUTS, {
      start: localMidnightMs(WEEK_KEY),
      end: localMidnightMs(WEEK_KEY) + 7 * 86_400_000,
    });
    expect(canon).toEqual({
      workoutsCount: 2,
      totalVolumeKg: 1800,
      byExercise: { Присідання: 1000, Жим: 800 },
    });
  });

  it("ЗБІГ: дайджест дає ті самі 2 / 1800 (дубльована, але однакова математика)", () => {
    const digest = aggregateFizruk(WEEK_KEY);
    expect(digest).not.toBeNull();
    expect(digest!.workoutsCount).toBe(2);
    expect(digest!.totalVolume).toBe(1800);
    // Розбіжність тут не в числі, а в кількості копій коду (3 на web+mobile) —
    // саме тому канон додано до того, як числа встигли розійтись.
  });
});
