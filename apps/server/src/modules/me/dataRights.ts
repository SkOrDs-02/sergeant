import type { Pool, PoolClient } from "pg";
import type {
  DashboardModuleId,
  MeDeleteResponse,
  MeExportResponse,
  MeResponse,
  UserPreferences,
  UserPreferencesPatch,
} from "@sergeant/shared";
import { DASHBOARD_MODULE_IDS } from "@sergeant/shared";
import { logger } from "../../obs/logger.js";
import { providerRegistry, type ProviderId } from "../billing/index.js";
import { enqueueGdprCleanup } from "../gdpr/cleanupQueue.js";

type Queryable = Pick<Pool | PoolClient, "query">;

/**
 * ADR-0016: перед SQL-cancel мусимо сказати провайдеру зупинити списання —
 * інакше LiqPay продовжить знімати з видаленого юзера, а в Plata лишиться
 * card-token (PII). Best-effort: провайдер-помилка НЕ валить deletion
 * (логуємо й продовжуємо). Кожен `cancelSubscription` — no-op, якщо своєї
 * підписки нема, тож безпечно кликати всі три.
 */
async function notifyProvidersCancel(
  pool: Pool,
  userId: string,
): Promise<void> {
  await Promise.all(
    (["stripe", "liqpay", "plata"] as ProviderId[]).map(async (id) => {
      try {
        await providerRegistry[id].cancelSubscription(pool, userId);
      } catch (err) {
        logger.warn({
          msg: "delete_user_provider_cancel_failed",
          provider: id,
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }),
  );
}

// Migration 111 changed `user_preferences.analytics` DEFAULT TRUE → FALSE:
// product policy is opt-in analytics, not opt-out. This app-level fallback
// (used when a user has never called `/api/me/preferences`, i.e. no row
// exists yet) must move in lockstep with the DB DEFAULT — see 111's header
// comment, which explicitly calls out this exact constant.
const DEFAULT_PREFERENCES: Omit<UserPreferences, "updatedAt"> = {
  analytics: false,
  aiMemory: true,
  pushNotifications: false,
  sergeantNudges: false,
  // GDPR Art. 9 — health-adjacent data (fizruk/nutrition) needs explicit
  // opt-in; DEFAULT FALSE matches the DB column (migration 111).
  healthDataConsent: false,
  // `null`, НЕ `[]` — «сервер ще не знає вибору модулів», а не «вибір є
  // і він порожній». Дефолт `[]` тут відтворив би знахідку B2 з іншого
  // боку: клієнт вирішив би, що людина свідомо вимкнула все, і затер
  // локальний `hub_onboarding_vibes_v1`. Збігається з nullable-колонкою
  // без DEFAULT у міграції 116.
  activeModules: null,
  // `null`, НЕ `{}` — та сама трійця станів, що в `activeModules` вище, і
  // з тієї ж причини: `{}` означало б «людина лишила все дефолтним», а не
  // «сервер ще не знає». Збігається з nullable-колонкою без DEFAULT
  // (міграція 137).
  hubPrefs: null,
};

function iso(value: Date | string): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

function maybeIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function rowArray(
  rows: ReadonlyArray<Record<string, unknown>>,
): Record<string, unknown>[] {
  return rows.map((row) => ({ ...row }));
}

/**
 * Рядок `ai_usage_daily` для GDPR-експорту.
 *
 * Чому окремий серіалізатор, а не спільний `rowArray`. Глобальний парсер
 * `lib/pgInt8.ts` знімає Hard Rule #1 лише з `int8` (OID 20) — NUMERIC
 * (OID 1700) він не покриває, і навмисно: NUMERIC у Postgres має ширшу
 * точність, ніж JS `number`, тож мовчазна коерсія ВСІХ таких колонок
 * непомітно псувала б суми. Наслідок для цього експорту був дрібний на
 * вигляд і незручний на практиці: `request_count` приїжджав числом, а
 * сусідній `est_cost_usd` — РЯДКОМ, у тому самому обʼєкті.
 *
 * `est_cost_usd` — це `NUMERIC(12,6)`, тобто щонайбільше $1M із шістьма
 * знаками після коми; така величина вміщується в `number` із запасом, і
 * коерсія тут безпечна саме тому, що межа відома з CHECK-констрейнта
 * (`migrations/059_ai_usage_daily_est_cost_usd.sql`), а не «зазвичай мале».
 */
function serializeAiUsageDailyRow(
  row: Record<string, unknown>,
): Record<string, unknown> {
  const cost = row["est_cost_usd"];
  return {
    ...row,
    est_cost_usd: cost === null || cost === undefined ? cost : Number(cost),
  };
}

function serializePreferences(
  row: Record<string, unknown> | undefined,
): UserPreferences {
  if (!row) {
    return { ...DEFAULT_PREFERENCES, updatedAt: null };
  }
  return {
    analytics: row["analytics"] === true,
    aiMemory: row["ai_memory"] === true,
    pushNotifications: row["push_notifications"] === true,
    sergeantNudges: row["sergeant_nudges"] === true,
    healthDataConsent: row["health_data_consent"] === true,
    // `pg` round-trip-ить `text[]` як `string[]`, але shape-guard тут не
    // зайвий: до міграції 116 колонки не існувало, тож старий рядок (або
    // ручний запит без неї) дасть `undefined`, і воно має читатись як
    // «вибору немає», а не впасти на `.filter` нижче.
    activeModules: serializeActiveModules(row["active_modules"]),
    hubPrefs: serializeHubPrefs(row["hub_prefs"]),
    updatedAt: maybeIso(row["updated_at"] as Date | string | null | undefined),
  };
}

/**
 * DB → API для `active_modules`. Відсіює невідомі id (колонка має CHECK,
 * але він не діє на рядки, що приїхали до 116) і зберігає порядок, у
 * якому людина зробила вибір.
 */
function serializeActiveModules(value: unknown): DashboardModuleId[] | null {
  if (!Array.isArray(value)) return null;
  const known = new Set<string>(DASHBOARD_MODULE_IDS);
  return value.filter((id): id is DashboardModuleId =>
    typeof id === "string" ? known.has(id) : false,
  );
}

/**
 * DB → API для `hub_prefs`. `jsonb` приїжджає з `pg` уже розібраним, але
 * shape-guard тут не зайвий із трьох причин.
 *
 * 1. До міграції 137 колонки не існувало, тож старий рядок дасть
 *    `undefined`, і це має читатись як «серверних налаштувань немає».
 * 2. CHECK у БД гарантує лише `jsonb_typeof = 'object'`, а масив у JSONB —
 *    це НЕ object, тож масив відсіється тут, як і має.
 * 3. **Скаляри фільтруються поелементно, і це не перестраховка.** Тип
 *    відповіді обіцяє `Record<string, string | number | boolean>`, а БД
 *    цього не гарантує: Zod-межа стоїть на ВХОДІ, тож рядок, записаний до
 *    неї, вставлений вручну через SQL або вцілілий після майбутнього
 *    послаблення схеми, цілком може нести вкладений обʼєкт. Віддати його
 *    означало б збрехати типом — клієнт за контрактом має право покласти
 *    значення прямо в `boolean`-проп.
 *
 * Невідповідні ключі ВИКИДАЮТЬСЯ, а не валять запит: єдиний зіпсутий
 * прапорець не має класти всю сторінку налаштувань.
 */
function serializeHubPrefs(
  value: unknown,
): Record<string, string | number | boolean> | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "object" || Array.isArray(value)) return null;
  const out: Record<string, string | number | boolean> = {};
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === "boolean" || typeof v === "string") {
      out[key] = v;
    } else if (typeof v === "number" && Number.isFinite(v)) {
      out[key] = v;
    }
  }
  return out;
}

