import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { FeedbackSubmitSchema } from "@sergeant/shared";

/**
 * Ручний Premium (спека `docs/work/specs/manual-premium-request.md`).
 *
 * Пул - in-memory модель рівно тих SQL, які пишуть `manualAccess.ts` і
 * `getUserPlan.ts`: таблиці `feedback_entries` і `subscriptions`, частковий
 * унікальний індекс `subscriptions_user_active_idx` (23505), FK на "user"
 * (23503), транзакції через знімок. `NOW()` моделі = системний час, тож
 * `vi.setSystemTime` рухає і SQL, і `accessStateOf`. Живий лейн на справжньому
 * Postgres - `manualAccess.integration.test.ts`.
 */

const { getWeeklyUsageMock } = vi.hoisted(() => ({
  getWeeklyUsageMock: vi.fn(),
}));
vi.mock("../chat/aiQuota.js", () => ({ getWeeklyUsage: getWeeklyUsageMock }));

import {
  MANUAL_PREMIUM_DAYS,
  grantManualAccess,
  manualAccessStatus,
  requestManualAccess,
  type ManualAccessConfig,
} from "./manualAccess.js";
import { accessStateOf, getUserPlan } from "./getUserPlan.js";
import { buildAccessSnapshot } from "./accessSnapshot.js";
import type { TelegramApiClient } from "../alerts/telegramShipper.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const ACTIVE = ["active", "trialing", "past_due"];
const USER = "user-test-1";
const ADMIN_CHAT_ID = "555000111";

interface FeedbackRow {
  id: number;
  category: string;
  message: string;
  user_id: string | null;
  created_at: Date;
  premium_granted_at: Date | null;
}
interface SubRow {
  user_id: string;
  plan: string;
  status: string;
  provider: string;
  current_period_end: Date | null;
  grace_period_ends_at: Date | null;
  cancel_at_period_end: boolean;
}

function entitled(r: SubRow, now: Date): boolean {
  if (r.status === "active" || r.status === "trialing") {
    return r.current_period_end == null || r.current_period_end > now;
  }
  if (r.status === "past_due") {
    const grace =
      r.grace_period_ends_at ??
      (r.current_period_end
        ? new Date(r.current_period_end.getTime() + 3 * DAY_MS)
        : null);
    return grace != null && grace > now;
  }
  return false;
}

class FakeDb {
  users = new Set<string>([USER]);
  feedback: FeedbackRow[] = [];
  subs: SubRow[] = [];
  private seq = 0;
  private snapshot: { feedback: FeedbackRow[]; subs: SubRow[] } | null = null;

  private clone() {
    return {
      feedback: this.feedback.map((r) => ({ ...r })),
      subs: this.subs.map((r) => ({ ...r })),
    };
  }

