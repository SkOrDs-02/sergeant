import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import {
  ACCOUNT_DELETION_GRACE_DAYS,
  MeDeleteResponseSchema,
  MeDeletionStatusResponseSchema,
  MeExportResponseSchema,
  UserPreferencesSchema,
} from "@sergeant/shared";
import {
  MODULE_EXPORT_TABLES,
  buildMeExport,
  getAccountDeletionStatus,
  getUserPreferences,
  purgeUserData,
  requestAccountDeletion,
  restoreAccount,
  upsertUserPreferences,
} from "./dataRights.js";

// Minimal Queryable mock — returns empty rows unless overridden.
function mockDb(rows: unknown[] = []) {
  return { query: vi.fn().mockResolvedValue({ rows }) };
}

// Pool mock that supports `.connect()` for transaction-based functions.
function mockPoolWithTransaction(rows: unknown[] = []): Pool {
  const client = {
    query: vi.fn().mockResolvedValue({ rows }),
    release: vi.fn(),
  };
  return {
    query: vi.fn().mockResolvedValue({ rows }),
    connect: vi.fn().mockResolvedValue(client),
  } as unknown as Pool;
}

const ME_USER = {
  id: "user-123",
  email: "test@example.com",
  name: "Тест",
  image: null,
  emailVerified: true,
  createdAt: "2026-01-15T08:30:00.000Z",
} as const;

// ─── getUserPreferences ───────────────────────────────────────────────────────