export async function getUserPreferences(
  db: Queryable,
  userId: string,
): Promise<UserPreferences> {
  const result = await db.query<Record<string, unknown>>(
    `SELECT analytics, ai_memory, push_notifications, sergeant_nudges,
            health_data_consent, active_modules, hub_prefs, updated_at
       FROM user_preferences
      WHERE user_id = $1`,
    [userId],
  );
  return serializePreferences(result.rows[0]);
}

export async function upsertUserPreferences(
  db: Queryable,
  userId: string,
  patch: UserPreferencesPatch,
): Promise<UserPreferences> {
  const current = await getUserPreferences(db, userId);
  const next = {
    analytics: patch.analytics ?? current.analytics,
    aiMemory: patch.aiMemory ?? current.aiMemory,
    pushNotifications: patch.pushNotifications ?? current.pushNotifications,
    sergeantNudges: patch.sergeantNudges ?? current.sergeantNudges,
    healthDataConsent: patch.healthDataConsent ?? current.healthDataConsent,
    // AI-DANGER: тут `??` був би багом. Для булевих полів «поля нема в
    // патчі» і «поле = false» розрізняє сам `??`, бо `false` не nullish.
    // Для `activeModules` осмислене значення саме `null` («прибрати
    // серверний вибір»), і `??` мовчки перетворив би його на «не чіпай».
    // Розрізняємо явно за `undefined`.
    activeModules:
      patch.activeModules !== undefined
        ? patch.activeModules
        : current.activeModules,
    // Те саме розрізнення за `undefined`, що й для `activeModules` вище, і
    // з тієї ж причини: `null` тут — осмислене значення («прибери серверні
    // налаштування»), яке `??` мовчки перетворив би на «не чіпай».
    //
    // Мішок замінюється ЦІЛКОМ, а не зливається по ключах. Це і є
    // LWW-рішення 2026-09-14: пʼять тумблерів живуть на одному екрані й
    // їдуть одним патчем, тож частковий мерж лише створив би стан, якого
    // не бачив жоден пристрій.
    hubPrefs: patch.hubPrefs !== undefined ? patch.hubPrefs : current.hubPrefs,
  };
  const result = await db.query<Record<string, unknown>>(
    `INSERT INTO user_preferences
        (user_id, analytics, ai_memory, push_notifications, sergeant_nudges,
         health_data_consent, active_modules, hub_prefs, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      ON CONFLICT (user_id) DO UPDATE SET
        analytics = EXCLUDED.analytics,
        ai_memory = EXCLUDED.ai_memory,
        push_notifications = EXCLUDED.push_notifications,
        sergeant_nudges = EXCLUDED.sergeant_nudges,
        health_data_consent = EXCLUDED.health_data_consent,
        active_modules = EXCLUDED.active_modules,
        hub_prefs = EXCLUDED.hub_prefs,
        updated_at = NOW()
      RETURNING analytics, ai_memory, push_notifications, sergeant_nudges,
                health_data_consent, active_modules, hub_prefs, updated_at`,
    [
      userId,
      next.analytics,
      next.aiMemory,
      next.pushNotifications,
      next.sergeantNudges,
      next.healthDataConsent,
      next.activeModules,
      next.hubPrefs,
    ],
  );
  return serializePreferences(result.rows[0]);
}