  async run(sql: string, params: unknown[] = []): Promise<{ rows: unknown[] }> {
    const now = new Date();
    const p0 = params[0];
    if (sql === "BEGIN") {
      this.snapshot = this.clone();
      return { rows: [] };
    }
    if (sql === "COMMIT") {
      this.snapshot = null;
      return { rows: [] };
    }
    if (sql === "ROLLBACK") {
      if (this.snapshot) Object.assign(this, this.snapshot);
      this.snapshot = null;
      return { rows: [] };
    }
    if (sql.includes("SELECT plan, status, current_period_end")) {
      const row = this.subs.find((r) => r.user_id === p0 && entitled(r, now));
      return { rows: row ? [row] : [] };
    }
    if (sql.includes("INSERT INTO feedback_entries")) {
      const userId = params[3] as string;
      const dup = this.feedback.some(
        (r) => r.category === "premium_request" && r.user_id === userId,
      );
      if (dup) return { rows: [] };
      const row: FeedbackRow = {
        id: ++this.seq,
        category: "premium_request",
        message: String(p0),
        user_id: userId,
        created_at: now,
        premium_granted_at: null,
      };
      this.feedback.push(row);
      return { rows: [{ id: String(row.id), created_at: row.created_at }] };
    }
    if (sql.includes("SELECT created_at")) {
      const row = this.feedback.find(
        (r) => r.category === "premium_request" && r.user_id === p0,
      );
      return { rows: row ? [{ created_at: row.created_at }] : [] };
    }
    const request = () =>
      this.feedback.find(
        (r) => String(r.id) === String(p0) && r.category === "premium_request",
      );
    if (sql.includes("UPDATE feedback_entries")) {
      const row = request();
      if (!row || row.premium_granted_at) return { rows: [] };
      row.premium_granted_at = now;
      return { rows: [{ user_id: row.user_id }] };
    }
    if (sql.includes("SELECT 1 FROM feedback_entries")) {
      return { rows: request() ? [{}] : [] };
    }
    if (sql.includes("AS entitled")) {
      return {
        rows: this.subs
          .filter((r) => r.user_id === p0)
          .map((r) => ({ entitled: entitled(r, now) })),
      };
    }
    if (sql.includes("UPDATE subscriptions") && sql.includes("'canceled'")) {
      for (const r of this.subs) {
        if (r.user_id === p0 && ACTIVE.includes(r.status))
          r.status = "canceled";
      }
      return { rows: [] };
    }
    if (sql.includes("INSERT INTO subscriptions")) {
      const userId = String(p0);
      if (!this.users.has(userId)) throw { code: "23503" };
      if (
        this.subs.some((r) => r.user_id === userId && ACTIVE.includes(r.status))
      ) {
        throw { code: "23505" };
      }
      const row: SubRow = {
        user_id: userId,
        plan: "pro",
        status: "active",
        provider: "manual",
        current_period_end: new Date(
          now.getTime() + Number(params[1]) * DAY_MS,
        ),
        grace_period_ends_at: null,
        cancel_at_period_end: false,
      };
      this.subs.push(row);
      return { rows: [{ current_period_end: row.current_period_end }] };
    }
    throw new Error(`unexpected SQL: ${sql.slice(0, 80)}`);
  }

  pool(): Pool {
    const query = (sql: string, params?: unknown[]) => this.run(sql, params);
    return {
      query,
      connect: async () => ({ query, release: () => undefined }),
    } as unknown as Pool;
  }

  addSub(partial: Partial<SubRow>): void {
    this.subs.push({
      user_id: USER,
      plan: "pro",
      status: "active",
      provider: "manual",
      current_period_end: null,
      grace_period_ends_at: null,
      cancel_at_period_end: false,
      ...partial,
    });
  }
}

const OPEN: ManualAccessConfig = {
  billingEnforced: false,
  botToken: "token-stub",
  adminChatId: ADMIN_CHAT_ID,
  webhookSecret: "secret-stub",
};
const CTX = {
  surface: "unlimited_ai_photo" as const,
  page: "/nutrition",
  viewport: "390x844",
  userAgent: "UA-stub",
  appEnv: "test",
};

function telegramStub(
  impl?: () => Promise<{ ok: boolean; errorCode?: number }>,
) {
  const sendMessage = vi.fn(impl ?? (async () => ({ ok: true, messageId: 1 })));
  const client = {
    sendMessage,
    editMessageText: vi.fn(),
    answerCallbackQuery: vi.fn(),
  } as unknown as TelegramApiClient;
  return { client, sendMessage };
}

let db: FakeDb;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-18T10:00:00Z"));
  db = new FakeDb();
});
afterEach(() => {
  vi.useRealTimers();
  getWeeklyUsageMock.mockReset();
});

