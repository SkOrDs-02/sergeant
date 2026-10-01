import type { Pool, PoolClient } from "pg";
import type {
  DashboardModuleId,
  MeDeleteResponse,
  MeDeletionStatusResponse,
  MeExportResponse,
  MeResponse,
  UserPreferences,
  UserPreferencesPatch,
} from "@sergeant/shared";
import {
  DASHBOARD_MODULE_IDS,
  accountDeletionDeadline,
  PUSH_DAILY_CAP_DEFAULT,
} from "@sergeant/shared";
import { logger } from "../../obs/logger.js";
import { decryptHealthText } from "../../lib/healthTextCrypto.js";
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
  pushDailyCap: PUSH_DAILY_CAP_DEFAULT,
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
    // `SMALLINT` приходить із `pg` як number. Рядок без колонки (до
    // міграції 148) читаємо дефолтом, а не `NaN`-ом.
    pushDailyCap:
      typeof row["push_daily_cap"] === "number"
        ? row["push_daily_cap"]
        : PUSH_DAILY_CAP_DEFAULT,
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
            push_daily_cap, health_data_consent, active_modules, hub_prefs,
            updated_at
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
    pushDailyCap: patch.pushDailyCap ?? current.pushDailyCap,
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
         health_data_consent, active_modules, hub_prefs, push_daily_cap,
         updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
      ON CONFLICT (user_id) DO UPDATE SET
        analytics = EXCLUDED.analytics,
        ai_memory = EXCLUDED.ai_memory,
        push_notifications = EXCLUDED.push_notifications,
        sergeant_nudges = EXCLUDED.sergeant_nudges,
        health_data_consent = EXCLUDED.health_data_consent,
        active_modules = EXCLUDED.active_modules,
        hub_prefs = EXCLUDED.hub_prefs,
        push_daily_cap = EXCLUDED.push_daily_cap,
        updated_at = NOW()
      RETURNING analytics, ai_memory, push_notifications, sergeant_nudges,
                push_daily_cap, health_data_consent, active_modules,
                hub_prefs, updated_at`,
    [
      userId,
      next.analytics,
      next.aiMemory,
      next.pushNotifications,
      next.sergeantNudges,
      next.healthDataConsent,
      next.activeModules,
      next.hubPrefs,
      next.pushDailyCap,
    ],
  );
  return serializePreferences(result.rows[0]);
}

/**
 * Таблиці чотирьох продуктових модулів, які їдуть в експорт.
 *
 * AI-CONTEXT: до 2026-09-20 експорт про них не знав узагалі — віддавав
 * `moduleData: []` від таблиці `module_data`, дропнутої міграцією 046, і
 * людина забирала файл без жодного свого запису з модулів (рада скептиків
 * § A, спека `docs/work/specs/honest-export-and-first-screen.md`).
 *
 * Список статичний, а не `information_schema`-скан, навмисно: експорт —
 * найчутливіший файл у продукті, і те, що в нього потрапляє, має читатись
 * очима в ревʼю. Гейт від дрейфу — тест `dataRights.test.ts`
 * («перелік таблиць збігається з живими міграціями»).
 *
 * Мертві таблиці сюди не входять: `routine_pushups` знято міграцією 139,
 * `fizruk_pushups` — 140 (історія віджимань конвертована у звичайні
 * `fizruk_workouts`, щоб не мати трьох джерел однієї цифри).
 */
export const MODULE_EXPORT_TABLES = {
  finyk: [
    "finyk_assets",
    "finyk_budgets",
    "finyk_custom_categories",
    "finyk_debts",
    "finyk_hidden_accounts",
    "finyk_hidden_transactions",
    "finyk_manual_expenses",
    "finyk_mono_debt_links",
    "finyk_networth_history",
    "finyk_prefs",
    "finyk_receivables",
    "finyk_subscriptions",
    "finyk_tx_categories",
    "finyk_tx_filters",
    "finyk_tx_splits",
  ],
  fizruk: [
    "fizruk_custom_activities",
    "fizruk_custom_exercises",
    "fizruk_daily_log",
    "fizruk_injuries",
    "fizruk_measurements",
    "fizruk_monthly_plan",
    "fizruk_plan_templates",
    "fizruk_programs",
    "fizruk_wellbeing",
    "fizruk_workout_items",
    "fizruk_workout_sets",
    "fizruk_workout_templates",
    "fizruk_workouts",
  ],
  nutrition: [
    "nutrition_goal_periods",
    "nutrition_meals",
    "nutrition_pantries",
    "nutrition_pantry_events",
    "nutrition_pantry_items",
    "nutrition_prefs",
    "nutrition_recipes",
    "nutrition_shopping_list",
    "nutrition_water_log",
  ],
  routine: [
    "routine_categories",
    "routine_completion_events",
    "routine_completion_notes",
    "routine_entries",
    "routine_habit_order",
    "routine_habit_skips",
    "routine_habits",
    "routine_prefs",
    "routine_streaks",
    "routine_tags",
  ],
} as const satisfies Record<string, readonly string[]>;

export type ExportModuleId = keyof typeof MODULE_EXPORT_TABLES;

/**
 * `finyk_tx_receipt_links` — єдина модульна таблиця без власного
 * `user_id`: вона привʼязана до `receipts(id)`, і людина в ній визначена
 * через чек (міграція 121). Тому окремий запит із join, а не спільний
 * шлях нижче.
 */
const FINYK_RECEIPT_LINKS_SQL = `SELECT l.*
     FROM finyk_tx_receipt_links l
     JOIN receipts r ON r.id = l.receipt_id
    WHERE r.user_id = $1`;

/**
 * Що НЕ їде в експорт і чому. Секція публічна всередині файлу навмисно:
 * людина має бачити межу того, що забрала, а не здогадуватись про неї
 * (рішення власника, spec-інтервʼю 2026-09-20, раунд 3).
 */
const EXPORT_EXCLUSIONS: ReadonlyArray<{
  group: string;
  tables: readonly string[];
  reason: string;
}> = [
  {
    group: "syncLog",
    tables: ["sync_op_log", "sync_audit_log"],
    reason:
      "Технічний журнал синхронізації між пристроями, не твої записи: та сама зміна лежить у власній таблиці модуля.",
  },
  {
    group: "nutritionBackups",
    tables: ["nutrition_backups"],
    reason:
      "Знімки стану модуля харчування, а не первинні записи: страви, комора й вода їдуть у секції nutrition.",
  },
  {
    group: "aiMemories",
    tables: ["ai_memories"],
    reason:
      "Памʼять асистента. Переглянути й стерти її можна в налаштуваннях, у розділі «Згода та дані».",
  },
  {
    group: "aiUsage",
    tables: ["ai_usage_daily"],
    reason:
      "Службовий лічильник звернень до моделі й вартості, не дані про тебе.",
  },
];

async function fetchModuleTables(
  db: Queryable,
  userId: string,
  tables: readonly string[],
): Promise<Record<string, Record<string, unknown>[]>> {
  const allowed = new Set<string>(Object.values(MODULE_EXPORT_TABLES).flat());
  const results = await Promise.all(
    tables.map(async (table) => {
      // Другий рубіж під інтерполяцією нижче: якщо список колись почне
      // приходити не з константи, запит не піде взагалі.
      if (!allowed.has(table)) {
        throw new Error(`export: таблиця «${table}» не в allowlist-і`);
      }
      // eslint-disable-next-line no-restricted-syntax -- інтерполюється ЛИШЕ імʼя таблиці з замороженого `MODULE_EXPORT_TABLES` (перевірено рядком нижче); `userId` іде $-параметром. Той самий "allowlisted identifier" case, що alerts/store.ts.
      const { rows } = await db.query<Record<string, unknown>>(
        `SELECT * FROM ${table} WHERE user_id = $1`,
        [userId],
      );
      // GDPR: людина забирає свій текст, а не шифротекст (spec
      // health-text-encryption). Legacy plaintext проходить без змін.
      const out =
        table === "fizruk_injuries"
          ? rows.map((r) =>
              typeof r["note"] === "string"
                ? { ...r, note: decryptHealthText(r["note"]) }
                : r,
            )
          : rows;
      return [table, rowArray(out)] as const;
    }),
  );
  return Object.fromEntries(results);
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
  //
  // Справжні дані модулів їдуть у власних секціях `finyk` / `fizruk` /
  // `nutrition` / `routine` нижче. Старий ключ навмисно НЕ наповнюється:
  // споживач, який памʼятає його семантику (одна таблиця `module_data`),
  // прочитав би новий вміст неправильно (рішення власника, раунд 3).
  const [
    preferences,
    monoConnection,
    monoAccounts,
    monoTransactions,
    subscriptions,
    pushSubscriptions,
    pushDevices,
    finyk,
    fizruk,
    nutrition,
    routine,
    finykReceiptLinks,
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
        ORDER BY time DESC`,
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
    fetchModuleTables(db, user.id, MODULE_EXPORT_TABLES.finyk),
    fetchModuleTables(db, user.id, MODULE_EXPORT_TABLES.fizruk),
    fetchModuleTables(db, user.id, MODULE_EXPORT_TABLES.nutrition),
    fetchModuleTables(db, user.id, MODULE_EXPORT_TABLES.routine),
    db.query<Record<string, unknown>>(FINYK_RECEIPT_LINKS_SQL, [user.id]),
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
      finyk: {
        ...finyk,
        finyk_tx_receipt_links: rowArray(finykReceiptLinks.rows),
      },
      fizruk,
      nutrition,
      routine,
      excluded: EXPORT_EXCLUSIONS.map((item) => ({
        ...item,
        tables: [...item.tables],
      })),
    },
  };
}