export async function buildMeExport(
  db: Queryable,
  user: MeResponse["user"],
): Promise<MeExportResponse> {
  // AI-NOTE: module_data was dropped by migration 046 (Stage 7 cleanup —
  // finyk/fizruk/routine/nutrition moved to per-row tables in Stage 4,
  // coach moved to coach_memory in migration 045). moduleData is kept in
  // the export schema for backward-compat with any client that expects the
  // key; it is always [] since the underlying table no longer exists.
  const [
    preferences,
    monoConnection,
    monoAccounts,
    monoTransactions,
    subscriptions,
    pushSubscriptions,
    pushDevices,
    aiUsageDaily,
    aiMemories,
  ] = await Promise.all([
    getUserPreferences(db, user.id),
    db.query<Record<string, unknown>>(
      `SELECT status, token_fingerprint, webhook_registered_at,
              last_event_at, last_backfill_at, created_at, updated_at
         FROM mono_connection
        WHERE user_id = $1`,
      [user.id],
    ),
    db.query<Record<string, unknown>>(
      `SELECT mono_account_id, send_id, type, currency_code, cashback_type,
              masked_pan, iban, balance, credit_limit, last_seen_at
         FROM mono_account
        WHERE user_id = $1
        ORDER BY mono_account_id`,
      [user.id],
    ),
    db.query<Record<string, unknown>>(
      `SELECT mono_account_id, mono_tx_id, time, amount, operation_amount,
              currency_code, mcc, original_mcc, hold, description, comment,
              cashback_amount, commission_rate, balance, receipt_id, invoice_id,
              counter_edrpou, counter_iban, counter_name, raw, source, received_at
         FROM mono_transaction
        WHERE user_id = $1 AND deleted_at IS NULL
        ORDER BY time DESC
        LIMIT 5000`,
      [user.id],
    ),
    db.query<Record<string, unknown>>(
      `SELECT id, plan, status, provider, current_period_end,
              cancel_at_period_end, created_at, updated_at
         FROM subscriptions
        WHERE user_id = $1
        ORDER BY created_at DESC`,
      [user.id],
    ),
    db.query<Record<string, unknown>>(
      `SELECT endpoint, created_at, deleted_at
         FROM push_subscriptions
        WHERE user_id = $1
        ORDER BY created_at DESC`,
      [user.id],
    ),
    db.query<Record<string, unknown>>(
      `SELECT platform, endpoint, created_at, updated_at, deleted_at
         FROM push_devices
        WHERE user_id = $1
        ORDER BY updated_at DESC`,
      [user.id],
    ),
    db.query<Record<string, unknown>>(
      // `usage_day::text` — колонка типу DATE, і node-pg парсить її у JS
      // `Date`, тобто в експорт вона лягала як `"2026-09-16T00:00:00.000Z"`:
      // день перетворювався на мить, ще й у чужій таймзоні. День-ключ у
      // цьому репо — рядок `YYYY-MM-DD`, тож беремо його з бази вже текстом,
      // а не намагаємось відновити з `Date` на віддачі.
      `SELECT usage_day::text AS usage_day, bucket, request_count,
              est_cost_usd, deleted_at
         FROM ai_usage_daily
        WHERE subject_key = $1
        ORDER BY usage_day DESC`,
      [`u:${user.id}`],
    ),
    db.query<Record<string, unknown>>(
      `SELECT id, source, source_ref, content, metadata, created_at,
              updated_at, deleted_at
         FROM ai_memories
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT 5000`,
      [user.id],
    ),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    user,
    preferences,
    data: {
      moduleData: [],
      mono: {
        connection: monoConnection.rows[0]
          ? { ...monoConnection.rows[0] }
          : null,
        accounts: rowArray(monoAccounts.rows),
        transactions: rowArray(monoTransactions.rows),
      },
      billing: {
        subscriptions: rowArray(subscriptions.rows),
      },
      push: {
        webSubscriptions: rowArray(pushSubscriptions.rows),
        devices: rowArray(pushDevices.rows),
      },
      ai: {
        usageDaily: aiUsageDaily.rows.map(serializeAiUsageDailyRow),
        memories: rowArray(aiMemories.rows),
      },
    },
  };
}

export async function deleteUserData(
  pool: Pool,
  userId: string,
): Promise<MeDeleteResponse> {
  // Best-effort provider-cancel ПЕРЕД транзакцією (робить зовнішні HTTP —
  // не місце в DB-txn). plata.cancelSubscription сам скасовує підписку в
  // monobank (subscription/edit); DELETE FROM "user" нижче каскадно
  // прибирає plata_subscription-рядок юзера.
  await notifyProvidersCancel(pool, userId);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Snapshot email + Stripe customer id BEFORE any deletion, for the
    // external-services cleanup queue (ADR-0016 § ADR-6.3). Skipped
    // entirely when the user row is already gone (idempotent second
    // delete, or founder-confirmed pre-beta test data) — nothing to
    // snapshot, nothing to clean up externally.
    const userRow = await client.query<{ email: string | null }>(
      `SELECT email FROM "user" WHERE id = $1`,
      [userId],
    );
    if (userRow.rows.length > 0) {
      const stripeRow = await client.query<{
        provider_customer_id: string | null;
      }>(
        `SELECT provider_customer_id
           FROM subscriptions
          WHERE user_id = $1 AND provider = 'stripe'
          ORDER BY updated_at DESC
          LIMIT 1`,
        [userId],
      );
      await enqueueGdprCleanup(client, {
        userId,
        email: userRow.rows[0]!.email ?? `${userId}@deleted.sergeant.app`,
        stripeCustomerId: stripeRow.rows[0]?.provider_customer_id ?? null,
      });
    }

    await client.query(
      `UPDATE subscriptions
          SET status = 'canceled',
              cancel_at_period_end = TRUE,
              updated_at = NOW()
        WHERE user_id = $1
          AND status IN ('active', 'trialing', 'past_due', 'incomplete')`,
      [userId],
    );

    // `ai_usage_daily.subject_key` is a bare TEXT ('u:<userId>' / 'ip:<addr>'),
    // never an FK — CASCADE from `DELETE FROM "user"` below cannot reach it
    // (ADR-0016 § ADR-6.2: "Tables WITHOUT FK CASCADE"). Left unpurged this
    // is exactly the PII orphan the ADR calls out: a synthetic-but-still
    // per-user token surviving account deletion forever.
    await client.query(`DELETE FROM ai_usage_daily WHERE subject_key = $1`, [
      `u:${userId}`,
    ]);

    // NOTE: no separate `ai_memories` soft-delete step here. `ai_memories.
    // user_id` has `ON DELETE CASCADE` (migration 025) straight to
    // `"user"(id)` — the hard `DELETE FROM "user"` below already removes
    // every row. A prior revision of this function soft-deleted
    // `ai_memories` first (`deleted_at = NOW()`) and then hard-deleted the
    // user two statements later, which destroyed the very rows the
    // soft-delete had just marked — a self-contradicting no-op write.
    // Canon: hard-delete via cascade, no separate soft-delete step.
    await client.query(
      `DELETE FROM "user"
        WHERE id = $1`,
      [userId],
    );
    await client.query("COMMIT");
    return { ok: true, deletedAt: iso(new Date()) };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
