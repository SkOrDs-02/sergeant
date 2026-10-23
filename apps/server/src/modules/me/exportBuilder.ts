/**
 * Збірка файлу `GET /api/me/export`: які таблиці їдуть у файл, які ні і чому.
 *
 * Винесено з `dataRights.ts` (priv-12, аудит 2026-10-01), щоб додаткові
 * секції не роздули його понад `max-lines` (Hard Rule #18).
 *
 * AI-CONTEXT: контракт «межа файлу названа в самому файлі» тримається на
 * двох списках, і разом вони мають покрити КОЖНУ таблицю з колонкою
 * `user_id`: `EXPORT_EXPLICIT_TABLES` (їде у файл) і `EXPORT_EXCLUSIONS` (не
 * їде, з причиною). Гейт — `exportTables.drift.test.ts`: він читає міграції і
 * падає, коли нова таблиця з `user_id` не потрапила в жоден зі списків.
 * Раніше гейт дивився лише на префікси `finyk_/fizruk_/nutrition_/routine_`,
 * тож таблиці без префікса (`user_profile`, `receipts`, `silpo_*`…) мовчки
 * випадали з файлу.
 */
import type { Pool, PoolClient } from "pg";
import { decryptHealthText } from "../../lib/healthTextCrypto.js";

type Queryable = Pick<Pool | PoolClient, "query">;
type Row = Record<string, unknown>;

export function rowArray(rows: ReadonlyArray<Row>): Row[] {
  return rows.map((row) => ({ ...row }));
}

/**
 * Hard Rule #1: `pg` віддає `BIGINT`/`BIGSERIAL` і `NUMERIC` рядками. У файлі,
 * який людина читає й переносить, `"123"` замість `123` ламає арифметику
 * споживача, тож числові колонки приводимо до `number` явно. `null` лишається
 * `null`; значення, що не є скінченним числом, віддаємо як є, а не `NaN`.
 */
