/**
 * Integration tests for GDPR data-rights routes:
 *   DELETE /api/me      — account deletion + CASCADE
 *   GET /api/me/export  — data export includes seeded rows
 *   PATCH /api/me/preferences — upsert round-trip
 *
 * Uses Testcontainers Postgres + createApp() + mocked getSessionUser.
 * Pattern mirrors transcribe-usd-cap.e2e.test.ts (vi.hoisted + dynamic import).
 *
 * CI: fails loudly if Docker unavailable. Local: skips gracefully.
 *
 * PR-2 of the integration test batch (cursor/pr2-auth-datarights-integration-275a).
 */

import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from "vitest";
import request from "supertest";
import type { Express } from "express";
import type { Pool } from "pg";
import {
  ACCOUNT_DELETION_GRACE_DAYS,
  ACCOUNT_PENDING_DELETION_CODE,
} from "@sergeant/shared";
import {
  bootIntegrationHarness,
  shutdownIntegrationHarness,
  seedIntegrationUser,
  CSRF_HEADERS,
  INTEGRATION_TIMEOUT_MS,
} from "../../test/createIntegrationApp.js";

const { getSessionUserMock } = vi.hoisted(() => ({
  getSessionUserMock: vi.fn(),
}));

vi.mock("../../auth.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../auth.js")>();
  // `/api/me/export` і `DELETE /api/me` стоять під `requireFreshSession()`
  // → `getFreshSessionUser`. Реальний `getFreshSessionUser` викликає
  // ВНУТРІШНІЙ `getSessionUser` (не мок), тож без цього override сесія
  // резолвилась би через Better Auth у 401.
  return {
    ...actual,
    getSessionUser: getSessionUserMock,
    getFreshSessionUser: getSessionUserMock,
  };
});

// Засувка для тесту замка експорту. Без неї «одночасність» двох запитів
// трималась на везінні: на малій тестовій базі перший експорт встигав
// завершитись раніше, ніж другий проходив `requireFreshSession()`, і обидва
// отримували 200. Засувка тримає перший запит усередині обробника (замок
// уже взято), поки тест не відпустить його сам.
const { exportGate } = vi.hoisted(() => ({
  exportGate: {
    entered: null as null | (() => void),
    hold: null as null | Promise<void>,
  },
}));

vi.mock("./dataRights.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./dataRights.js")>();
  return {
    ...actual,
    buildMeExport: async (...args: Parameters<typeof actual.buildMeExport>) => {
      exportGate.entered?.();
      if (exportGate.hold) await exportGate.hold;
      return actual.buildMeExport(...args);
    },
  };
});

// Динамічний імпорт навмисно: статичний тягнув би `../../db.js` (пул) ще до
// того, як `bootIntegrationHarness` підставить адресу Testcontainers, і
// весь застосунок у цьому файлі ходив би на localhost:5432 (ECONNREFUSED).
async function purgeUserData(
  ...args: Parameters<typeof import("./dataRights.js").purgeUserData>
) {
  const mod = await import("./dataRights.js");
  return mod.purgeUserData(...args);
}

const TEST_USER_ID = "user_datarights_int";

/**
 * Ставить мітку видалення старшою за вікно: `purgeUserData` видаляє лише
 * дозрілі акаунти (data-50).
 */
async function markMatured(p: Pool): Promise<void> {
  await p.query(
    `UPDATE "user"
        SET deletion_requested_at = NOW() - (($2::int + 1) || ' days')::interval
      WHERE id = $1`,
    [TEST_USER_ID, ACCOUNT_DELETION_GRACE_DAYS],
  );
}
const TEST_USER_EMAIL = `${TEST_USER_ID}@test.local`;
// Тестовий пароль credential-акаунта (не секрет: існує лише в контейнері).
const TEST_PASSWORD = "correct-horse-battery-staple";

/**
 * `DELETE /api/me` (sec-10) вимагає повторної автентифікації: пароль для
 * акаунта з credential-входом. Сід кладе справжній хеш Better Auth
 * (`ctx.password.hash`), тож роут проходить НАСПРАВДІ свою звірку
 * (`verifyAccountPassword`) без жодного додаткового мока гварда. Без
 * credential-акаунта роут вимагав би сесію ≤ 10 хв із БД, якої в цьому
 * харнесі (мокнутий `getSessionUser`) немає.
 */