describe("getUserPreferences — contract fixture (Hard Rule #3)", () => {
  it("returns defaults when no row exists (new user)", async () => {
    const result = await getUserPreferences(mockDb([]), "user-1");
    expect(result).toEqual({
      // Migration 111: DB DEFAULT flipped TRUE → FALSE (opt-in, not
      // opt-out) — this app-level fallback must match.
      analytics: false,
      aiMemory: true,
      pushNotifications: false,
      // Проактивний канал Сержанта — opt-in, вимкнений і для нових акаунтів
      // (міграція 100). Дефолт тут — частина контракту, не деталь реалізації.
      sergeantNudges: false,
      pushDailyCap: 2,
      // GDPR Art. 9 health-data consent — explicit opt-in only (migration 111).
      healthDataConsent: false,
      // Міграція 116 (знахідка B2): `null`, а не `[]`. Дефолт `[]`
      // сказав би клієнту «людина свідомо вимкнула всі модулі» і затер
      // би її локальний вибір — дефолт тут частина контракту.
      activeModules: null,
      hubPrefs: null,
      updatedAt: null,
    });
  });

  it("maps snake_case columns to camelCase fields", async () => {
    const db = mockDb([
      {
        analytics: false,
        ai_memory: true,
        push_notifications: true,
        sergeant_nudges: true,
        push_daily_cap: 3,
        health_data_consent: true,
        active_modules: ["nutrition", "finyk"],
        hub_prefs: { calmMode: true },
        updated_at: new Date("2026-06-06T10:00:00.000Z"),
      },
    ]);
    const result = await getUserPreferences(db, "user-1");
    expect(result).toEqual({
      analytics: false,
      aiMemory: true,
      pushNotifications: true,
      sergeantNudges: true,
      pushDailyCap: 3,
      healthDataConsent: true,
      // Порядок вибору зберігається наскрізь: `TEXT[]` у 116 → `pg` →
      // серіалізатор. Це не косметика — на хабі плитки шикуються саме
      // в порядку вибору.
      activeModules: ["nutrition", "finyk"],
      hubPrefs: { calmMode: true },
      updatedAt: "2026-06-06T10:00:00.000Z",
    });
  });

  it("drops unknown module ids and reads a missing column as «no choice»", async () => {
    // Рядки, створені до 116, колонки не мають — це має читатись як
    // `null`, а не падати. А `CHECK` міграції не діє на дані, що вже
    // лежали в БД, тож серіалізатор ще й відсіює невідомі id.
    const legacy = await getUserPreferences(
      mockDb([{ analytics: true, ai_memory: true, updated_at: null }]),
      "user-1",
    );
    expect(legacy.activeModules).toBeNull();

    const dirty = await getUserPreferences(
      mockDb([
        {
          analytics: true,
          ai_memory: true,
          active_modules: ["finyk", "garage", 42, null],
          updated_at: null,
        },
      ]),
      "user-1",
    );
    expect(dirty.activeModules).toEqual(["finyk"]);
  });

  // PR-S13 (міграція 137). Серіалізатор `hub_prefs` мусить тримати три
  // речі, і кожна з них уже колись була багом у сусідній колонці.
  it("PR-S13: hub_prefs — три стани, масив і не-скаляри відсіюються", async () => {
    // 1. Рядок, створений до 137, колонки не має → «серверних
    //    налаштувань немає», не падіння.
    const legacy = await getUserPreferences(
      mockDb([{ analytics: true, ai_memory: true, updated_at: null }]),
      "user-1",
    );
    expect(legacy.hubPrefs).toBeNull();

    // 2. Порожній обʼєкт — це ІНШИЙ стан, не `null`. На цій різниці
    //    тримається гідратація на клієнті.
    const empty = await getUserPreferences(
      mockDb([{ analytics: true, hub_prefs: {}, updated_at: null }]),
      "user-1",
    );
    expect(empty.hubPrefs).toEqual({});
    expect(empty.hubPrefs).not.toBeNull();

    // 3. Масив — валідний JSONB, але НЕ обʼєкт; CHECK у БД його не
    //    пропустить, а ось рядок, що лежав до 137, міг би.
    const arrayRow = await getUserPreferences(
      mockDb([{ analytics: true, hub_prefs: [1, 2], updated_at: null }]),
      "user-1",
    );
    expect(arrayRow.hubPrefs).toBeNull();

    // 4. Не-скаляри викидаються ПОЕЛЕМЕНТНО, а не валять запит. Тип
    //    відповіді обіцяє скаляри, а Zod-межа стоїть на вході — тож
    //    рядок, записаний до неї чи вручну через SQL, цілком може нести
    //    вкладений обʼєкт. Один зіпсутий прапорець не має класти всю
    //    сторінку налаштувань.
    const dirty = await getUserPreferences(
      mockDb([
        {
          analytics: true,
          hub_prefs: {
            calmMode: true,
            layout: "compact",
            size: 3,
            nested: { a: 1 },
            list: [1],
            nope: null,
            nan: Number.NaN,
          },
          updated_at: null,
        },
      ]),
      "user-1",
    );
    expect(dirty.hubPrefs).toEqual({
      calmMode: true,
      layout: "compact",
      size: 3,
    });
  });

  it("output passes UserPreferencesSchema — contract triplet anchor", async () => {
    const result = await getUserPreferences(mockDb([]), "user-1");
    expect(() => UserPreferencesSchema.parse(result)).not.toThrow();
  });

  it("returns updatedAt: null when the stored updated_at is null", async () => {
    const db = mockDb([
      {
        analytics: true,
        ai_memory: false,
        push_notifications: false,
        updated_at: null,
      },
    ]);
    const result = await getUserPreferences(db, "user-1");
    expect(result.updatedAt).toBeNull();
  });

  it("parses a string updated_at into an ISO timestamp", async () => {
    const db = mockDb([
      {
        analytics: true,
        ai_memory: false,
        push_notifications: false,
        updated_at: "2026-06-06T10:00:00.000Z",
      },
    ]);
    const result = await getUserPreferences(db, "user-1");
    expect(result.updatedAt).toBe("2026-06-06T10:00:00.000Z");
  });

  it("returns updatedAt: null when the stored updated_at is unparseable", async () => {
    const db = mockDb([
      {
        analytics: true,
        ai_memory: false,
        push_notifications: false,
        updated_at: "not-a-date",
      },
    ]);
    const result = await getUserPreferences(db, "user-1");
    expect(result.updatedAt).toBeNull();
  });
});

// ─── upsertUserPreferences ───────────────────────────────────────────────────

describe("upsertUserPreferences — contract fixture (Hard Rule #3)", () => {
  it("merges patch with current prefs and returns updated shape", async () => {
    // First call (SELECT current) → no row; second call (UPSERT RETURNING) → updated row.
    const db = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [
            {
              analytics: false,
              ai_memory: true,
              push_notifications: false,
              updated_at: new Date("2026-06-06T10:05:00.000Z"),
            },
          ],
        }),
    };
    const result = await upsertUserPreferences(db, "user-1", {
      analytics: false,
    });
    expect(result.analytics).toBe(false);
    expect(result.aiMemory).toBe(true); // default, not patched
    expect(() => UserPreferencesSchema.parse(result)).not.toThrow();
  });
});