describe("requestManualAccess", () => {
  it("перший запит Free-акаунта: рядок і рівно одне повідомлення з кнопкою видачі", async () => {
    const tg = telegramStub();
    const res = await requestManualAccess(
      db.pool(),
      USER,
      CTX,
      tg.client,
      OPEN,
    );
    expect(res.requestedAt).toBe("2026-11-18T10:00:00.000Z");
    expect(db.feedback).toHaveLength(1);
    expect(db.feedback[0]?.message).toBe(
      "Запит Premium з пейволу: unlimited_ai_photo",
    );
    expect(tg.sendMessage).toHaveBeenCalledTimes(1);
    const sent = (
      tg.sendMessage.mock.calls[0] as unknown[] | undefined
    )?.[0] as {
      chatId: string;
      text: string;
      replyMarkup: {
        inline_keyboard: { text: string; callback_data: string }[][];
      };
    };
    expect(sent.chatId).toBe(ADMIN_CHAT_ID);
    expect(sent.text).toBe("Запит Premium #1 · пейвол: unlimited_ai_photo");
    expect(sent.text).not.toContain(USER);
    expect(sent.text).not.toContain("@");
    expect(sent.replyMarkup.inline_keyboard).toEqual([
      [{ text: "Видати на 30 днів", callback_data: "mp:grant:1" }],
    ]);
  });

  it("другий запит того самого акаунта: 409 ALREADY_REQUESTED і нуль повідомлень", async () => {
    await requestManualAccess(
      db.pool(),
      USER,
      CTX,
      telegramStub().client,
      OPEN,
    );
    const tg = telegramStub();
    await expect(
      requestManualAccess(db.pool(), USER, CTX, tg.client, OPEN),
    ).rejects.toMatchObject({
      status: 409,
      code: "MANUAL_ACCESS_ALREADY_REQUESTED",
    });
    expect(tg.sendMessage).not.toHaveBeenCalled();
    expect(db.feedback).toHaveLength(1);
  });

  it.each([
    ["pro", { status: "active", provider: "liqpay" }],
    [
      "trial",
      {
        status: "trialing",
        current_period_end: new Date("2026-11-20T00:00:00Z"),
      },
    ],
    [
      "grace",
      {
        status: "past_due",
        current_period_end: new Date("2026-11-17T00:00:00Z"),
      },
    ],
  ])("стан %s: 409 MANUAL_ACCESS_NOT_NEEDED", async (_label, sub) => {
    db.addSub(sub);
    const tg = telegramStub();
    await expect(
      requestManualAccess(db.pool(), USER, CTX, tg.client, OPEN),
    ).rejects.toMatchObject({ code: "MANUAL_ACCESS_NOT_NEEDED" });
    expect(tg.sendMessage).not.toHaveBeenCalled();
    expect(db.feedback).toHaveLength(0);
  });

  it.each([
    ["увімкнено провайдера", { billingEnforced: true }],
    ["порожній токен", { botToken: "" }],
    ["порожній chat id", { adminChatId: "" }],
    ["порожній секрет вебхука", { webhookSecret: " " }],
  ])(
    "%s: 409 MANUAL_ACCESS_CLOSED, знімок available: false",
    async (_l, over) => {
      const cfg = { ...OPEN, ...over };
      const tg = telegramStub();
      await expect(
        requestManualAccess(db.pool(), USER, CTX, tg.client, cfg),
      ).rejects.toMatchObject({ code: "MANUAL_ACCESS_CLOSED" });
      expect(tg.sendMessage).not.toHaveBeenCalled();
      expect(await manualAccessStatus(db.pool(), USER, cfg)).toEqual({
        available: false,
        requestedAt: null,
      });
    },
  );

  it.each([
    ["мережа впала", async () => Promise.reject(new Error("ETIMEDOUT"))],
    ["Telegram відмовив", async () => ({ ok: false, errorCode: 403 })],
  ])("%s: відповідь успішна, рядок лишається", async (_l, impl) => {
    const tg = telegramStub(impl);
    await expect(
      requestManualAccess(db.pool(), USER, CTX, tg.client, OPEN),
    ).resolves.toMatchObject({ requestedAt: expect.any(String) });
    expect(db.feedback).toHaveLength(1);
  });

  it("знімок: requestedAt зʼявляється після запиту", async () => {
    expect(await manualAccessStatus(db.pool(), USER, OPEN)).toEqual({
      available: true,
      requestedAt: null,
    });
    await requestManualAccess(
      db.pool(),
      USER,
      CTX,
      telegramStub().client,
      OPEN,
    );
    expect(await manualAccessStatus(db.pool(), USER, OPEN)).toEqual({
      available: true,
      requestedAt: "2026-11-18T10:00:00.000Z",
    });
  });

  it("анонімний фідбек не може створити premium_request (клієнтська схема)", () => {
    const parsed = FeedbackSubmitSchema.safeParse({
      category: "premium_request",
      message: "дай Premium",
    });
    expect(parsed.success).toBe(false);
  });
});

async function requestAndGetId(): Promise<string> {
  await requestManualAccess(db.pool(), USER, CTX, telegramStub().client, OPEN);
  return String(db.feedback[0]?.id);
}