async function seedPasswordAccount(db: Pool): Promise<void> {
  const { auth } = await import("../../auth.js");
  const ctx = await auth.$context;
  const hash = await ctx.password.hash(TEST_PASSWORD);
  await db.query(`DELETE FROM account WHERE "userId" = $1`, [TEST_USER_ID]);
  await db.query(
    `INSERT INTO account (id, "accountId", "providerId", "userId", password)
     VALUES ($1, $2, 'credential', $2, $3)`,
    [`acc_${TEST_USER_ID}`, TEST_USER_ID, hash],
  );
}

let app: Express | undefined;
let pool: Pool | undefined;
let dockerAvailable = false;
let skipReason: string | null = null;

beforeAll(async () => {
  try {
    const harness = await bootIntegrationHarness();
    app = harness.app;
    pool = harness.pool;
    dockerAvailable = true;
  } catch (e) {
    if (process.env["CI"]) throw e;
    skipReason = e instanceof Error ? e.message : String(e);
    console.warn(
      `[dataRights integration] Skipping: testcontainers unavailable — ${skipReason}`,
    );
  }
}, INTEGRATION_TIMEOUT_MS);

afterAll(async () => {
  await shutdownIntegrationHarness();
}, INTEGRATION_TIMEOUT_MS);

beforeEach(async () => {
  getSessionUserMock.mockReset();
  if (!pool) return;

  // Re-seed the user before each test so DELETE tests start from a clean state.
  await seedIntegrationUser(pool, TEST_USER_ID, TEST_USER_EMAIL);
  // `seedIntegrationUser` — `ON CONFLICT DO NOTHING`, тож мітка вікна
  // видалення з попереднього тесту пережила б його, і гейт `requireSession`
  // віддавав би 403 на кожен наступний запит цього файлу.
  await pool.query(
    `UPDATE "user" SET deletion_requested_at = NULL WHERE id = $1`,
    [TEST_USER_ID],
  );

  // Remove any leftover preferences or usage rows from previous tests.
  await pool.query(`DELETE FROM user_preferences WHERE user_id = $1`, [
    TEST_USER_ID,
  ]);
  await pool.query(`DELETE FROM ai_usage_daily WHERE subject_key = $1`, [
    `u:${TEST_USER_ID}`,
  ]);

  getSessionUserMock.mockResolvedValue({
    id: TEST_USER_ID,
    email: TEST_USER_EMAIL,
    name: "DataRights Test",
    image: null,
    emailVerified: true,
  });
});

