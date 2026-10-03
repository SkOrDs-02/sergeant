/**
 * Last validated: 2026-08-25
 * Status: Active
 *
 * Matcher чеків Сільпо проти СПРАВЖНЬОГО Postgres.
 *
 * Навіщо це існує окремо від `modules/silpo/receipts.test.ts`. Той тест
 * підміняє БД фейком, який дивиться на текст запиту й повертає заготовлені
 * рядки — тобто SQL там ніколи не парситься. 2026-08-25 це коштувало
 * продакшену: у кандидатному запиті пропали одинарні лапки
 * (`data_json->>'id'` → `data_json->>id`, `TIME '12:00'` → `TIME 12:00`),
 * усі юніт-тести лишились зеленими, а на живій базі запит падав із
 * синтаксичною помилкою — тобто matcher мовчки не працював узагалі.
 *
 * Висновок, ширший за цей файл: **рукописний SQL, який жоден тест не
 * виконує на реальній БД, не вважається покритим.** Тут запит саме
 * ВИКОНУЄТЬСЯ, тож будь-яка синтаксична поломка валить тест миттєво.
 *
 * CI: падає голосно, коли Docker недоступний. Локально — скіпається.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { Pool } from "pg";
import {
  bootIntegrationHarness,
  shutdownIntegrationHarness,
  seedIntegrationUser,
  truncateIntegrationTables,
  INTEGRATION_TIMEOUT_MS,
} from "../test/createIntegrationApp.js";
import { matchAndLink } from "../modules/silpo/receiptsMatch.js";
import type { QueryFn } from "../modules/silpo/tokenStore.js";

const USER_ID = "silpo-matcher-integ";
const RECEIPT_ID = "r-integ-1";

let pool: Pool | undefined;
let dockerAvailable = false;

/** `matchAndLink` чекає `QueryFn` (text, values, meta) — pool бере два. */
function poolQueryFn(p: Pool): QueryFn {
  return ((text: string, values?: unknown[]) =>
    p.query(text, values as never)) as unknown as QueryFn;
}

beforeAll(async () => {
  try {
    const harness = await bootIntegrationHarness();
    pool = harness.pool;
    dockerAvailable = true;
  } catch (e) {
    if (process.env["CI"]) throw e;
    console.warn(
      `[silpo matcher integration] Skipping: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}, INTEGRATION_TIMEOUT_MS);

afterAll(async () => {
  await shutdownIntegrationHarness();
});

beforeEach(async () => {
  if (!pool) return;
  await truncateIntegrationTables(pool);
  await seedIntegrationUser(pool, USER_ID);
});

async function seedReceipt(p: Pool, totalKop: number, purchasedAt: string) {
  await p.query(
    `INSERT INTO silpo_receipts
       (user_id, receipt_id, purchased_at, store_id, channel, payment_hint, total_kop, raw)
     VALUES ($1, $2, $3, NULL, 'offline', NULL, $4, '{}'::jsonb)`,
    [USER_ID, RECEIPT_ID, purchasedAt, totalKop],
  );
}

async function seedManualExpense(
  p: Pool,
  id: string,
  amountUah: number,
  date: string,
  extra: Record<string, unknown> = {},
) {
  await p.query(
    `INSERT INTO finyk_manual_expenses (user_id, data_json)
     VALUES ($1, $2::jsonb)`,
    [
      USER_ID,
      JSON.stringify({
        id,
        description: "Сільпо",
        amount: amountUah,
        date,
        kind: "expense",
        ...extra,
      }),
    ],
  );
}

describe("matchAndLink — реальний Postgres", () => {
  it(
    "звʼязує чек із РУЧНОЮ витратою (скрін банкінгу, не mono)",
    async (ctx) => {
      if (!dockerAvailable || !pool) return ctx.skip();
      const p = pool;
      await seedReceipt(p, 74_784, "2026-08-24T18:09:00Z");
      await seedManualExpense(p, "manual-1", 747.84, "2026-08-24");

      const result = await matchAndLink(USER_ID, poolQueryFn(p));

      expect(result).toMatchObject({ matched: 1, unmatched: 0 });
      const { rows } = await p.query(
        `SELECT transaction_id FROM silpo_tx_receipt_links WHERE user_id = $1`,
        [USER_ID],
      );
      expect(rows).toEqual([{ transaction_id: "manual-1" }]);
    },
    INTEGRATION_TIMEOUT_MS,
  );

  it(
    "видалену витрату кандидатом не бере",
    async (ctx) => {
      if (!dockerAvailable || !pool) return ctx.skip();
      // `finyk_manual_expenses` — soft-delete. Без фільтра `deleted_at`
      // чек чіплявся б до витрати, якої для користувача вже не існує.
      const p = pool;
      await seedReceipt(p, 74_784, "2026-08-24T18:09:00Z");
      await seedManualExpense(p, "manual-dead", 747.84, "2026-08-24");
      await p.query(
        `UPDATE finyk_manual_expenses SET deleted_at = NOW() WHERE user_id = $1`,
        [USER_ID],
      );

      const result = await matchAndLink(USER_ID, poolQueryFn(p));

      expect(result).toMatchObject({ matched: 0, unmatched: 1 });
    },
    INTEGRATION_TIMEOUT_MS,
  );

  it(
    "надходження на ту саму суму не є кандидатом",
    async (ctx) => {
      if (!dockerAvailable || !pool) return ctx.skip();
      const p = pool;
      await seedReceipt(p, 74_784, "2026-08-24T18:09:00Z");
      await seedManualExpense(p, "manual-income", 747.84, "2026-08-24", {
        kind: "income",
      });

      const result = await matchAndLink(USER_ID, poolQueryFn(p));

      expect(result).toMatchObject({ matched: 0, unmatched: 1 });
    },
    INTEGRATION_TIMEOUT_MS,
  );
});
