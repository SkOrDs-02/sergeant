import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type pg from "pg";
import {
  startPgContainer,
  stopPgContainer,
  truncateAll,
} from "../../test/pg-container.js";
import type { TelegramApiClient } from "../alerts/telegramShipper.js";
import {
  grantManualAccess,
  requestManualAccess,
  type ManualAccessConfig,
} from "./manualAccess.js";
import { accessStateOf, getUserPlan } from "./getUserPlan.js";

// AI-NOTE: живий лейн ручного Premium (спека manual-premium-request.md) на
// справжньому Postgres з усіма міграціями: частковий унікальний індекс
// запиту (169), `subscriptions_user_active_idx` (056) і FK на "user" -
// те, що in-memory модель у `manualAccess.test.ts` лише імітує.

const USER = "user-test-1";
const OPEN: ManualAccessConfig = {
  billingEnforced: false,
  botToken: "token-stub",
  adminChatId: "555000111",
  webhookSecret: "secret-stub",
};
const CTX = {
  surface: "unlimited_ai_photo" as const,
  page: null,
  viewport: null,
  userAgent: null,
  appEnv: "test",
};

let pool: pg.Pool;

function telegram(): TelegramApiClient {
  return {
    sendMessage: vi.fn(async () => ({ ok: true, messageId: 1 })),
    editMessageText: vi.fn(),
    answerCallbackQuery: vi.fn(),
  } as unknown as TelegramApiClient;
}

async function ensureUser(id: string): Promise<void> {
  await pool.query(
    `INSERT INTO "user" (id, email, name, "emailVerified", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, false, NOW(), NOW())
     ON CONFLICT (id) DO NOTHING`,
    [id, `${id}@test.local`, id],
  );
}

async function requestId(): Promise<string> {
  await requestManualAccess(pool, USER, CTX, telegram(), OPEN);
  const { rows } = await pool.query<{ id: string }>(
    `SELECT id FROM feedback_entries WHERE user_id = $1 AND category = 'premium_request'`,
    [USER],
  );
  return String(rows[0]?.id);
}

beforeAll(async () => {
  pool = await startPgContainer();
}, 180_000);

afterAll(async () => {
  await stopPgContainer();
});

beforeEach(async () => {
  await truncateAll();
  await ensureUser(USER);
});

describe("manualAccess - живий Postgres", () => {
  it("один запит на акаунт тримає індекс 169", async () => {
    await requestManualAccess(pool, USER, CTX, telegram(), OPEN);
    await expect(
      requestManualAccess(pool, USER, CTX, telegram(), OPEN),
    ).rejects.toMatchObject({ code: "MANUAL_ACCESS_ALREADY_REQUESTED" });
  });

  it("видача: pro/active/manual на 30 днів, повтор ALREADY_GRANTED", async () => {
    const id = await requestId();
    const res = await grantManualAccess(pool, id);
    expect(res.ok).toBe(true);
    const plan = await getUserPlan(pool, USER);
    expect(accessStateOf(plan)).toBe("pro");
    expect(plan.provider).toBe("manual");
    const days =
      ((plan.currentPeriodEnd?.getTime() ?? 0) - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(29.9);
    expect(days).toBeLessThan(30.1);
    expect(await grantManualAccess(pool, id)).toEqual({
      ok: false,
      reason: "ALREADY_GRANTED",
    });
    const { rows } = await pool.query(
      `SELECT 1 FROM subscriptions WHERE user_id = $1`,
      [USER],
    );
    expect(rows).toHaveLength(1);
  });

  it("прострочений trial не блокує видачу (крок 3 ядра)", async () => {
    await pool.query(
      `INSERT INTO subscriptions (user_id, plan, status, provider, current_period_end)
       VALUES ($1, 'pro', 'trialing', 'manual', NOW() - INTERVAL '1 day')`,
      [USER],
    );
    const id = await requestId();
    expect((await grantManualAccess(pool, id)).ok).toBe(true);
    expect(accessStateOf(await getUserPlan(pool, USER))).toBe("pro");
    const { rows } = await pool.query<{ status: string }>(
      `SELECT status FROM subscriptions WHERE user_id = $1 ORDER BY id`,
      [USER],
    );
    expect(rows.map((r) => r.status)).toEqual(["canceled", "active"]);
  });

  it("видалений акаунт: USER_GONE, позначка видачі відкочена", async () => {
    const id = await requestId();
    await pool.query(`DELETE FROM "user" WHERE id = $1`, [USER]);
    expect(await grantManualAccess(pool, id)).toEqual({
      ok: false,
      reason: "USER_GONE",
    });
    const { rows } = await pool.query<{ premium_granted_at: Date | null }>(
      `SELECT premium_granted_at FROM feedback_entries WHERE id = $1`,
      [id],
    );
    expect(rows[0]?.premium_granted_at).toBeNull();
  });
});