export function coerceNumberColumns(
  rows: ReadonlyArray<Row>,
  columns: readonly string[],
): Row[] {
  return rows.map((row) => {
    const out: Row = { ...row };
    for (const column of columns) {
      const value = out[column];
      if (typeof value === "string" || typeof value === "bigint") {
        const num = Number(value);
        if (Number.isFinite(num)) out[column] = num;
      }
    }
    return out;
  });
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
 * очима в ревʼю. Гейт від дрейфу — `exportTables.drift.test.ts`.
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
    "finyk_tx_notes",
    "finyk_tx_splits",
    "finyk_tx_tags",
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
 * Таблиці, що їдуть у файл власними явними запитами (не через
 * `MODULE_EXPORT_TABLES`): кожен запит називає колонки, а не `SELECT *`, щоб
 * шифротекст, токени й секрети не могли потрапити у файл разом із новою
 * колонкою. `receipt_items` і `finyk_tx_receipt_links` не мають власного
 * `user_id`, їх людина визначається через батьківський чек.
 *
 * Тест `dataRights.test.ts` звіряє цей список із реально виконаними SQL.
 */
export const EXPORT_EXPLICIT_TABLES: readonly string[] = [
  "user_preferences",
  "mono_connection",
  "mono_account",
  "mono_transaction",
  "mono_jar",
  "privat_connection",
  "subscriptions",
  "push_subscriptions",
  "push_devices",
  "finyk_tx_receipt_links",
  "receipts",
  "receipt_items",
  "import_batches",
  "silpo_connection",
  "silpo_receipts",
  "silpo_receipt_items",
  "silpo_tx_receipt_links",
  "silpo_tx_receipt_link_rejections",
  "user_profile",
  "user_avatars",
  "feedback_entries",
  "email_unsubscribes",
  "waitlist_entries",
];

/**
 * Що НЕ їде в експорт і чому. Секція публічна всередині файлу навмисно:
 * людина має бачити межу того, що забрала, а не здогадуватись про неї
 * (рішення власника, spec-інтервʼю 2026-09-20, раунд 3; доповнено за
 * рішенням власника 2026-10-01, priv-12: у файл їдуть первинні записи,
 * а похідні тексти, кеші й дані сесій названі тут).
 *
 * Причини пишуться для людини: звертання на «ти», без довгого тире.
 */
export const EXPORT_EXCLUSIONS: ReadonlyArray<{
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
    tables: ["ai_memories", "ai_memory_ingest_failed"],
    reason:
      "Памʼять асистента й черга її повторної обробки. Переглянути й стерти памʼять можна в налаштуваннях, у розділі «Згода та дані».",
  },
  {
    group: "aiUsage",
    tables: ["ai_usage_daily"],
    reason:
      "Службовий лічильник звернень до моделі й вартості, не дані про тебе.",
  },
  {
    group: "coachMemory",
    tables: ["coach_memory"],
    reason:
      "Тижневі дайджести й інсайти коуча: тексти, які асистент збирає з твоїх записів. Самі записи їдуть у секції модулів.",
  },
  {
    group: "nudgeCache",
    tables: ["sergeant_nudge_cache"],
    reason:
      "Кеш останньої поради Сержанта: текст згенеровано з твоїх даних і переписується щодня, тож це не твій запис.",
  },
  {
    group: "authSessions",
    tables: ["session", "account"],
    reason:
      "Сесії входу й привʼязані способи входу містять токени та службові ідентифікатори, тому у файл вони не потрапляють. Імʼя та пошта є в розділі user.",
  },
  {
    group: "billingProviderIds",
    tables: [
      "plata_subscription",
      "apple_iap_receipts",
      "billing_pending_cancellation",
    ],
    reason:
      "Ідентифікатори платіжних провайдерів і підписані квитанції Apple: це ключі доступу до списань, а не твої записи. План, статус і період підписки їдуть у billing.",
  },
  {
    group: "integrationSecrets",
    tables: ["silpo_oauth_state"],
    reason:
      "Одноразовий стан входу через Сільпо з кодом перевірки: секрет на кілька хвилин, не дані про тебе.",
  },
  {
    group: "serviceQueues",
    tables: [
      "mono_ai_enrichment_queue",
      "push_reminder_log",
      "ai_photo_refine_grants",
      "gdpr_cleanup_queue",
      "silpo_wipe_marker",
    ],
    reason:
      "Службові черги й журнали дедуплікації та маркери стирання (збагачення транзакцій, нагадування, повторні розбори фото, очищення після видалення акаунта): вони потрібні лише для роботи сервера.",
  },
];

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
 * Таблиці з soft-delete (`deleted_at`, міграція 156, data-15): експорт не
 * віддає tombstone-и — людина забирає свої живі записи, а не службові
 * позначки видалення. Список статичний, як і `MODULE_EXPORT_TABLES`.
 */
const EXPORT_SOFT_DELETE_FILTERED: ReadonlySet<string> = new Set([
  "finyk_tx_categories",
  "finyk_tx_splits",
  "finyk_tx_tags",
  "finyk_mono_debt_links",
  "finyk_networth_history",
]);