describe("grantManualAccess", () => {
  it("видає pro/active/manual на 30 днів, getUserPlan віддає pro", async () => {
    const id = await requestAndGetId();
    const res = await grantManualAccess(db.pool(), id);
    expect(res).toEqual({
      ok: true,
      currentPeriodEnd: new Date(Date.now() + MANUAL_PREMIUM_DAYS * DAY_MS),
    });
    expect(db.subs).toHaveLength(1);
    expect(db.subs[0]).toMatchObject({
      plan: "pro",
      status: "active",
      provider: "manual",
    });
    expect(db.feedback[0]?.premium_granted_at).toBeInstanceOf(Date);
    const plan = await getUserPlan(db.pool(), USER);
    expect(accessStateOf(plan)).toBe("pro");
  });

  it("дефект простроченого trial: старий рядок стає canceled, доступ pro (RED без кроку 3)", async () => {
    db.addSub({
      status: "trialing",
      provider: "manual",
      current_period_end: new Date(Date.now() - DAY_MS),
    });
    const id = await requestAndGetId();
    const res = await grantManualAccess(db.pool(), id);
    expect(res.ok).toBe(true);
    expect(accessStateOf(await getUserPlan(db.pool(), USER))).toBe("pro");
    expect(db.subs.map((r) => r.status)).toEqual(["canceled", "active"]);
  });

  it("повторна видача: ALREADY_GRANTED без змін; після 30 днів доступ не продовжується", async () => {
    const id = await requestAndGetId();
    await grantManualAccess(db.pool(), id);
    expect(await grantManualAccess(db.pool(), id)).toEqual({
      ok: false,
      reason: "ALREADY_GRANTED",
    });
    expect(db.subs).toHaveLength(1);

    vi.setSystemTime(Date.now() + (MANUAL_PREMIUM_DAYS + 1) * DAY_MS);
    expect(await grantManualAccess(db.pool(), id)).toEqual({
      ok: false,
      reason: "ALREADY_GRANTED",
    });
    expect(db.subs).toHaveLength(1);
    expect(accessStateOf(await getUserPlan(db.pool(), USER))).toBe("free");
  });

  it("чинний платний Premium: ALREADY_PREMIUM, premium_granted_at лишається NULL", async () => {
    const id = await requestAndGetId();
    db.addSub({
      provider: "liqpay",
      current_period_end: new Date(Date.now() + 10 * DAY_MS),
    });
    expect(await grantManualAccess(db.pool(), id)).toEqual({
      ok: false,
      reason: "ALREADY_PREMIUM",
    });
    expect(db.feedback[0]?.premium_granted_at).toBeNull();
    expect(db.subs).toHaveLength(1);
  });

  it("невідомий номер: REQUEST_NOT_FOUND", async () => {
    expect(await grantManualAccess(db.pool(), "999")).toEqual({
      ok: false,
      reason: "REQUEST_NOT_FOUND",
    });
  });

  it("видалений акаунт: USER_GONE і ROLLBACK позначки", async () => {
    const id = await requestAndGetId();
    db.users.delete(USER);
    expect(await grantManualAccess(db.pool(), id)).toEqual({
      ok: false,
      reason: "USER_GONE",
    });
    expect(db.feedback[0]?.premium_granted_at).toBeNull();
  });

  it("на current_period_end + 1 хв стан free і тижнева квота знову діє", async () => {
    const id = await requestAndGetId();
    const res = await grantManualAccess(db.pool(), id);
    if (!res.ok) throw new Error("grant failed");
    getWeeklyUsageMock.mockResolvedValue({
      ai: 0,
      photo: 0,
      "finyk-vision": 0,
    });

    const during = await buildAccessSnapshot(db.pool(), USER);
    expect(during.state).toBe("pro");
    expect(during.meters.aiPhoto.limit).toBeNull();

    vi.setSystemTime(res.currentPeriodEnd.getTime() + 60_000);
    const after = await buildAccessSnapshot(db.pool(), USER);
    expect(after.state).toBe("free");
    expect(after.meters.aiPhoto.limit).toBe(3);
    expect(after.manualAccess?.requestedAt).toBe("2026-11-18T10:00:00.000Z");
  });
});
