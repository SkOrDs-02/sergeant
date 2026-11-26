/**
 * Push Фініка (Ф-4 (б)) на справжньому Postgres: дедуп порогів у
 * `push_reminder_log`, слот денної стелі, перегони двох процесів, тумблер,
 * тихі години з досиланням, разовий ліміт, «завтра спишеться» і ізоляція
 * між користувачами.
 *
 * Спека: docs/work/specs/finyk-limit-and-recurring-push.md § Верифікація.
 * Без Docker локально пропускається; у CI (`process.env.CI`) падає.
 */
import { randomUUID } from "node:crypto";

import type pg from "pg";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  bootIntegrationHarness,
  INTEGRATION_TIMEOUT_MS,
  seedIntegrationUser,
  shutdownIntegrationHarness,
  truncateIntegrationTables,
} from "../../../test/createIntegrationApp.js";

const { sendToUserQuietly } = vi.hoisted(() => ({
  sendToUserQuietly: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../../push/send.js", () => ({ sendToUserQuietly }));
vi.mock("../../../obs/logger.js", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  serializeError: vi.fn((err: unknown) => ({ message: String(err) })),
}));

import { finykPushDbFromPool, type FinykPushDb } from "./db.js";
import { runFinykLimitPush } from "./limitPush.js";
import { runFinykPushSweep } from "./sweep.js";

let pool: pg.Pool;
let db: FinykPushDb;
let skipReason: string | null = null;

const USER_A = "finyk_push_user_a";
const USER_B = "finyk_push_user_b";
const ACCOUNT = "acct_uah";

// 2026-11-19 12:00 за Києвом (UTC+2): поза тихими годинами.
const NOON = new Date("2026-11-19T10:00:00.000Z");
// 2026-11-19 23:30 за Києвом: у дефолтних тихих годинах 22:00-08:00.
const NIGHT = new Date("2026-11-19T21:30:00.000Z");
// Кінець тихих годин наступного ранку, 08:00 за Києвом.
const QUIET_END = new Date("2026-11-20T06:00:00.000Z");
// 09:00 за Києвом 19 листопада: час «завтра спишеться».
const NINE = new Date("2026-11-19T07:00:00.000Z");

beforeAll(async () => {
  try {
    const harness = await bootIntegrationHarness({ app: false });
    pool = harness.pool;
    db = finykPushDbFromPool(pool);
  } catch (err) {
    if (process.env["CI"]) throw err;
    skipReason = `Docker недоступний: ${String(err)}`;
  }
}, INTEGRATION_TIMEOUT_MS);

afterAll(async () => {
  await shutdownIntegrationHarness();
});

beforeEach(async (ctx) => {
  if (skipReason) {
    ctx.skip();
    return;
  }
  sendToUserQuietly.mockClear();
  await truncateIntegrationTables(pool);
});

async function seedUser(userId: string): Promise<void> {
  await seedIntegrationUser(pool, userId);
  await pool.query(
    `INSERT INTO push_devices (user_id, platform, token) VALUES ($1, 'ios', $2)`,
    [userId, `token-${userId}`],
  );
  await pool.query(
    `INSERT INTO mono_account (user_id, mono_account_id, currency_code)
     VALUES ($1, $2, 980)`,
    [userId, ACCOUNT],
  );
}

async function seedLimit(
  userId: string,
  limitUah: number,
  period: "month" | "week" | "one_time" = "month",
): Promise<string> {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO finyk_budgets (id, user_id, data_json) VALUES ($1, $2, $3::jsonb)`,
    [
      id,
      userId,
      JSON.stringify({
        type: "limit",
        categoryId: "food",
        categoryIds: ["food"],
        limit: limitUah,
        period,
        createdAt: "2026-11-01T00:00:00.000Z",
      }),
    ],
  );
  return id;
}

/** Витрата в Продуктах (MCC 5411), сума в гривнях. */
async function spend(userId: string, uah: number, at = NOON): Promise<void> {
  await pool.query(
    `INSERT INTO mono_transaction
       (user_id, mono_account_id, mono_tx_id, time, amount, operation_amount,
        currency_code, mcc, description, raw, source, category_slug)
     VALUES ($1, $2, $3, $4, $5, $5, 980, 5411, 'Сільпо', '{}'::jsonb,
             'webhook', 'food')`,
    [
      userId,
      ACCOUNT,
      randomUUID(),
      new Date(at.getTime() - 60_000),
      -uah * 100,
    ],
  );
}

async function logKeys(userId: string): Promise<string[]> {
  const { rows } = await pool.query<{ dedup_key: string }>(
    `SELECT dedup_key FROM push_reminder_log WHERE user_id = $1 ORDER BY dedup_key`,
    [userId],
  );
  return rows.map((r) => r.dedup_key);
}

describe("push ліміту Фініка", () => {
  it("80 % шлеться один раз за період і займає слот стелі", async () => {
    await seedUser(USER_A);
    const budgetId = await seedLimit(USER_A, 1000);
    await spend(USER_A, 850);

    expect(await runFinykLimitPush(db, USER_A, NOON, "mono_webhook")).toBe(
      "sent",
    );
    expect(await runFinykLimitPush(db, USER_A, NOON, "mono_webhook")).toBe(
      "nothing",
    );

    expect(sendToUserQuietly).toHaveBeenCalledTimes(1);
    const [, payload] = sendToUserQuietly.mock.calls[0]!;
    expect(payload.title).toBe("Ліміт «Продукти» майже вичерпано");
    expect(payload.url).toBe("/finyk/budgets");
    expect(await logKeys(USER_A)).toEqual([
      `finyk_limit_${budgetId}_2026-11_80`,
      "push-budget-2026-11-19-1",
    ]);
  });

  // Спека finyk-fx-nbu.md: витрата доларовою карткою йде в ліміт гривневою
  // сумою за курсом НБУ (`amount_uah`); без курсу не рахується зовсім, а
  // центи не стають копійками.
  it("валютна картка: у ліміт іде amount_uah, рядок без курсу не рахується", async () => {
    await seedUser(USER_A);
    await pool.query(
      `INSERT INTO mono_account (user_id, mono_account_id, currency_code)
       VALUES ($1, 'acct-usd', 840)`,
      [USER_A],
    );
    await seedLimit(USER_A, 1000);
    await spend(USER_A, 500);
    const usd = async (amountUah: number | null) =>
      pool.query(
        `INSERT INTO mono_transaction
           (user_id, mono_account_id, mono_tx_id, time, amount, operation_amount,
            currency_code, mcc, description, raw, source, category_slug, amount_uah)
         VALUES ($1, 'acct-usd', $2, $3, -100000, -100000, 840, 5411, 'Shop',
                 '{}'::jsonb, 'webhook', 'food', $4)`,
        [USER_A, randomUUID(), new Date(NOON.getTime() - 60_000), amountUah],
      );
    // $1000 без курсу: якби центи рахувались копійками, це 1000 ₴ і 150 %.
    await usd(null);
    expect(await runFinykLimitPush(db, USER_A, NOON, "sync")).toBe("nothing");
    // 350 ₴ за курсом НБУ: 500 + 350 = 85 % ліміту.
    await usd(-35_000);
    expect(await runFinykLimitPush(db, USER_A, NOON, "sync")).toBe("sent");
    expect(sendToUserQuietly.mock.calls[0]![1].title).toBe(
      "Ліміт «Продукти» майже вичерпано",
    );
  });

  it("100 % після 80 %, а далі тиша", async () => {
    await seedUser(USER_A);
    await seedLimit(USER_A, 1000);
    await spend(USER_A, 850);
    expect(await runFinykLimitPush(db, USER_A, NOON, "mono_webhook")).toBe(
      "sent",
    );
    await spend(USER_A, 200);
    expect(await runFinykLimitPush(db, USER_A, NOON, "mono_webhook")).toBe(
      "sent",
    );
    await spend(USER_A, 50);
    expect(await runFinykLimitPush(db, USER_A, NOON, "mono_webhook")).toBe(
      "nothing",
    );
    expect(sendToUserQuietly.mock.calls.map((c) => c[1].title)).toEqual([
      "Ліміт «Продукти» майже вичерпано",
      "Ліміт «Продукти» перевищено",
    ]);
  });

  it("стрибок 70 % → 105 %: один push про 100 %, обидва ключі зайняті", async () => {
    await seedUser(USER_A);
    const budgetId = await seedLimit(USER_A, 1000);
    await spend(USER_A, 1050);
    expect(await runFinykLimitPush(db, USER_A, NOON, "sync")).toBe("sent");
    expect(sendToUserQuietly).toHaveBeenCalledTimes(1);
    expect(sendToUserQuietly.mock.calls[0]![1].title).toBe(
      "Ліміт «Продукти» перевищено",
    );
    expect(await logKeys(USER_A)).toEqual(
      expect.arrayContaining([
        `finyk_limit_${budgetId}_2026-11_80`,
        `finyk_limit_${budgetId}_2026-11_100`,
      ]),
    );
  });

  it("два одночасні процеси шлють один push і займають один слот", async () => {
    await seedUser(USER_A);
    await seedLimit(USER_A, 1000);
    await spend(USER_A, 900);
    const outcomes = await Promise.all([
      runFinykLimitPush(db, USER_A, NOON, "mono_webhook"),
      runFinykLimitPush(db, USER_A, NOON, "sync"),
    ]);
    expect(outcomes.filter((o) => o === "sent")).toHaveLength(1);
    expect(sendToUserQuietly).toHaveBeenCalledTimes(1);
    const slots = (await logKeys(USER_A)).filter((k) =>
      k.startsWith("push-budget-"),
    );
    expect(slots).toHaveLength(1);
  });

  it("тумблер вимкнено: нічого не шлеться й не займається", async () => {
    await seedUser(USER_A);
    await seedLimit(USER_A, 1000);
    await spend(USER_A, 900);
    await pool.query(
      `INSERT INTO user_preferences (user_id, push_finyk_alerts) VALUES ($1, FALSE)`,
      [USER_A],
    );
    expect(await runFinykLimitPush(db, USER_A, NOON, "mono_webhook")).toBe(
      "disabled",
    );
    expect(sendToUserQuietly).not.toHaveBeenCalled();
    expect(await logKeys(USER_A)).toEqual([]);
  });

  it("стеля вибрана: push не йде, поріг зайнято й не досилається", async () => {
    await seedUser(USER_A);
    const budgetId = await seedLimit(USER_A, 1000);
    await spend(USER_A, 900);
    await pool.query(
      `INSERT INTO user_preferences (user_id, push_daily_cap) VALUES ($1, 1)`,
      [USER_A],
    );
    await pool.query(
      `INSERT INTO push_reminder_log (user_id, dedup_key, module, day_key)
       VALUES ($1, 'push-budget-2026-11-19-1', 'budget', '2026-11-19')`,
      [USER_A],
    );
    expect(await runFinykLimitPush(db, USER_A, NOON, "mono_webhook")).toBe(
      "cap_exhausted",
    );
    expect(sendToUserQuietly).not.toHaveBeenCalled();
    expect(await logKeys(USER_A)).toContain(
      `finyk_limit_${budgetId}_2026-11_80`,
    );
    // Наступного ранку після тихих годин поріг не дошлеться: ключ зайнятий.
    await runFinykPushSweep(
      pool,
      QUIET_END,
      new Date(QUIET_END.getTime() - 60_000),
    );
    expect(sendToUserQuietly).not.toHaveBeenCalled();
  });

  it("тиха година: зараз нічого, у першу хвилину після кінця досилається", async () => {
    await seedUser(USER_A);
    await seedLimit(USER_A, 1000);
    await spend(USER_A, 900, NIGHT);
    expect(await runFinykLimitPush(db, USER_A, NIGHT, "mono_webhook")).toBe(
      "quiet_deferred",
    );
    expect(sendToUserQuietly).not.toHaveBeenCalled();
    expect(await logKeys(USER_A)).toEqual([]);

    // Хвилина до кінця тихих годин: ще не час.
    const before = new Date(QUIET_END.getTime() - 60_000);
    await runFinykPushSweep(pool, before, new Date(before.getTime() - 60_000));
    expect(sendToUserQuietly).not.toHaveBeenCalled();

    const result = await runFinykPushSweep(pool, QUIET_END, before);
    expect(result.catchUp).toBe(1);
    expect(sendToUserQuietly).toHaveBeenCalledTimes(1);
    // Повтор тієї самої хвилини (друга репліка) нічого не додає.
    await runFinykPushSweep(pool, QUIET_END, before);
    expect(sendToUserQuietly).toHaveBeenCalledTimes(1);
  });

  it("разовий ліміт push не отримує", async () => {
    await seedUser(USER_A);
    await seedLimit(USER_A, 1000, "one_time");
    await spend(USER_A, 900);
    expect(await runFinykLimitPush(db, USER_A, NOON, "mono_webhook")).toBe(
      "no_limits",
    );
    expect(sendToUserQuietly).not.toHaveBeenCalled();
  });

  it("ізоляція: витрати й ключі одного не впливають на іншого", async () => {
    await seedUser(USER_A);
    await seedUser(USER_B);
    await seedLimit(USER_A, 1000);
    const budgetB = await seedLimit(USER_B, 1000);
    await spend(USER_A, 900);
    await spend(USER_B, 100);

    expect(await runFinykLimitPush(db, USER_A, NOON, "mono_webhook")).toBe(
      "sent",
    );
    expect(await runFinykLimitPush(db, USER_B, NOON, "mono_webhook")).toBe(
      "nothing",
    );
    expect(sendToUserQuietly).toHaveBeenCalledTimes(1);
    expect(sendToUserQuietly.mock.calls[0]![0]).toBe(USER_A);

    await spend(USER_B, 800);
    expect(await runFinykLimitPush(db, USER_B, NOON, "mono_webhook")).toBe(
      "sent",
    );
    expect(await logKeys(USER_B)).toContain(
      `finyk_limit_${budgetB}_2026-11_80`,
    );
  });
});

describe("push «завтра спишеться»", () => {
  async function seedSubscription(userId: string): Promise<void> {
    await pool.query(
      `INSERT INTO finyk_subscriptions (id, user_id, data_json)
       VALUES ($1, $2, $3::jsonb)`,
      [
        randomUUID(),
        userId,
        JSON.stringify({
          name: "Netflix",
          billingDay: 20,
          expectedAmount: 29_900,
          currency: "UAH",
        }),
      ],
    );
  }

  it("о 09:00 напередодні один раз, з назвою й сумою", async () => {
    await seedUser(USER_A);
    await seedSubscription(USER_A);
    const prev = new Date(NINE.getTime() - 60_000);

    const result = await runFinykPushSweep(pool, NINE, prev);
    expect(result.due).toBe(1);
    expect(sendToUserQuietly).toHaveBeenCalledTimes(1);
    const [userId, payload] = sendToUserQuietly.mock.calls[0]!;
    expect(userId).toBe(USER_A);
    expect(payload.title).toBe("Завтра спишеться «Netflix»");
    expect(payload.body).toBe("Сума 299 ₴");

    // Друга репліка тієї ж хвилини і наступна хвилина: тиша.
    await runFinykPushSweep(pool, NINE, prev);
    await runFinykPushSweep(pool, new Date(NINE.getTime() + 60_000), NINE);
    expect(sendToUserQuietly).toHaveBeenCalledTimes(1);
    expect(
      (await logKeys(USER_A)).filter((k) => k.startsWith("finyk_due_")),
    ).toHaveLength(1);
  });

  it("не о 09:00 і не напередодні нічого не шле", async () => {
    await seedUser(USER_A);
    await seedSubscription(USER_A);
    await runFinykPushSweep(pool, NOON, new Date(NOON.getTime() - 60_000));
    // 18 листопада о 09:00: списання 20-го ще не «завтра».
    const day18 = new Date("2026-11-18T07:00:00.000Z");
    await runFinykPushSweep(pool, day18, new Date(day18.getTime() - 60_000));
    expect(sendToUserQuietly).not.toHaveBeenCalled();
  });

  it("тумблер вимкнено: людина не є кандидатом", async () => {
    await seedUser(USER_A);
    await seedSubscription(USER_A);
    await pool.query(
      `INSERT INTO user_preferences (user_id, push_finyk_alerts) VALUES ($1, FALSE)`,
      [USER_A],
    );
    const result = await runFinykPushSweep(
      pool,
      NINE,
      new Date(NINE.getTime() - 60_000),
    );
    expect(result.due).toBe(0);
    expect(sendToUserQuietly).not.toHaveBeenCalled();
  });
});