export async function fetchModuleTables(
  db: Queryable,
  userId: string,
  tables: readonly string[],
): Promise<Record<string, Row[]>> {
  const allowed = new Set<string>(Object.values(MODULE_EXPORT_TABLES).flat());
  const results = await Promise.all(
    tables.map(async (table) => {
      // Другий рубіж під інтерполяцією нижче: якщо список колись почне
      // приходити не з константи, запит не піде взагалі.
      if (!allowed.has(table)) {
        throw new Error(`export: таблиця «${table}» не в allowlist-і`);
      }
      // eslint-disable-next-line no-restricted-syntax -- інтерполюється ЛИШЕ імʼя таблиці з замороженого `MODULE_EXPORT_TABLES` (перевірено рядком нижче); `userId` іде $-параметром. Той самий "allowlisted identifier" case, що alerts/store.ts.
      const { rows } = await db.query<Row>(
        `SELECT * FROM ${table} WHERE user_id = $1${
          EXPORT_SOFT_DELETE_FILTERED.has(table)
            ? " AND deleted_at IS NULL"
            : ""
        }`,
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

/** Зв'язки чек ↔ транзакція; `receipt_id` — `BIGINT`, тож приводимо до number. */
export async function fetchFinykReceiptLinks(
  db: Queryable,
  userId: string,
): Promise<Row[]> {
  const { rows } = await db.query<Row>(FINYK_RECEIPT_LINKS_SQL, [userId]);
  return coerceNumberColumns(rows, ["receipt_id"]);
}

/**
 * Явні запити «первинних записів поза чотирма модулями» (priv-12). Кожен
 * називає колонки: для `*_connection` це означає, що `token_ciphertext`,
 * `token_iv`, `token_tag` і `access/refresh_token_*` не можуть потрапити у
 * файл, навіть якщо в таблиці зʼявиться нова колонка.
 */
const EXTRA_SQL = {
  profile: `SELECT payload, updated_at
              FROM user_profile
             WHERE user_id = $1`,
  avatar: `SELECT content_type, data, updated_at
             FROM user_avatars
            WHERE user_id = $1`,
  feedback: `SELECT id, category, message, page, viewport, user_agent,
                    app_env, created_at
               FROM feedback_entries
              WHERE user_id = $1
              ORDER BY id`,
  emailUnsubscribes: `SELECT id, campaign_family, unsubscribed_at, source
                        FROM email_unsubscribes
                       WHERE user_id = $1
                       ORDER BY id`,
  waitlist: `SELECT id, email, tier_interest, source, locale, user_agent,
                    created_at, notified_at
               FROM waitlist_entries
              WHERE user_id = $1
              ORDER BY id`,
  monoJars: `SELECT mono_jar_id, send_id, title, description, currency_code,
                    balance, goal, last_seen_at
               FROM mono_jar
              WHERE user_id = $1
              ORDER BY mono_jar_id`,
  privatConnection: `SELECT merchant_id, token_fingerprint, created_at,
                            updated_at
                       FROM privat_connection
                      WHERE user_id = $1`,
  receipts: `SELECT id, source, fiscal_num, store_name, store_tax_id,
                    purchased_at, total_kopiykas, raw_payload, created_at,
                    updated_at
               FROM receipts
              WHERE user_id = $1
              ORDER BY purchased_at DESC, id`,
  receiptItems: `SELECT i.id, i.receipt_id, i.position, i.name, i.qty,
                        i.price_kopiykas, i.sum_kopiykas, i.created_at
                   FROM receipt_items i
                   JOIN receipts r ON r.id = i.receipt_id
                  WHERE r.user_id = $1
                  ORDER BY i.receipt_id, i.position`,
  importBatches: `SELECT id, source, file_hash, status, rows_total,
                         rows_created, rows_linked, rows_skipped,
                         created_row_ids, created_at, updated_at
                    FROM import_batches
                   WHERE user_id = $1
                   ORDER BY id`,
  silpoConnection: `SELECT status, last_sync_at, access_token_expires_at,
                           last_failed_at, last_error_code,
                           pantry_auto_import_since, created_at, updated_at
                      FROM silpo_connection
                     WHERE user_id = $1`,
  silpoReceipts: `SELECT receipt_id, purchased_at, store_id, channel,
                         payment_hint, total_kop, raw,
                         pantry_auto_declined_at, created_at
                    FROM silpo_receipts
                   WHERE user_id = $1
                   ORDER BY purchased_at DESC, receipt_id`,
  silpoReceiptItems: `SELECT i.id, i.receipt_id, i.name, i.qty, i.unit,
                             i.price_kop, i.category_slug, i.barcode,
                             i.pantry_claimed_at, i.created_at
                        FROM silpo_receipt_items i
                        JOIN silpo_receipts r
                          ON r.user_id = i.user_id AND r.receipt_id = i.receipt_id
                       WHERE r.user_id = $1
                       ORDER BY i.receipt_id, i.id`,
  silpoLinks: `SELECT transaction_id, receipt_id, created_at
                 FROM silpo_tx_receipt_links
                WHERE user_id = $1
                ORDER BY transaction_id`,
  silpoRejections: `SELECT transaction_id, receipt_id, created_at
                      FROM silpo_tx_receipt_link_rejections
                     WHERE user_id = $1
                     ORDER BY transaction_id, receipt_id`,
} as const;

export interface ExportAvatar {
  mimeType: string;
  /** Байти файлу (`bytea`), закодовані в base64 без префікса `data:`. */
  dataBase64: string;
  updatedAt: string;
}

/**
 * `user_avatars.data` — `bytea`, `pg` віддає його `Buffer`-ом, який у JSON
 * став би `{type:"Buffer",data:[...]}`. Файл ≤ 50 КБ (`modules/avatar`), тож
 * base64 у JSON експорт не роздуває (рішення власника 2026-10-23, ux-14).
 */
export function serializeAvatar(row: Row | undefined): ExportAvatar | null {
  if (!row) return null;
  const data = row["data"];
  if (!Buffer.isBuffer(data) && !(data instanceof Uint8Array)) return null;
  const updatedAt = row["updated_at"];
  return {
    mimeType: String(row["content_type"]),
    dataBase64: Buffer.from(data).toString("base64"),
    updatedAt:
      updatedAt instanceof Date ? updatedAt.toISOString() : String(updatedAt),
  };
}

export interface ExtraExportSections {
  profile: Row | null;
  /** Фото профілю (ux-14): байти як base64, `null`, коли аватара немає. */
  avatar: ExportAvatar | null;
  feedback: Row[];
  emailUnsubscribes: Row[];
  waitlist: Row[];
  monoJars: Row[];
  privat: { connection: Row | null };
  silpo: {
    connection: Row | null;
    receipts: Row[];
    receiptItems: Row[];
    txReceiptLinks: Row[];
    txReceiptLinkRejections: Row[];
  };
  /** Чеки й імпорти: їдуть у секцію `finyk` під іменами таблиць. */
  finykRecords: {
    receipts: Row[];
    receipt_items: Row[];
    import_batches: Row[];
  };
}

export async function fetchExtraExportSections(
  db: Queryable,
  userId: string,
): Promise<ExtraExportSections> {
  const q = async (sql: string): Promise<Row[]> =>
    (await db.query<Row>(sql, [userId])).rows;
  const [
    profile,
    avatar,
    feedback,
    emailUnsubscribes,
    waitlist,
    monoJars,
    privatConnection,
    receipts,
    receiptItems,
    importBatches,
    silpoConnection,
    silpoReceipts,
    silpoReceiptItems,
    silpoLinks,
    silpoRejections,
  ] = await Promise.all([
    q(EXTRA_SQL.profile),
    q(EXTRA_SQL.avatar),
    q(EXTRA_SQL.feedback),
    q(EXTRA_SQL.emailUnsubscribes),
    q(EXTRA_SQL.waitlist),
    q(EXTRA_SQL.monoJars),
    q(EXTRA_SQL.privatConnection),
    q(EXTRA_SQL.receipts),
    q(EXTRA_SQL.receiptItems),
    q(EXTRA_SQL.importBatches),
    q(EXTRA_SQL.silpoConnection),
    q(EXTRA_SQL.silpoReceipts),
    q(EXTRA_SQL.silpoReceiptItems),
    q(EXTRA_SQL.silpoLinks),
    q(EXTRA_SQL.silpoRejections),
  ]);

  return {
    profile: profile[0] ? { ...profile[0] } : null,
    avatar: serializeAvatar(avatar[0]),
    feedback: coerceNumberColumns(feedback, ["id"]),
    emailUnsubscribes: coerceNumberColumns(emailUnsubscribes, ["id"]),
    waitlist: coerceNumberColumns(waitlist, ["id"]),
    monoJars: coerceNumberColumns(monoJars, ["balance", "goal"]),
    privat: {
      connection: privatConnection[0] ? { ...privatConnection[0] } : null,
    },
    silpo: {
      connection: silpoConnection[0] ? { ...silpoConnection[0] } : null,
      receipts: coerceNumberColumns(silpoReceipts, ["total_kop"]),
      receiptItems: coerceNumberColumns(silpoReceiptItems, [
        "id",
        "qty",
        "price_kop",
      ]),
      txReceiptLinks: rowArray(silpoLinks),
      txReceiptLinkRejections: rowArray(silpoRejections),
    },
    finykRecords: {
      receipts: coerceNumberColumns(receipts, ["id", "total_kopiykas"]),
      receipt_items: coerceNumberColumns(receiptItems, [
        "id",
        "receipt_id",
        "qty",
        "price_kopiykas",
        "sum_kopiykas",
      ]),
      import_batches: coerceNumberColumns(importBatches, ["id"]),
    },
  };
}