describe("DELETE /api/me — GDPR account deletion + CASCADE", () => {
  // З ADR-0098 (спека user-deletion-grace-window) `DELETE /api/me` нічого
  // незворотного не робить: ставить мітку, гасить сесії, зупиняє списання.
  // Рядок користувача, CASCADE і черга зовнішнього чищення — справа
  // `purgeUserData`, яку добивач кличе після кінця вікна. Тести нижче
  // перевіряють обидві половини окремо.
  it("marks the account for deletion and returns the purge deadline", async (ctx) => {
    if (!dockerAvailable || !app || !pool) return ctx.skip();

    await pool.query(
      `INSERT INTO user_preferences (user_id, analytics, ai_memory, push_notifications)
       VALUES ($1, true, true, false)`,
      [TEST_USER_ID],
    );

    await seedPasswordAccount(pool);

    const res = await request(app)
      .delete("/api/me")
      .set(CSRF_HEADERS)
      .set("Authorization", "Bearer test-bearer")
      .send({ password: TEST_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true });
    expect(res.body.deletedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    const deltaDays =
      (Date.parse(res.body.scheduledPurgeAt) - Date.parse(res.body.deletedAt)) /
      (24 * 60 * 60 * 1000);
    expect(Math.round(deltaDays)).toBe(ACCOUNT_DELETION_GRACE_DAYS);

    // Рядок лишається до кінця вікна, лише з міткою.
    const { rows: userRows } = await pool.query<{
      deletion_requested_at: Date | null;
    }>(`SELECT deletion_requested_at FROM "user" WHERE id = $1`, [
      TEST_USER_ID,
    ]);
    expect(userRows).toHaveLength(1);
    expect(userRows[0]!.deletion_requested_at).not.toBeNull();

    // Дані людини в межах вікна не чіпаються — інакше відновлення не мало б
    // чого повертати.
    const { rows: prefRows } = await pool.query(
      `SELECT user_id FROM user_preferences WHERE user_id = $1`,
      [TEST_USER_ID],
    );
    expect(prefRows).toHaveLength(1);
  });

  it("purgeUserData removes the user row and CASCADEs to user_preferences", async (ctx) => {
    if (!dockerAvailable || !pool) return ctx.skip();

    await pool.query(
      `INSERT INTO user_preferences (user_id, analytics, ai_memory, push_notifications)
       VALUES ($1, true, true, false)`,
      [TEST_USER_ID],
    );

    await markMatured(pool);
    const res = await purgeUserData(pool, TEST_USER_ID);
    expect(res?.ok).toBe(true);

    const { rows: userRows } = await pool.query(
      `SELECT id FROM "user" WHERE id = $1`,
      [TEST_USER_ID],
    );
    expect(userRows).toHaveLength(0);

    const { rows: prefRows } = await pool.query(
      `SELECT user_id FROM user_preferences WHERE user_id = $1`,
      [TEST_USER_ID],
    );
    expect(prefRows).toHaveLength(0);
  });

  it("purgeUserData enqueues one gdpr_cleanup_queue row per external service (ADR-0016 § ADR-6.3)", async (ctx) => {
    if (!dockerAvailable || !pool) return ctx.skip();

    await pool.query(`DELETE FROM gdpr_cleanup_queue WHERE user_id = $1`, [
      TEST_USER_ID,
    ]);

    await markMatured(pool);
    await purgeUserData(pool, TEST_USER_ID);

    const { rows } = await pool.query<{ service: string; email: string }>(
      `SELECT service, email FROM gdpr_cleanup_queue WHERE user_id = $1 ORDER BY service`,
      [TEST_USER_ID],
    );
    expect(rows.map((r) => r.service)).toEqual([
      "posthog",
      "resend",
      "sentry",
      "stripe",
    ]);
    for (const row of rows) {
      expect(row.email).toBe(TEST_USER_EMAIL);
    }
  });

  // data-50: claim добивача комітиться до purge, тож відновлення може
  // встигнути між ними. Purge мусить перечитати мітку і нічого не видалити.
  it("purgeUserData leaves an account restored after the claim untouched", async (ctx) => {
    if (!dockerAvailable || !pool) return ctx.skip();

    await pool.query(`DELETE FROM gdpr_cleanup_queue WHERE user_id = $1`, [
      TEST_USER_ID,
    ]);
    await markMatured(pool);
    await pool.query(
      `UPDATE "user" SET deletion_requested_at = NULL WHERE id = $1`,
      [TEST_USER_ID],
    );

    expect(await purgeUserData(pool, TEST_USER_ID)).toBeNull();

    const { rows: userRows } = await pool.query(
      `SELECT id FROM "user" WHERE id = $1`,
      [TEST_USER_ID],
    );
    expect(userRows).toHaveLength(1);
    const { rows: queued } = await pool.query(
      `SELECT 1 FROM gdpr_cleanup_queue WHERE user_id = $1`,
      [TEST_USER_ID],
    );
    expect(queued).toHaveLength(0);
  });

  it("a fresh login during the grace window is blocked by the pending-deletion gate", async (ctx) => {
    if (!dockerAvailable || !app || !pool) return ctx.skip();

    await seedPasswordAccount(pool);

    const first = await request(app)
      .delete("/api/me")
      .set(CSRF_HEADERS)
      .set("Authorization", "Bearer test-bearer")
      .send({ password: TEST_PASSWORD });
    expect(first.status).toBe(200);
    expect(first.body.ok).toBe(true);

    // Перший запит гасить усі сесії з БД, тож реальний повтор зі старим
    // токеном отримав би 401 ще до гейту. Тут змодельовано НОВИЙ вхід у
    // межах вікна: `getFreshSessionUser` замокано і повертає користувача,
    // як повернув би для свіжої сесії. Такий вхід теж не проходить
    // `requireFreshSession()`: 403 з кодом вікна і тим самим дедлайном,
    // а мітка не зсувається вперед.
    const sessions = await pool.query(
      `SELECT 1 FROM session WHERE "userId" = $1`,
      [TEST_USER_ID],
    );
    expect(sessions.rowCount).toBe(0);

    const second = await request(app)
      .delete("/api/me")
      .set(CSRF_HEADERS)
      .set("Authorization", "Bearer test-bearer-relogin")
      .send({ password: TEST_PASSWORD });
    expect(second.status).toBe(403);
    expect(second.body.code).toBe(ACCOUNT_PENDING_DELETION_CODE);
    expect(second.body.scheduledPurgeAt).toBe(first.body.scheduledPurgeAt);
  });
});

describe("GET /api/me/export — GDPR data export", () => {
  it("returns valid export structure including seeded module rows", async (ctx) => {
    if (!dockerAvailable || !app || !pool) return ctx.skip();

    // Запис модуля — рівно те, чого в експорті НЕ БУЛО до 2026-09-20:
    // файл віддавав `moduleData: []` від таблиці, дропнутої міграцією 046,
    // і жодного запису людини з чотирьох модулів у ньому не було.
    await pool.query(
      `INSERT INTO routine_habits (user_id, name) VALUES ($1, 'Вода')`,
      [TEST_USER_ID],
    );
    // Аватар (ux-14) їде в експорт як base64, а не в `excluded`.
    await pool.query(
      `INSERT INTO user_avatars (user_id, content_type, data)
       VALUES ($1, 'image/png', $2)
       ON CONFLICT (user_id) DO UPDATE SET data = EXCLUDED.data`,
      [TEST_USER_ID, Buffer.from("AVATAR-BYTES")],
    );

    const res = await request(app)
      .get("/api/me/export")
      .set("Authorization", "Bearer test-bearer");

    expect(res.status).toBe(200);
    expect(res.body.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(res.body.user.id).toBe(TEST_USER_ID);

    // Preferences always present (defaults when no row exists). Migration
    // 111 flipped the `analytics` DB DEFAULT TRUE → FALSE (opt-in, not
    // opt-out); the app-level fallback in `dataRights.ts` moved in lockstep.
    expect(res.body.preferences).toMatchObject({
      analytics: false,
      aiMemory: true,
      pushNotifications: false,
      healthDataConsent: false,
    });

    // module_data is always [] after migration 046 dropped the table.
    expect(res.body.data.moduleData).toEqual([]);

    // Проти РЕАЛЬНОГО Postgres, не проти моку: кожна таблиця зі списку
    // мусить існувати в базі, інакше запит впав би і роут віддав би 500.
    const habits = res.body.data.routine.routine_habits;
    expect(Array.isArray(habits)).toBe(true);
    expect(habits.length).toBeGreaterThan(0);
    expect(habits[0].name).toBe("Вода");
    for (const moduleId of ["finyk", "fizruk", "nutrition", "routine"]) {
      expect(Object.keys(res.body.data[moduleId]).length).toBeGreaterThan(0);
    }

    // Межа файлу названа в самому файлі.
    expect(
      res.body.data.excluded.map((e: { group: string }) => e.group),
    ).toEqual([
      "syncLog",
      "nutritionBackups",
      "aiMemories",
      "aiUsage",
      "coachMemory",
      "nudgeCache",
      "authSessions",
      "billingProviderIds",
      "integrationSecrets",
      "serviceQueues",
    ]);
    expect(res.body.data.avatar).toMatchObject({
      mimeType: "image/png",
      dataBase64: Buffer.from("AVATAR-BYTES").toString("base64"),
    });
    expect(res.body.data.ai).toBeUndefined();

    const mono = res.body.data.mono;
    expect(mono.connection).toBeNull();
    expect(Array.isArray(mono.accounts)).toBe(true);
    expect(Array.isArray(mono.transactions)).toBe(true);
  });

  it("priv-12: профіль, чеки й підключення потрапляють у файл, шифротекст ні", async (ctx) => {
    if (!dockerAvailable || !app || !pool) return ctx.skip();

    // Проти РЕАЛЬНОЇ схеми: кожен явний запит `exportBuilder.ts` мусить
    // збігатися з колонками міграцій, інакше роут віддав би 500.
    await pool.query(
      `INSERT INTO user_profile (user_id, payload)
       VALUES ($1, '{"biometrics":{"heightCm":181}}'::jsonb)
       ON CONFLICT (user_id) DO NOTHING`,
      [TEST_USER_ID],
    );
    const receipt = await pool.query<{ id: string }>(
      `INSERT INTO receipts (user_id, source, fiscal_num, store_name,
                             purchased_at, total_kopiykas, raw_payload)
       VALUES ($1, 'dps', 'PRIV12-FN', 'PRIV12_STORE', NOW(), 12550, '{}'::jsonb)
       RETURNING id`,
      [TEST_USER_ID],
    );
    await pool.query(
      `INSERT INTO receipt_items (receipt_id, position, name, qty,
                                  price_kopiykas, sum_kopiykas)
       VALUES ($1, 1, 'PRIV12_ITEM', 1.5, 2000, 3000)`,
      [receipt.rows[0]!.id],
    );
    await pool.query(
      `INSERT INTO privat_connection (user_id, merchant_id, token_ciphertext,
                                      token_iv, token_tag, token_fingerprint)
       VALUES ($1, 'M-1', 'PRIV12_PRIVAT_CT'::bytea, 'PRIV12_PRIVAT_IV'::bytea,
               'PRIV12_PRIVAT_TAG'::bytea, 'fp-privat')
       ON CONFLICT (user_id) DO NOTHING`,
      [TEST_USER_ID],
    );
    await pool.query(
      `INSERT INTO silpo_connection (user_id, access_token_ciphertext,
                                     access_token_iv, access_token_tag,
                                     refresh_token_ciphertext,
                                     refresh_token_iv, refresh_token_tag)
       VALUES ($1, 'PRIV12_SILPO_ACT'::bytea, 'PRIV12_SILPO_AIV'::bytea,
               'PRIV12_SILPO_ATAG'::bytea, 'PRIV12_SILPO_RCT'::bytea,
               'PRIV12_SILPO_RIV'::bytea, 'PRIV12_SILPO_RTAG'::bytea)
       ON CONFLICT (user_id) DO NOTHING`,
      [TEST_USER_ID],
    );

    const res = await request(app)
      .get("/api/me/export")
      .set("Authorization", "Bearer test-bearer");

    expect(res.status).toBe(200);
    expect(res.body.data.profile.payload).toEqual({
      biometrics: { heightCm: 181 },
    });
    const receipts = res.body.data.finyk.receipts;
    expect(receipts[0]).toMatchObject({
      store_name: "PRIV12_STORE",
      total_kopiykas: 12550,
    });
    expect(res.body.data.finyk.receipt_items[0]).toMatchObject({
      name: "PRIV12_ITEM",
      qty: 1.5,
      sum_kopiykas: 3000,
    });
    expect(res.body.data.privat.connection.token_fingerprint).toBe("fp-privat");
    expect(res.body.data.silpo.connection.status).toBe("connected");
    // Ні шифротекст, ні токени у файл не потрапляють.
    expect(JSON.stringify(res.body)).not.toMatch(/PRIV12_(PRIVAT|SILPO)_/);
  });

  it("другий одночасний експорт відхиляється, послідовний проходить", async (ctx) => {
    if (!dockerAvailable || !app) return ctx.skip();

    let entered!: () => void;
    let release!: () => void;
    const enteredP = new Promise<void>((resolve) => (entered = resolve));
    exportGate.entered = entered;
    exportGate.hold = new Promise<void>((resolve) => (release = resolve));

    try {
      // `.then()` запускає запит; без нього supertest лінивий.
      const firstP = request(app)
        .get("/api/me/export")
        .set("Authorization", "Bearer test-bearer")
        .then((r) => r);

      // Перший запит уже в обробнику і тримає замок.
      await enteredP;
      exportGate.entered = null;

      const second = await request(app)
        .get("/api/me/export")
        .set("Authorization", "Bearer test-bearer");
      expect(second.status).toBe(409);

      exportGate.hold = null;
      release();
      const first = await firstP;
      expect(first.status).toBe(200);
    } finally {
      exportGate.entered = null;
      exportGate.hold = null;
      release();
    }

    // Замок знімається: наступний запит проходить.
    const third = await request(app)
      .get("/api/me/export")
      .set("Authorization", "Bearer test-bearer");
    expect(third.status).toBe(200);
  });
});

describe("PATCH /api/me/preferences — upsert round-trip", () => {
  it("upserts preferences and GET /api/me/preferences reflects the change", async (ctx) => {
    if (!dockerAvailable || !app || !pool) return ctx.skip();

    const patch = { analytics: false, pushNotifications: true };

    const patchRes = await request(app)
      .patch("/api/me/preferences")
      .set(CSRF_HEADERS)
      .set("Authorization", "Bearer test-bearer")
      .set("Content-Type", "application/json")
      .send(patch);

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.analytics).toBe(false);
    expect(patchRes.body.pushNotifications).toBe(true);
    expect(patchRes.body.aiMemory).toBe(true); // default, not patched
    expect(patchRes.body.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    // Round-trip: GET /api/me/preferences must reflect the persisted values.
    const getRes = await request(app)
      .get("/api/me/preferences")
      .set("Authorization", "Bearer test-bearer");

    expect(getRes.status).toBe(200);
    expect(getRes.body.analytics).toBe(false);
    expect(getRes.body.pushNotifications).toBe(true);
    expect(getRes.body.aiMemory).toBe(true);
  });
});