// ─── buildMeExport ───────────────────────────────────────────────────────────

describe("buildMeExport — contract fixture (Hard Rule #3)", () => {
  it("returns empty-data export that passes MeExportResponseSchema", async () => {
    // buildMeExport runs 10 parallel queries; all return empty rows here.
    const db = mockDb([]);
    const result = await buildMeExport(db, ME_USER);

    // generatedAt is dynamic — just validate it's an ISO-8601 string.
    expect(result.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(result.user).toEqual(ME_USER);

    expect(() => MeExportResponseSchema.parse(result)).not.toThrow();
  });

  it("structure matches the api-client me.test.ts export fixture shape", async () => {
    const db = mockDb([]);
    const result = await buildMeExport(db, ME_USER);

    expect(result.data).toMatchObject({
      moduleData: [],
      mono: { connection: null, accounts: [], transactions: [] },
      billing: { subscriptions: [] },
      push: { webSubscriptions: [], devices: [] },
    });
    expect(Object.keys(result.data)).toEqual(
      expect.arrayContaining(["finyk", "fizruk", "nutrition", "routine"]),
    );
  });

  it("кожна модульна секція наповнюється зі своїх таблиць", async () => {
    // Мок віддає рядок лише на один SELECT — так видно, що секція справді
    // читає ту таблицю, а не отримує спільну заглушку.
    const db = {
      query: vi.fn().mockImplementation((sql: string) => {
        const text = String(sql);
        if (text.includes("FROM routine_habits")) {
          return Promise.resolve({ rows: [{ id: "h-1", name: "Вода" }] });
        }
        if (text.includes("FROM fizruk_workouts")) {
          return Promise.resolve({ rows: [{ id: "w-1" }, { id: "w-2" }] });
        }
        return Promise.resolve({ rows: [] });
      }),
    };

    const result = await buildMeExport(db, ME_USER);

    expect(result.data.routine["routine_habits"]).toEqual([
      { id: "h-1", name: "Вода" },
    ]);
    expect(result.data.fizruk["fizruk_workouts"]).toHaveLength(2);
    // Решта таблиць присутні ключами з порожнім масивом: споживач бачить,
    // що таблиця існує і в ній нічого немає.
    expect(result.data.nutrition["nutrition_meals"]).toEqual([]);
    expect(() => MeExportResponseSchema.parse(result)).not.toThrow();
  });

  it("усі живі таблиці чотирьох модулів є в експорті", async () => {
    const db = mockDb([]);
    const result = await buildMeExport(db, ME_USER);

    for (const [moduleId, tables] of Object.entries(MODULE_EXPORT_TABLES)) {
      const section = result.data[
        moduleId as keyof typeof MODULE_EXPORT_TABLES
      ] as Record<string, unknown>;
      for (const table of tables) {
        expect(section).toHaveProperty(table);
      }
    }
    // Таблиця без власного `user_id` — через join на `receipts`.
    expect(result.data.finyk).toHaveProperty("finyk_tx_receipt_links");
    // Мертві таблиці віджимань (міграції 139 і 140) не воскресають.
    expect(result.data.routine).not.toHaveProperty("routine_pushups");
    expect(result.data.fizruk).not.toHaveProperty("fizruk_pushups");
  });

  it("жодна вибірка даних людини не обрізана LIMIT-ом", async () => {
    // Головна регресія, заради якої фіча існує: `mono_transaction` мала
    // `LIMIT 5000` без пагінації і без ознаки обрізання в payload, тож
    // людина з довгою історією забирала неповний файл і не знала цього.
    const db = mockDb([]);
    await buildMeExport(db, ME_USER);

    const limited = db.query.mock.calls
      .map((call: unknown[]) => String(call[0]))
      .filter((sql: string) => /\bLIMIT\b/i.test(sql));
    expect(limited).toEqual([]);
  });

  it("excluded перелічує рівно чотири групи з причиною кожної", async () => {
    const db = mockDb([]);
    const result = await buildMeExport(db, ME_USER);

    expect(result.data.excluded.map((item) => item.group)).toEqual([
      "syncLog",
      "nutritionBackups",
      "aiMemories",
      "aiUsage",
    ]);
    for (const item of result.data.excluded) {
      expect(item.reason.length).toBeGreaterThan(0);
      expect(item.tables.length).toBeGreaterThan(0);
    }
    // Виключене не має протікати в секції модулів.
    expect(result.data.nutrition).not.toHaveProperty("nutrition_backups");
  });

  it("mono.connection is null when no connection row", async () => {
    const db = mockDb([]);
    const result = await buildMeExport(db, ME_USER);
    expect(result.data.mono.connection).toBeNull();
  });

  it("mono.connection carries the row through when a connection exists", async () => {
    const connectionRow = {
      status: "active",
      token_fingerprint: "fp-1",
      webhook_registered_at: new Date("2026-01-01T00:00:00.000Z"),
      last_event_at: null,
      last_backfill_at: null,
      created_at: new Date("2026-01-01T00:00:00.000Z"),
      updated_at: new Date("2026-01-01T00:00:00.000Z"),
    };
    const db = {
      query: vi.fn().mockImplementation((sql: string) => {
        if (typeof sql === "string" && sql.includes("FROM mono_connection")) {
          return Promise.resolve({ rows: [connectionRow] });
        }
        return Promise.resolve({ rows: [] });
      }),
    };
    const result = await buildMeExport(db, ME_USER);
    expect(result.data.mono.connection).toEqual(connectionRow);
  });
});

// ─── purgeUserData (незворотна частина; кличе добивач) ─────────────────────────────────────────────────────────

describe("purgeUserData — contract fixture (Hard Rule #3)", () => {
  it("returns { ok: true, deletedAt: <ISO string> }", async () => {
    const pool = mockPoolWithTransaction();
    const result = await purgeUserData(pool, "user-1");
    expect(result.ok).toBe(true);
    expect(result.deletedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("output passes MeDeleteResponseSchema — contract triplet anchor", async () => {
    const pool = mockPoolWithTransaction();
    const result = await purgeUserData(pool, "user-1");
    expect(() => MeDeleteResponseSchema.parse(result)).not.toThrow();
  });

  it("runs BEGIN/COMMIT transaction and releases the client", async () => {
    const pool = mockPoolWithTransaction();
    await purgeUserData(pool, "user-1");

    const client = await (pool.connect as ReturnType<typeof vi.fn>).mock
      .results[0]?.value;
    expect(client).toBeDefined();
    expect(client.release).toHaveBeenCalledOnce();
    const queryArgs = (client.query as ReturnType<typeof vi.fn>).mock.calls.map(
      (c: unknown[]) => c[0],
    );
    expect(queryArgs[0]).toBe("BEGIN");
    expect(queryArgs[queryArgs.length - 1]).toBe("COMMIT");
  });

  it("rolls back and rethrows on query failure", async () => {
    const client = {
      query: vi
        .fn()
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockRejectedValueOnce(new Error("db error")), // SELECT email snapshot
      release: vi.fn(),
    };
    const pool = {
      connect: vi.fn().mockResolvedValue(client),
    } as unknown as Pool;

    await expect(purgeUserData(pool, "user-1")).rejects.toThrow("db error");

    const queryArgs = (client.query as ReturnType<typeof vi.fn>).mock.calls.map(
      (c: unknown[]) => c[0],
    );
    expect(queryArgs).toContain("ROLLBACK");
    expect(client.release).toHaveBeenCalledOnce();
  });

  // Phase 7 UA billing (ADR-0016): provider-cancel перед видаленням —
  // best-effort. Помилка провайдера (напр. LiqPay 5xx / mono down) НЕ мусить
  // валити deletion. notifyProvidersCancel іде через pool.query (top-level),
  // транзакція — через client.query; тут top-level query падає, а deletion
  // усе одно завершується успішно.
  it("still deletes the user when provider-cancel fails (best-effort)", async () => {
    const client = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
      release: vi.fn(),
    };
    const pool = {
      // Провайдер-cancel читає/пише через pool.query — імітуємо збій провайдера.
      query: vi.fn().mockRejectedValue(new Error("provider down")),
      connect: vi.fn().mockResolvedValue(client),
    } as unknown as Pool;

    const result = await purgeUserData(pool, "user-1");

    expect(result.ok).toBe(true);
    // Транзакція видалення все одно виконалась (BEGIN … COMMIT через client).
    const queryArgs = (client.query as ReturnType<typeof vi.fn>).mock.calls.map(
      (c: unknown[]) => c[0],
    );
    expect(queryArgs[0]).toBe("BEGIN");
    expect(queryArgs[queryArgs.length - 1]).toBe("COMMIT");
  });

  // Pre-beta schema-debt audit 2026-08-04: ai_usage_daily has no FK to
  // "user"(id) (subject_key is a bare TEXT), so CASCADE never reaches it —
  // an explicit purge is required (ADR-0016 § ADR-6.2).
  it("purges ai_usage_daily rows for the deleted user's subject_key", async () => {
    const pool = mockPoolWithTransaction();
    await purgeUserData(pool, "user-1");

    const client = await (pool.connect as ReturnType<typeof vi.fn>).mock
      .results[0]?.value;
    const calls = (client.query as ReturnType<typeof vi.fn>).mock.calls;
    const purgeCall = calls.find(
      (c: unknown[]) =>
        typeof c[0] === "string" &&
        (c[0] as string).includes("DELETE FROM ai_usage_daily"),
    );
    expect(purgeCall).toBeDefined();
    expect(purgeCall![1]).toEqual(["u:user-1"]);
  });

  // Canon (this audit): hard-delete via FK CASCADE only — no separate
  // ai_memories soft-delete step. A prior revision soft-deleted
  // ai_memories.deleted_at and then hard-deleted "user" two statements
  // later, which cascaded (migration 025 ON DELETE CASCADE) and destroyed
  // the very rows the soft-delete had just marked — a self-contradicting
  // no-op write.
  it("does NOT soft-delete ai_memories separately (hard-delete cascade only)", async () => {
    const pool = mockPoolWithTransaction();
    await purgeUserData(pool, "user-1");

    const client = await (pool.connect as ReturnType<typeof vi.fn>).mock
      .results[0]?.value;
    const calls = (client.query as ReturnType<typeof vi.fn>).mock.calls;
    const softDeleteCall = calls.find(
      (c: unknown[]) =>
        typeof c[0] === "string" &&
        (c[0] as string).includes("UPDATE ai_memories"),
    );
    expect(softDeleteCall).toBeUndefined();
  });

  // ADR-0016 § ADR-6.3 — enqueue one row per external service so a
  // background worker can clean up Stripe/Sentry/PostHog/Resend async,
  // without holding this request open for sequential third-party calls.
  it("enqueues gdpr_cleanup_queue rows (one per external service) when the user still exists", async () => {
    const client = {
      query: vi.fn().mockImplementation((sql: string) => {
        if (
          typeof sql === "string" &&
          sql.includes(`SELECT email FROM "user"`)
        ) {
          return Promise.resolve({ rows: [{ email: "gone@example.com" }] });
        }
        return Promise.resolve({ rows: [] });
      }),
      release: vi.fn(),
    };
    const pool = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
      connect: vi.fn().mockResolvedValue(client),
    } as unknown as Pool;

    await purgeUserData(pool, "user-1");

    const calls = (client.query as ReturnType<typeof vi.fn>).mock.calls;
    const enqueueCalls = calls.filter(
      (c: unknown[]) =>
        typeof c[0] === "string" &&
        (c[0] as string).includes("INSERT INTO gdpr_cleanup_queue"),
    );
    // Four static per-service INSERTs (M11 — no dynamic multi-row VALUES),
    // not one combined statement — see cleanupQueue.ts.
    expect(enqueueCalls).toHaveLength(4);
    const services = enqueueCalls.map((c) => (c[1] as unknown[])[3]);
    expect([...services].sort()).toEqual([
      "posthog",
      "resend",
      "sentry",
      "stripe",
    ]);
    for (const call of enqueueCalls) {
      const values = call[1] as unknown[];
      expect(values[0]).toBe("user-1");
      expect(values[1]).toBe("gone@example.com");
      expect(values[2]).toBeNull();
    }
  });

  // `enqueueGdprCleanup` no-ops silently on a falsy email
  // (`cleanupQueue.ts`: `if (!userId || !email) return;`) — a NULL
  // `"user".email` at delete-time (soft-delete anonymization edge case,
  // or a row that never had one) would otherwise skip the entire external
  // cleanup queue instead of enqueueing it under a synthetic address.
  it("falls back to a synthetic {userId}@deleted.sergeant.app address when email is null", async () => {
    const client = {
      query: vi.fn().mockImplementation((sql: string) => {
        if (
          typeof sql === "string" &&
          sql.includes(`SELECT email FROM "user"`)
        ) {
          return Promise.resolve({ rows: [{ email: null }] });
        }
        return Promise.resolve({ rows: [] });
      }),
      release: vi.fn(),
    };
    const pool = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
      connect: vi.fn().mockResolvedValue(client),
    } as unknown as Pool;

    await purgeUserData(pool, "user-1");

    const calls = (client.query as ReturnType<typeof vi.fn>).mock.calls;
    const enqueueCalls = calls.filter(
      (c: unknown[]) =>
        typeof c[0] === "string" &&
        (c[0] as string).includes("INSERT INTO gdpr_cleanup_queue"),
    );
    expect(enqueueCalls).toHaveLength(4);
    for (const call of enqueueCalls) {
      const values = call[1] as unknown[];
      expect(values[0]).toBe("user-1");
      expect(values[1]).toBe("user-1@deleted.sergeant.app");
    }
  });

  it("skips gdpr_cleanup_queue enqueue when the user row is already gone (idempotent second delete)", async () => {
    // mockPoolWithTransaction() defaults every client.query call to
    // `{ rows: [] }` — including the SELECT email snapshot, simulating a
    // second delete() call after the user row is already removed.
    const pool = mockPoolWithTransaction();
    await purgeUserData(pool, "user-1");

    const client = await (pool.connect as ReturnType<typeof vi.fn>).mock
      .results[0]?.value;
    const calls = (client.query as ReturnType<typeof vi.fn>).mock.calls;
    const enqueueCall = calls.find(
      (c: unknown[]) =>
        typeof c[0] === "string" &&
        (c[0] as string).includes("INSERT INTO gdpr_cleanup_queue"),
    );
    expect(enqueueCall).toBeUndefined();
  });
});

// ─── requestAccountDeletion (вікно на скасування) ─────────────────────────────

/**
 * Pool-мок, у якому `UPDATE "user" … RETURNING deletion_requested_at`
 * повертає задану мітку, а решта запитів порожні. Саме ця форма відрізняє
 * «щойно позначили» від «уже було позначено».
 */
function mockPoolMarking(markedAt: Date | null): {
  pool: Pool;
  client: {
    query: ReturnType<typeof vi.fn>;
    release: ReturnType<typeof vi.fn>;
  };
} {
  const client = {
    query: vi.fn().mockImplementation((sql: string) => {
      if (
        typeof sql === "string" &&
        sql.includes("SET deletion_requested_at = NOW()")
      ) {
        return Promise.resolve({
          rows: markedAt ? [{ deletion_requested_at: markedAt }] : [],
        });
      }
      if (
        typeof sql === "string" &&
        sql.includes("SELECT deletion_requested_at")
      ) {
        return Promise.resolve({
          rows: markedAt ? [{ deletion_requested_at: markedAt }] : [],
        });
      }
      return Promise.resolve({ rows: [] });
    }),
    release: vi.fn(),
  };
  const pool = {
    query: vi.fn().mockResolvedValue({ rows: [] }),
    connect: vi.fn().mockResolvedValue(client),
  } as unknown as Pool;
  return { pool, client };
}

function sqlCalls(client: { query: ReturnType<typeof vi.fn> }): string[] {
  return client.query.mock.calls
    .map((c: unknown[]) => c[0])
    .filter((sql): sql is string => typeof sql === "string");
}

describe("requestAccountDeletion — позначає, а не видаляє", () => {
  it('ставить мітку і НЕ виконує DELETE FROM "user"', async () => {
    const markedAt = new Date("2026-09-20T10:00:00.000Z");
    const { pool, client } = mockPoolMarking(markedAt);

    await requestAccountDeletion(pool, "user-1");

    const sql = sqlCalls(client);
    expect(
      sql.some((q) => q.includes("SET deletion_requested_at = NOW()")),
    ).toBe(true);
    expect(sql.some((q) => q.includes('DELETE FROM "user"'))).toBe(false);
  });

  it("гасить усі сесії користувача", async () => {
    const { pool, client } = mockPoolMarking(new Date());

    await requestAccountDeletion(pool, "user-1");

    const killed = client.query.mock.calls.find(
      (c: unknown[]) =>
        typeof c[0] === "string" &&
        (c[0] as string).includes("DELETE FROM session"),
    );
    expect(killed).toBeDefined();
    expect(killed![1]).toEqual(["user-1"]);
  });

  it("не наповнює чергу очищення зовнішніх сервісів (це робота добивача)", async () => {
    const { pool, client } = mockPoolMarking(new Date());

    await requestAccountDeletion(pool, "user-1");

    expect(
      sqlCalls(client).some((q) =>
        q.includes("INSERT INTO gdpr_cleanup_queue"),
      ),
    ).toBe(false);
  });

  it("повертає дедлайн рівно через ACCOUNT_DELETION_GRACE_DAYS днів", async () => {
    const markedAt = new Date("2026-09-20T10:00:00.000Z");
    const { pool } = mockPoolMarking(markedAt);

    const result = await requestAccountDeletion(pool, "user-1");

    expect(() => MeDeleteResponseSchema.parse(result)).not.toThrow();
    const deltaDays =
      (new Date(result.scheduledPurgeAt).getTime() -
        new Date(result.deletedAt).getTime()) /
      (24 * 60 * 60 * 1000);
    expect(deltaDays).toBe(ACCOUNT_DELETION_GRACE_DAYS);
  });

  it("повторний виклик не зсуває дату вперед, а віддає першу мітку", async () => {
    const firstMark = new Date("2026-09-01T08:00:00.000Z");
    // `UPDATE … WHERE deletion_requested_at IS NULL` не зачепив жодного
    // рядка (RETURNING порожній) — функція мусить дочитати наявну мітку.
    const client = {
      query: vi.fn().mockImplementation((sql: string) => {
        if (
          typeof sql === "string" &&
          sql.includes("SET deletion_requested_at = NOW()")
        ) {
          return Promise.resolve({ rows: [] });
        }
        if (
          typeof sql === "string" &&
          sql.includes("SELECT deletion_requested_at")
        ) {
          return Promise.resolve({
            rows: [{ deletion_requested_at: firstMark }],
          });
        }
        return Promise.resolve({ rows: [] });
      }),
      release: vi.fn(),
    };
    const pool = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
      connect: vi.fn().mockResolvedValue(client),
    } as unknown as Pool;

    const result = await requestAccountDeletion(pool, "user-1");

    expect(result.deletedAt).toBe(firstMark.toISOString());
  });
});