/**
 * Прохання видалити акаунт. НЕ видаляє нічого незворотного: ставить мітку
 * `deletion_requested_at`, гасить сесії на всіх пристроях і зупиняє
 * списання. Незворотну частину через `ACCOUNT_DELETION_GRACE_DAYS` днів
 * виконує `purgeUserData` з добивача (`deletionPoller.ts`).
 *
 * Ідемпотентно: `AND deletion_requested_at IS NULL` не дає повторному
 * виклику зсунути дедлайн уперед, тобто нескінченно подовжити вікно.
 * Спека: docs/work/specs/user-deletion-grace-window.md, ADR-0098.
 */
export async function requestAccountDeletion(
  pool: Pool,
  userId: string,
): Promise<MeDeleteResponse> {
  // Підписка зупиняється в день прохання, а не в день добивання: людина не
  // платить за акаунт, який просила видалити (рішення 5 спеки). Наслідок,
  // про який UI попереджає ДО натискання: відновлення підписку не повертає.
  await notifyProvidersCancel(pool, userId);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const marked = await client.query<{ deletion_requested_at: Date }>(
      `UPDATE "user"
          SET deletion_requested_at = NOW()
        WHERE id = $1
          AND deletion_requested_at IS NULL
        RETURNING deletion_requested_at`,
      [userId],
    );

    // Порожній RETURNING = або акаунт уже позначений, або рядка немає.
    // Перший випадок — очікуваний повтор, і тоді треба віддати ПЕРШУ
    // мітку, а не сьогоднішню дату, інакше відповідь показала б людині
    // зсунутий дедлайн, якого сервер не дотримається.
    let requestedAt = marked.rows[0]?.deletion_requested_at ?? null;
    if (!requestedAt) {
      const existing = await client.query<{
        deletion_requested_at: Date | null;
      }>(`SELECT deletion_requested_at FROM "user" WHERE id = $1`, [userId]);
      requestedAt = existing.rows[0]?.deletion_requested_at ?? null;
    }

    // Гасимо сесії на всіх пристроях: далі в акаунт можна лише ввійти
    // заново, і вхід упреться в гейт `requireSession` (рішення 3 спеки).
    // Колонка Better Auth-таблиці `session` — camelCase `"userId"` (див.
    // міграцію 003), а НЕ `user_id`, як у решті наших таблиць.
    await client.query(`DELETE FROM session WHERE "userId" = $1`, [userId]);

    await client.query(
      `UPDATE subscriptions
          SET status = 'canceled',
              cancel_at_period_end = TRUE,
              updated_at = NOW()
        WHERE user_id = $1
          AND status IN ('active', 'trialing', 'past_due', 'incomplete')`,
      [userId],
    );

    await client.query("COMMIT");

    // Рядка користувача немає (видалений раніше, або тестові дані) —
    // відповідь лишається успішною та ідемпотентною, дедлайн рахуємо від
    // цього моменту, добивати вже нічого.
    const requested = requestedAt ?? new Date();
    return {
      ok: true,
      deletedAt: iso(requested),
      scheduledPurgeAt: iso(accountDeletionDeadline(requested)),
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Скасування прохання. Повертає `false`, якщо скасовувати не було чого
 * (акаунт активний або рядка немає) — хендлер мапить це у 404, щоб
 * «відновив неіснуюче» не виглядало як успіх.
 *
 * Підписку не відновлюємо навмисно (рішення 5 спеки): її скасували в день
 * прохання, і повернути її може лише нове оформлення.
 */
export async function restoreAccount(
  pool: Pool,
  userId: string,
): Promise<boolean> {
  const { rowCount } = await pool.query(
    `UPDATE "user"
        SET deletion_requested_at = NULL
      WHERE id = $1
        AND deletion_requested_at IS NOT NULL`,
    [userId],
  );
  return (rowCount ?? 0) > 0;
}

/** Стан вікна для екрана-блокера. */
export async function getAccountDeletionStatus(
  pool: Queryable,
  userId: string,
): Promise<MeDeletionStatusResponse> {
  const { rows } = await pool.query<{ deletion_requested_at: Date | null }>(
    `SELECT deletion_requested_at FROM "user" WHERE id = $1`,
    [userId],
  );
  const requestedAt = rows[0]?.deletion_requested_at ?? null;
  if (!requestedAt) return { pending: false };
  return {
    pending: true,
    requestedAt: iso(requestedAt),
    scheduledPurgeAt: iso(accountDeletionDeadline(new Date(requestedAt))),
  };
}

/**
 * Незворотна частина: рівно те, що `DELETE /api/me` робив синхронно до
 * появи вікна. Тепер її кличе лише добивач після кінця вікна, тож
 * `notifyProvidersCancel` тут немає — провайдерам сказали зупинитись ще в
 * день прохання.
 */
export async function purgeUserData(
  pool: Pool,
  userId: string,
): Promise<MeDeleteResponse> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // RLS-контекст (spec rls-ai-tables-and-isolation-gate, A5): транзакція
    // вже є, тож `DELETE FROM ai_usage_daily` нижче виконується під
    // `app.user_id` цього користувача. Викликається і з роута, і з фонового
    // добивача `AccountDeletionPoller`; обидва передають конкретний userId.
    await client.query("SELECT set_config('app.user_id', $1, true)", [userId]);

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

    // `ai_memory_ingest_failed.user_id` (міграція 069) — теж голий TEXT без
    // FK, а `payload_json` містить повний текст пам'яті (B11 аудиту
    // ai-pipeline-2026-08-05). Без явного purge DLQ-replay воскресив би
    // контент видаленого акаунта.
    await client.query(
      `DELETE FROM ai_memory_ingest_failed WHERE user_id = $1`,
      [userId],
    );

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
    const purgedAt = new Date();
    // Акаунта вже немає, тож «заплановане» і «фактичне» збігаються — поле
    // лишається в контракті, щоб відповідь мала одну форму на обох шляхах.
    return {
      ok: true,
      deletedAt: iso(purgedAt),
      scheduledPurgeAt: iso(purgedAt),
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