describe("restoreAccount", () => {
  it("скидає мітку і повідомляє про успіх", async () => {
    const pool = {
      query: vi.fn().mockResolvedValue({ rowCount: 1, rows: [] }),
    } as unknown as Pool;

    await expect(restoreAccount(pool, "user-1")).resolves.toBe(true);
  });

  it("повертає false, коли активного прохання не було", async () => {
    const pool = {
      query: vi.fn().mockResolvedValue({ rowCount: 0, rows: [] }),
    } as unknown as Pool;

    await expect(restoreAccount(pool, "user-1")).resolves.toBe(false);
  });
});

describe("getAccountDeletionStatus", () => {
  it("активний акаунт — pending: false і жодних дат", async () => {
    const status = await getAccountDeletionStatus(
      mockDb([{ deletion_requested_at: null }]),
      "user-1",
    );
    expect(status).toEqual({ pending: false });
    expect(() => MeDeletionStatusResponseSchema.parse(status)).not.toThrow();
  });

  it("позначений акаунт — pending: true з обома датами", async () => {
    const markedAt = new Date("2026-09-20T10:00:00.000Z");
    const status = await getAccountDeletionStatus(
      mockDb([{ deletion_requested_at: markedAt }]),
      "user-1",
    );
    expect(status.pending).toBe(true);
    expect(() => MeDeletionStatusResponseSchema.parse(status)).not.toThrow();
    if (status.pending) {
      expect(status.requestedAt).toBe(markedAt.toISOString());
      expect(new Date(status.scheduledPurgeAt).getTime()).toBe(
        markedAt.getTime() + ACCOUNT_DELETION_GRACE_DAYS * 24 * 60 * 60 * 1000,
      );
    }
  });
});
