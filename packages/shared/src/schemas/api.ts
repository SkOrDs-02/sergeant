import { z } from "zod";

/**
 * Централізовані zod-схеми для AI/публічних endpoint-ів.
 * Обрізаємо довгі поля на сервері, щоб не платити Anthropic за
 * безконтрольні payload-и і не давати prompt injection-у розростатись.
 */

/** Локаль — вільний рядок, але не надто довгий (наприклад 'uk-UA'). */
const Locale = z.string().trim().min(2).max(16).optional();

// ────────────────────── User / /api/me ──────────────────────
/**
 * Публічний профіль користувача — повертається з `/api/me` і описує
 * мінімум, що бачить клієнт (web cookie-сесія або мобільний bearer-токен).
 *
 * Форма навмисно обрізана: без internal timestamps, id сесії чи інших
 * полів, що не повинні потрапляти в UI. Це єдине джерело правди для
 * `@sergeant/shared`, `@sergeant/api-client` та `apps/server`.
 */
export const UserSchema = z.object({
  id: z.string().min(1),
  email: z.string().email().nullable(),
  name: z.string().nullable(),
  image: z.string().nullable(),
  emailVerified: z.boolean(),
  // Better Auth's `user.createdAt` (час реєстрації акаунта) — ISO-8601
  // рядок. Потрібен PostHog `identify` для трейту `signup_date` і для
  // майбутніх "за днем життя акаунта" сегментацій. Nullable, бо для
  // legacy-юзерів, у яких поле відсутнє у БД, краще лишити null, ніж
  // валити `/api/v1/me` для всієї сесії.
  createdAt: z.string().datetime({ offset: true }).nullable(),
});
export type User = z.infer<typeof UserSchema>;

/** Response shape for `/api/me` (і `/api/v1/me`). */
export const MeResponseSchema = z.object({ user: UserSchema });
export type MeResponse = z.infer<typeof MeResponseSchema>;

/** Модерація: чат-повідомлення. */
export const ChatMessage = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(8000),
});

/** Результат виконання tool call-а на клієнті (повертається в chat). */
export const ToolResult = z.object({
  tool_use_id: z.string().min(1).max(200),
  content: z.union([z.string().max(8000), z.number(), z.boolean()]).optional(),
});

/** /api/chat */
export const ChatRequestSchema = z.object({
  context: z.string().max(40_000).optional().default(""),
  messages: z.array(ChatMessage).max(50).optional().default([]),
  tool_results: z.array(ToolResult).max(20).optional(),
  // tool_calls_raw — сирий вміст від Anthropic, не валідуємо глибоко,
  // лише гарантуємо, що це масив розумного розміру.
  tool_calls_raw: z.array(z.unknown()).max(20).optional(),
  stream: z.boolean().optional(),
});

/**
 * Допустимі `source`-фільтри для `POST /api/ai-memory/recall`. Дзеркалить
 * `ALLOWED_MEMORY_SOURCES` у server-side `types.ts`. Тримаємо строкові
 * літерали тут (а не enum-import з server-only модуля), щоб
 * `@sergeant/shared` лишився edge-runtime-friendly без deps на Postgres.
 */
const RECALL_MEMORY_SOURCES = [
  "chat",
  "finyk",
  "fizruk",
  "nutrition",
  "routine",
  "journal",
  "digest",
  "cofounder",
] as const;

/** POST /api/ai-memory/recall — semantic memory retrieval. */
export const RecallMemoryRequestSchema = z
  .object({
    query: z.string().min(1).max(1000),
    topK: z.number().int().min(1).max(50).optional(),
    sources: z.array(z.enum(RECALL_MEMORY_SOURCES)).max(10).optional(),
  })
  .strict();

/** Один результат у відповіді `/api/ai-memory/recall`. */
export const RecallMemoryResultSchema = z.object({
  /** ID запису. Number, не bigint (rule #1, AGENTS.md). */
  id: z.number().int(),
  source: z.enum(RECALL_MEMORY_SOURCES),
  sourceRef: z.string().nullable(),
  content: z.string(),
  /** Cosine similarity у [0, 1]. Більше — ближче. */
  score: z.number().min(0).max(1),
  /** ISO-8601 timestamp. */
  createdAt: z.string(),
  metadata: z.record(z.string(), z.unknown()),
});

/** Response для `POST /api/ai-memory/recall`. */
export const RecallMemoryResponseSchema = z.object({
  memories: z.array(RecallMemoryResultSchema),
});
export type RecallMemoryRequest = z.infer<typeof RecallMemoryRequestSchema>;
export type RecallMemoryResult = z.infer<typeof RecallMemoryResultSchema>;
export type RecallMemoryResponse = z.infer<typeof RecallMemoryResponseSchema>;

/** /api/nutrition/analyze-photo */
export const AnalyzePhotoSchema = z.object({
  image_base64: z
    .string()
    .min(100, "Порожнє зображення")
    .max(7_000_000, "Зображення завелике"),
  mime_type: z
    .string()
    .regex(/^image\/[a-z+.-]+$/i)
    .max(64)
    .optional(),
  locale: Locale,
});

/** /api/nutrition/refine-photo */
export const RefinePhotoSchema = z.object({
  image_base64: z
    .string()
    .min(100, "Порожнє зображення")
    .max(7_000_000, "Зображення завелике"),
  mime_type: z
    .string()
    .regex(/^image\/[a-z+.-]+$/i)
    .max(64)
    .optional(),
  prior_result: z.unknown().optional(),
  portion_grams: z.number().finite().positive().optional().nullable(),
  qna: z
    .array(
      z.object({
        question: z.string().max(500).optional(),
        answer: z.string().max(500).optional(),
      }),
    )
    .max(8)
    .optional(),
  locale: Locale,
});

/** /api/nutrition/parse-pantry */
export const ParsePantrySchema = z.object({
  text: z
    .string()
    .trim()
    .min(1, "text is required")
    .max(10_000, "Text too large"),
  locale: Locale,
});

/** /api/nutrition/backup-upload */
export const BackupUploadSchema = z.object({
  // Зашифровано на клієнті; сервер не заглядає всередину структуру. Обмежуємо
  // лише тип і загальний розмір (останнє — у handler-і, бо z.object не
  // міряє JSON.stringify-байти).
  blob: z.record(z.string(), z.unknown()),
});

/** Спільний формат елемента комори для nutrition-ендпойнтів. */
const PantryItem = z.union([
  z.string().max(200),
  z.object({
    name: z.string().max(120).optional(),
    qty: z
      .union([z.number().finite(), z.string().max(32)])
      .optional()
      .nullable(),
    unit: z.string().max(32).optional().nullable(),
    notes: z.string().max(200).optional().nullable(),
  }),
]);

/** /api/nutrition/recommend-recipes */
export const RecommendRecipesSchema = z.object({
  pantry: z.array(PantryItem).max(200).optional(),
  preferences: z
    .object({
      goal: z.string().max(40).optional(),
      servings: z.number().finite().positive().optional(),
      timeMinutes: z.number().finite().positive().optional(),
      exclude: z.string().max(500).optional(),
      locale: Locale,
    })
    .partial()
    .optional(),
  count: z.number().finite().int().positive().max(10).optional(),
  locale: Locale,
});

/** /api/nutrition/day-hint, day-plan, week-plan, shopping-list */
const Macros = z.object({
  kcal: z.number().finite().nonnegative().nullable().optional(),
  protein_g: z.number().finite().nonnegative().nullable().optional(),
  fat_g: z.number().finite().nonnegative().nullable().optional(),
  carbs_g: z.number().finite().nonnegative().nullable().optional(),
});

/**
 * Цілі КБЖВ у форматі, який реально шле клієнт у day-hint:
 * `dailyTargetKcal`, `dailyTargetProtein_g`, ... Приймаємо і короткі
 * `kcal/protein_g/...` (як у day-plan), і довгі — тому `passthrough()`.
 */
const NutritionTargets = z
  .object({
    kcal: z.number().finite().nonnegative().nullable().optional(),
    protein_g: z.number().finite().nonnegative().nullable().optional(),
    fat_g: z.number().finite().nonnegative().nullable().optional(),
    carbs_g: z.number().finite().nonnegative().nullable().optional(),
    dailyTargetKcal: z.number().finite().nonnegative().nullable().optional(),
    dailyTargetProtein_g: z
      .number()
      .finite()
      .nonnegative()
      .nullable()
      .optional(),
    dailyTargetFat_g: z.number().finite().nonnegative().nullable().optional(),
    dailyTargetCarbs_g: z.number().finite().nonnegative().nullable().optional(),
  })
  .passthrough();

export const DayHintSchema = z.object({
  macros: Macros.optional(),
  targets: NutritionTargets.optional(),
  hasMeals: z.boolean().optional(),
  hasAnyMacros: z.boolean().optional(),
  macroSources: z
    .union([
      z.record(z.string().max(50), z.number().finite()),
      z.array(z.string().max(50)).max(20),
    ])
    .optional(),
  locale: Locale,
});

export const DayPlanSchema = z.object({
  pantry: z.array(PantryItem).max(200).optional(),
  targets: NutritionTargets.optional(),
  regenerateMealType: z
    .enum(["breakfast", "lunch", "dinner", "snack"])
    .optional(),
  locale: Locale,
});

export const WeekPlanSchema = z.object({
  pantry: z.array(PantryItem).max(200).optional(),
  preferences: z
    .object({
      goal: z.string().max(40).optional(),
    })
    .partial()
    .optional(),
  locale: Locale,
});

/** Рецепт для shopping-list — довільна форма з клієнта, обмежуємо розміри. */
const ShoppingListRecipe = z.object({
  title: z.string().max(200).optional(),
  ingredients: z.array(z.string().max(200)).max(50).optional(),
});

const ShoppingListWeekPlan = z
  .object({
    days: z
      .array(
        z.object({
          label: z.string().max(80).optional(),
          meals: z.array(z.string().max(500)).max(10).optional(),
        }),
      )
      .max(7)
      .optional(),
  })
  .partial();

export const ShoppingListSchema = z.object({
  recipes: z.array(ShoppingListRecipe).max(20).optional(),
  weekPlan: ShoppingListWeekPlan.optional(),
  pantryItems: z.array(PantryItem).max(300).optional(),
  locale: Locale,
});

// ────────────────────── Weekly digest / coach ──────────────────────
// Верхня межа рядків на аналітичних полях — захист від безконтрольного
// prompt-injection payload-у в Anthropic. Числа тримаємо скінченними, щоб
// Infinity/NaN не просочились у промт.
const Num = z.number().finite().optional().nullable();

const FinykDigestSchema = z
  .object({
    totalSpent: Num,
    totalIncome: Num,
    monthlyBudget: Num,
    txCount: Num,
    topCategories: z
      .array(z.object({ name: z.string().max(120), amount: Num }))
      .max(20)
      .optional(),
  })
  .partial();

const FizrukDigestSchema = z
  .object({
    workoutsCount: Num,
    totalVolume: Num,
    recoveryLabel: z.string().max(120).optional().nullable(),
    topExercises: z
      .array(z.object({ name: z.string().max(120), totalVolume: Num }))
      .max(20)
      .optional(),
  })
  .partial();

const NutritionDigestSchema = z
  .object({
    avgKcal: Num,
    targetKcal: Num,
    avgProtein: Num,
    avgFat: Num,
    avgCarbs: Num,
    daysLogged: Num,
  })
  .partial();

const RoutineDigestSchema = z
  .object({
    overallRate: Num,
    habitCount: Num,
    habits: z
      .array(
        z.object({
          name: z.string().max(120),
          completionRate: Num,
          done: Num,
          total: Num,
        }),
      )
      .max(50)
      .optional(),
  })
  .partial();

// Клієнтські агрегатори повертають `null`, коли у модулі немає даних за
// тиждень (див. `aggregateFizruk`/`aggregateNutrition`/`aggregateRoutine` у
// `src/core/insights/useWeeklyDigest.ts`). `.nullish()` приймає і `null`, і
// `undefined`, тож запит проходить валідацію незалежно від того, чи
// клієнт пропускає поле, чи надсилає його як `null`.
export const WeeklyDigestSchema = z.object({
  weekRange: z.string().max(80).optional(),
  finyk: FinykDigestSchema.nullish(),
  fizruk: FizrukDigestSchema.nullish(),
  nutrition: NutritionDigestSchema.nullish(),
  routine: RoutineDigestSchema.nullish(),
});
/**
 * Request payload type for `POST /api/weekly-digest`. Both the server handler
 * and the api-client derive their types from `WeeklyDigestSchema` per Hard
 * Rule #3 — the api-client's historical `WeeklyDigestPayload` typed every
 * field as `unknown`, which was only a way to silence TypeScript rather than
 * describe the contract.
 */
export type WeeklyDigestRequest = z.infer<typeof WeeklyDigestSchema>;

// ── Weekly digest response ─────────────────────────────────────────────
//
// Response from `POST /api/weekly-digest`. The server prompts Claude for a
// JSON blob with four module-specific analysis blocks + an overall
// recommendations array (see the prompt template in
// `apps/server/src/modules/digest/weekly-digest.ts`). The blob is the
// contract with Claude; after `extractJsonObject` succeeds, we validate it
// against `WeeklyDigestReportSchema` so a shape drift from the LLM becomes
// a 502 `ANTHROPIC_PARSE_ERROR` at the edge rather than a typed lie going
// all the way to the UI.
//
// Each module block is `.partial()` — Claude is explicitly instructed to
// return `null` for modules with no input data, and `.nullable()` captures
// that. `recommendations` is always an array of strings (the prompt asks
// for it; an empty array is the "no recommendation" encoding).

const DigestModuleBlockSchema = z
  .object({
    summary: z.string().max(500),
    comment: z.string().max(2000),
    recommendations: z.array(z.string().max(500)).max(20),
  })
  .nullable();

/**
 * The AI-generated digest body. Lives under `report` in the HTTP response.
 * Shape is fixed by the system prompt in the server handler; if the prompt
 * changes, update this schema in the same PR (Hard Rule #3).
 */
export const WeeklyDigestReportSchema = z.object({
  finyk: DigestModuleBlockSchema,
  fizruk: DigestModuleBlockSchema,
  nutrition: DigestModuleBlockSchema,
  routine: DigestModuleBlockSchema,
  overallRecommendations: z.array(z.string().max(500)).max(30),
});
export type WeeklyDigestReport = z.infer<typeof WeeklyDigestReportSchema>;

/**
 * Success envelope: the parsed `report` plus an ISO timestamp used by the
 * client as a "when was this generated" marker (persisted to localStorage
 * alongside the report so the UI can show a relative time like "6h ago").
 */
export const WeeklyDigestSuccessSchema = z.object({
  report: WeeklyDigestReportSchema,
  generatedAt: z.string().min(1),
});
export type WeeklyDigestSuccess = z.infer<typeof WeeklyDigestSuccessSchema>;

/** Error envelope — validation / Anthropic upstream / parse failures. */
export const WeeklyDigestErrorSchema = z.object({
  error: z.string().min(1),
});
export type WeeklyDigestErrorResponse = z.infer<typeof WeeklyDigestErrorSchema>;

/**
 * Discriminated response. Same `{ data } | { error }` shape as the other
 * AI-backed endpoints in this file.
 */
export const WeeklyDigestResponseSchema = z.union([
  WeeklyDigestSuccessSchema,
  WeeklyDigestErrorSchema,
]);
export type WeeklyDigestResponse = z.infer<typeof WeeklyDigestResponseSchema>;

// AI-NOTE: `dateContext` обов'язковий для адекватного темпорального
// обрамлення інсайту (без нього модель імпровізує "середина тижня" в неділю).
// Поля: `todayKey` — Kyiv-time `YYYY-MM-DD`; `weekDayUk` — день тижня
// українською ("понеділок"…"неділя"); `dayOfWeekIso` — 1 (пн)…7 (нд);
// `daysIntoWeek` — скільки днів тижня вже пройшло (= `dayOfWeekIso`);
// `weekRange` — людиночитабельний діапазон тижня для контексту.
const CoachDateContextSchema = z
  .object({
    todayKey: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    weekDayUk: z.string().max(20).optional(),
    dayOfWeekIso: z.number().int().min(1).max(7).optional(),
    daysIntoWeek: z.number().int().min(1).max(7).optional(),
    weekRange: z.string().max(80).optional(),
  })
  .partial();

const CoachSnapshotSchema = z
  .object({
    dateContext: CoachDateContextSchema.nullish(),
    finyk: FinykDigestSchema.nullish(),
    fizruk: FizrukDigestSchema.nullish(),
    nutrition: NutritionDigestSchema.nullish(),
    routine: RoutineDigestSchema.nullish(),
  })
  .partial();

// Пам'ять coach-а зберігається сервером і повертається назад клієнтом —
// не валідуємо глибоко, лише обмежуємо кількість digest-ів.
const CoachMemoryEchoSchema = z
  .object({
    weeklyDigests: z.array(z.unknown()).max(24).optional(),
    lastInsightDate: z.string().max(80).optional().nullable(),
    lastInsightText: z.string().max(4000).optional().nullable(),
  })
  .partial();

// `snapshot` і `memory` можуть надходити як `null` (нема даних / перший
// сеанс без збереженої пам'яті), тому приймаємо `nullish`, а handler уже
// коректно обробляє обидва випадки через `snapshot?.finyk` / `memory || null`.
export const CoachInsightSchema = z.object({
  snapshot: CoachSnapshotSchema.nullish(),
  memory: CoachMemoryEchoSchema.nullish(),
});

// Розмірні ліміти на окремі поля не застосовуємо — загальний
// blob-size check у `coachMemoryPost` (через `MAX_BLOB_SIZE`) слугує єдиним
// джерелом правди про розмір payload-у. Тут лише структура.
export const CoachMemoryPostSchema = z.object({
  weeklyDigest: z
    .object({
      weekKey: z.string(),
      weekRange: z.string().optional(),
      generatedAt: z.string().optional(),
      finyk: z.unknown().optional(),
      fizruk: z.unknown().optional(),
      nutrition: z.unknown().optional(),
      routine: z.unknown().optional(),
      overallRecommendations: z.array(z.string()).optional(),
    })
    .optional(),
});

// ────────────────────── Sync ──────────────────────
// Повторюємо константу `VALID_MODULES` з `server/modules/sync.js` у zod-enum:
// єдина SSOT — той Set; тут лише back-compat перелік для 400 з деталями поля.
const SyncModuleEnum = z.enum([
  "finyk",
  "fizruk",
  "routine",
  "nutrition",
  "profile",
]);

// `clientUpdatedAt` — обов'язковий last-write-wins guard. Без нього
// `module_data.client_updated_at <= $4` зі сторожовою умовою у
// `syncPush`/`syncPushAll` завжди матчить (handler підставляв `new Date()`),
// тому push старого клієнта мовчки перезаписував свіжіший запис з іншого
// пристрою. Тепер клієнт, що не надсилає поле, отримує 400 замість
// тихої втрати даних.
//
// `.min(1)` / `.finite()` + refine на валідність `new Date(v)` — потрібні,
// бо інакше `""`, `NaN`, `"garbage"` проходили zod і ставали `Invalid Date`
// у хендлері: `pg` при серіалізації викидав `RangeError: Invalid time
// value`, і замість чистого 400 клієнт отримував 500 з внутрішнім стектрейсом.
const ClientUpdatedAtSchema = z
  .union([z.string().min(1), z.number().finite(), z.date()])
  .refine((v) => !Number.isNaN(new Date(v).getTime()), {
    message: "Invalid date",
  });

export const SyncPushSchema = z.object({
  module: SyncModuleEnum,
  // Клієнт може слати будь-який JSON всередині `data` (зашифрований blob),
  // тому глибоко не валідуємо — розмір обмежується у handler-і (5 MB).
  data: z.unknown().refine((v) => v !== undefined && v !== null, {
    message: "Missing data",
  }),
  clientUpdatedAt: ClientUpdatedAtSchema,
});

export const SyncPullSchema = z.object({
  module: SyncModuleEnum,
});

export const SyncPushAllSchema = z.object({
  modules: z.record(
    z.string(),
    z.object({
      data: z.unknown(),
      clientUpdatedAt: ClientUpdatedAtSchema,
    }),
  ),
});

// ────────────────────── Sync v2 (op-log) ──────────────────────
// Stage 2 / PR #021 із `docs/planning/storage-roadmap.md`. v2 — per-row
// op-log замість whole-blob LWW v1. Ці схеми валідують HTTP-payload
// до того, як handler звертається до `sync_op_log`. Серверний whitelist
// дозволених `table` живе в `apps/server/src/modules/sync/syncV2.ts`
// (`OP_LOG_TABLE_REGISTRY`); тут перевіряється тільки формат.

/** Hard cap на op-payload, узгоджений із документацією PR #021. */
export const SYNC_V2_MAX_OPS_PER_PUSH = 200;
export const SYNC_V2_MAX_ROW_BYTES = 256 * 1024;
export const SYNC_V2_MAX_TABLE_NAME_LEN = 64;
export const SYNC_V2_MAX_IDEMPOTENCY_KEY_LEN = 64;
export const SYNC_V2_PULL_DEFAULT_LIMIT = 100;
export const SYNC_V2_PULL_MAX_LIMIT = 500;

/**
 * Допустимі op-kind на per-row рівні.
 *
 * `insert` / `update` / `delete` — LWW-протокол від PR #021. `increment`
 * — додатковий PN-counter primitive, переданий у Stage 5 PR #042a як
 * protocol-only заділ під PR #042b (`routine_streaks` PN-counter,
 * `delta`-payload, atomic `UPDATE … SET counter = counter + delta`).
 *
 * **Важливо:** після PR #042a server-side apply-шлях відхиляє кожний
 * `op='increment'` engine-level причиною `op_not_supported` —
 * ні одна apply-fn його не обробляє. Whitelist підтримуваних таблиць
 * вмикається у PR #042b разом із самою counter-семантикою.
 */
const SyncV2OpKindEnum = z.enum(["insert", "update", "delete", "increment"]);

/**
 * Один запис op-log-а. `row` — JSON-payload (PK + поля); серверний
 * apply-шлях знає shape per-table і не валідує тут. Розмір payload-а
 * обмежено окремим refine-ом (256 KB), щоб не платити за safeParse-инг
 * мегабайтних об'єктів.
 *
 * `client_ts` приймається як ISO-8601 рядок з offset-ом; пізніше
 * сервер відхилить значення з clock skew > 1 година.
 */
const SyncV2OpSchema = z.object({
  table: z.string().trim().min(1).max(SYNC_V2_MAX_TABLE_NAME_LEN),
  op: SyncV2OpKindEnum,
  row: z.record(z.string(), z.unknown()).refine(
    (v) => {
      // Обмежуємо розмір per-row payload-а на серверному boundary.
      // 256 KB — щедро для UI-row-у і захищає від PG `data too large`
      // помилок усередині транзакції.
      try {
        return JSON.stringify(v).length <= SYNC_V2_MAX_ROW_BYTES;
      } catch {
        return false;
      }
    },
    { message: "row_too_large" },
  ),
  client_ts: z.string().datetime({ offset: true }),
  idempotency_key: z
    .string()
    .min(1)
    .max(SYNC_V2_MAX_IDEMPOTENCY_KEY_LEN)
    // ULID/UUID — alphanum + `-`/`_`. Тримаємо мінімально-вузький
    // pattern, щоб клієнти могли використовувати власну схему ключів,
    // але не leak-али шлях для smuggle через NULL/keep-alive.
    .regex(/^[A-Za-z0-9_-]+$/, "invalid_idempotency_key"),
});

export const SyncV2PushSchema = z.object({
  ops: z.array(SyncV2OpSchema).min(1).max(SYNC_V2_MAX_OPS_PER_PUSH),
});
export type SyncV2PushRequest = z.infer<typeof SyncV2PushSchema>;
export type SyncV2Op = z.infer<typeof SyncV2OpSchema>;

/**
 * Pull — cursor-based по `id`. `since=0` означає "з самого початку";
 * `limit` за замовчуванням 100, до 500.
 *
 * Query-парам-и приходять як рядки, тож використовуємо `z.coerce.number`
 * — `.int().nonnegative()` і `.min(1).max(500)` уже після coerce,
 * щоб `?since=foo` падав 400-кою на schema-етапі.
 */
export const SyncV2PullSchema = z.object({
  since: z.coerce.number().int().nonnegative().optional().default(0),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(SYNC_V2_PULL_MAX_LIMIT)
    .optional()
    .default(SYNC_V2_PULL_DEFAULT_LIMIT),
});
export type SyncV2PullRequest = z.infer<typeof SyncV2PullSchema>;

// ────────────────────── Bank proxies (query validation) ──────────────────────
// `path` перевіряється ще raw-regex-ом в handler-ах (whitelist), тут тільки
// формат: починається з `/`, без CRLF і розумна довжина.
const BankApiPath = z
  .string()
  .trim()
  .min(1)
  .max(256)
  .regex(/^\/[A-Za-z0-9\-_/]+$/, "Некоректний шлях API");

export const PrivatQuerySchema = z
  .object({
    path: BankApiPath.optional(),
  })
  .passthrough();

// ────────────────────── Web-push ──────────────────────
// PushSubscription.endpoint — URL, але браузери видають доволі довгі
// (FCM/Apple > 300 символів), тому лише розумна верхня межа.
const PushKeys = z.object({
  p256dh: z.string().min(1).max(256),
  auth: z.string().min(1).max(256),
});

export const PushSubscribeSchema = z.object({
  endpoint: z.string().url().max(2048),
  keys: PushKeys,
});

export const PushUnsubscribeSchema = z.object({
  endpoint: z.string().url().max(2048),
});

/**
 * `/api/v1/push/register` — уніфікована реєстрація push-пристрою.
 *
 * `platform: "web"` — web-push: `token` несемо як endpoint URL, `keys`
 * обов'язкові (див. RFC 8030). `platform: "ios"|"android"` — native push:
 * `token` — opaque APNs/FCM device token, `endpoint`/`keys` відсутні.
 *
 * Валідатор нижче приймає обидва shape-и; handler сам маршрутизує у
 * правильну таблицю (`push_subscriptions` для web vs `push_devices` для
 * native). Довжини полів підібрані під реальні ліміти: FCM registration
 * token — до ~4KB, APNs — 64 hex (32 bytes), endpoint URL — до 2KB.
 */
export const PushRegisterSchema = z.discriminatedUnion("platform", [
  z.object({
    platform: z.literal("web"),
    token: z.string().url().max(2048),
    keys: PushKeys,
  }),
  z.object({
    platform: z.enum(["ios", "android"]),
    token: z.string().min(1).max(4096),
  }),
]);

/**
 * `/api/v1/push/unregister` — уніфіковане видалення push-пристрою.
 *
 * Web — знімаємо підписку за `endpoint` (запис у `push_subscriptions`
 * soft-delete-иться). Для native (ios/android) — soft-delete у
 * `push_devices` за opaque `token`. Форма поля — дзеркало
 * `PushRegisterSchema`, але для web ідентифікатор іменується `endpoint`
 * (як у `PushSubscription.endpoint`), а не `token`, щоб бек/фронт
 * не плутали payload реєстрації та анрегу при читанні логів.
 */
export const PushUnregisterSchema = z.discriminatedUnion("platform", [
  z.object({
    platform: z.literal("web"),
    endpoint: z.string().url().max(2048),
  }),
  z.object({
    platform: z.enum(["ios", "android"]),
    token: z.string().min(1).max(4096),
  }),
]);

// `.nullable()` на необов'язкових полях — для back-compat із воркерами, які
// історично слали `null` замість відсутнього поля.
export const PushSendSchema = z.object({
  userId: z.string().min(1).max(200),
  title: z.string().min(1).max(200),
  body: z.string().max(2000).optional().nullable(),
  module: z.string().max(40).optional().nullable(),
  tag: z.string().max(120).optional().nullable(),
});

/**
 * `POST /api/v1/push/test` — ручка для відправки тестового пуша на всі
 * зареєстровані пристрої поточного користувача. Auth обов'язкова; сервер
 * пропускає body через `sendToUser` (див. `apps/server/src/push/send.ts`)
 * і повертає агрегований summary.
 *
 * `data` — довільні key/value-рядки, що APNs/FCM передадуть у payload
 * без інтерпретації (дозволяє debug-payload без зміни schema).
 */
export const PushTestRequestSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(2000),
  data: z.record(z.string().max(200), z.string().max(2000)).optional(),
  /**
   * Deep-link, що клієнт відкриє по тапу. Сервер прокине у `data.url` для
   * всіх трьох каналів; native/web handler читають з одного ключа.
   * URL-валідацію навмисно робимо м'якою (`.url()` без `.startsWith`), щоб
   * поза-HTTPS кастом-схеми (`sergeant://finyk/tx/123`) теж проходили.
   */
  url: z.string().trim().min(1).max(2048).optional(),
  /**
   * Background/silent push. `true` → iOS `content-available=1` без banner,
   * Android/FCM data-only. Web-push гілка ігнорує (див. `PushPayload`).
   */
  silent: z.boolean().optional(),
});

/**
 * Уніфікований summary-результат `sendToUser`. `delivered` — скільки
 * пристроїв по кожній платформі отримали push; `cleaned` — скільки dead
 * tokens сервер soft-deleted у цьому ж виклику; `errors` — список
 * платформо-специфічних помилок (per-device, не per-виклик).
 */
export const PushSendPlatformSchema = z.enum(["ios", "android", "web"]);
export const PushSendErrorSchema = z.object({
  platform: PushSendPlatformSchema,
  reason: z.string(),
});
export const PushTestResponseSchema = z.object({
  delivered: z.object({
    ios: z.number().int().nonnegative(),
    android: z.number().int().nonnegative(),
    web: z.number().int().nonnegative(),
  }),
  cleaned: z.number().int().nonnegative(),
  errors: z.array(PushSendErrorSchema),
});

// `/api/push/send` (worker fan-out) повертає той самий summary, що й
// `/api/push/test`. OpenAPI registry віддає їх як окремі іменовані схеми
// `PushSendSummary` / `PushTestResponse`, тож тримаємо явний alias —
// рефактор може розщепити їх у майбутньому без зміни контракту.
export const PushSendSummarySchema = PushTestResponseSchema;

// ────────────────────── Pagination ──────────────────────
// Переused у будь-якому endpoint-і, що повертає список. Query-params завжди
// приходять рядками — `z.coerce.number()` конвертує "8" → 8 автоматично.
export const PaginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

// ────────────────────── Food-search / barcode ──────────────────────
export const FoodSearchQuerySchema = z.object({
  q: z.string().trim().min(2).max(120),
  // `limit` — скільки результатів повернути (1–20, default 8). Query-param
  // приходить рядком — coerce конвертує автоматично.
  limit: z.coerce.number().int().min(1).max(20).default(8),
});

export const BarcodeQuerySchema = z.object({
  // клієнт може присилати з пробілами/знаками — нормалізуємо у handler-і,
  // тут лише обмежуємо довжину й склад.
  barcode: z.string().trim().min(1, "Штрихкод не може бути порожнім").max(32),
});

// ────────────────────── Mono webhook integration (Track A/B/C) ──────────────
//
// SSOT for the `/api/mono/*` HTTP contract per AGENTS.md Hard Rule #3.
// Server handlers in `apps/server/src/modules/mono/{connection,read,backfill}`
// derive their response shapes from these schemas, validate via `.parse()`
// before `res.json()`, and the api-client (`packages/api-client/src/endpoints/
// mono.ts`) re-exports `z.infer<>` so the three artefacts (server, client
// types, tests) cannot drift again silently.

export const MonoTransactionsQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  accountId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().min(3).optional(),
});

/**
 * Lifecycle of the per-user `mono_connection` row. Webhook flips
 * `active`→`invalid` when Monobank rejects a delivery (e.g. token revoked);
 * UI then prompts the user to reconnect. `pending` exists for a short
 * window between `connect` and the first webhook delivery / accounts
 * upsert (currently unused — `connect` immediately sets `active`).
 */
export const MonoConnectionStatusSchema = z.enum([
  "pending",
  "active",
  "invalid",
  "disconnected",
]);
export type MonoConnectionStatus = z.infer<typeof MonoConnectionStatusSchema>;

/**
 * `transaction.source` — `'webhook'` for live deliveries from Monobank,
 * `'backfill'` for rows ingested by `POST /api/mono/backfill` (last 31d
 * statement window). Used by the upsert-conflict CASE so a webhook row
 * never gets its `received_at` overwritten by a later backfill.
 */
export const MonoTransactionSourceSchema = z.enum(["webhook", "backfill"]);
export type MonoTransactionSource = z.infer<typeof MonoTransactionSourceSchema>;

/**
 * Row from `GET /api/mono/accounts`. Mirrors the columns of `mono_account`
 * after `normalizeMonoAccount()` coerces `bigint`→`number` (Hard Rule #1)
 * and `Date`→ISO-8601 string. `lastSeenAt` is always present — DB column
 * is `NOT NULL` and the normalizer renders `null` to a string only via
 * `.toISOString()`, never null.
 */
export const MonoAccountDtoSchema = z.object({
  userId: z.string().min(1),
  monoAccountId: z.string().min(1),
  sendId: z.string().nullable(),
  type: z.string().nullable(),
  currencyCode: z.number().int(),
  cashbackType: z.string().nullable(),
  // Monobank can return up to 4 PANs per account (multi-card). Empty array
  // is the "no cards" encoding (e.g. FOP accounts).
  maskedPan: z.array(z.string()).max(8),
  iban: z.string().nullable(),
  // bigint columns coerced to number by `normalizeMonoAccount`; `null` when
  // Monobank hadn't reported a balance yet.
  balance: z.number().nullable(),
  creditLimit: z.number().nullable(),
  lastSeenAt: z.string().min(1),
});
export type MonoAccountDto = z.infer<typeof MonoAccountDtoSchema>;

/** Response of `GET /api/mono/accounts` — array of accounts, no envelope. */
export const MonoAccountsResponseSchema = z.array(MonoAccountDtoSchema);
export type MonoAccountsResponse = z.infer<typeof MonoAccountsResponseSchema>;

/**
 * Row from `GET /api/mono/transactions`. Mirrors the columns of
 * `mono_transaction` after `normalizeMonoTransaction()`. Bigint money
 * columns (`amount`, `operationAmount`, `cashbackAmount`,
 * `commissionRate`, `balance`) are coerced to `number`; `time` and
 * `receivedAt` are ISO-8601 strings.
 */
export const MonoTransactionDtoSchema = z.object({
  userId: z.string().min(1),
  monoAccountId: z.string().min(1),
  monoTxId: z.string().min(1),
  time: z.string().min(1),
  // Monobank denominates in the smallest currency unit (kopecks for UAH);
  // negative values are debits, positive are credits.
  amount: z.number(),
  operationAmount: z.number(),
  currencyCode: z.number().int(),
  // MCC / original-MCC / hold are missing for jar-to-jar internal transfers
  // and a few legacy rows; UI must handle null.
  mcc: z.number().int().nullable(),
  originalMcc: z.number().int().nullable(),
  hold: z.boolean().nullable(),
  description: z.string().nullable(),
  comment: z.string().nullable(),
  cashbackAmount: z.number().nullable(),
  commissionRate: z.number().nullable(),
  balance: z.number().nullable(),
  receiptId: z.string().nullable(),
  invoiceId: z.string().nullable(),
  counterEdrpou: z.string().nullable(),
  counterIban: z.string().nullable(),
  counterName: z.string().nullable(),
  /**
   * Server-resolved expense-category slug derived from `mcc` via the
   * `MCC_CATEGORIES` map in `@sergeant/finyk-domain/constants`. `null` when
   * the MCC is unknown / 0 / missing — UI then falls back to its own
   * client-side categorisation (description keywords, user override).
   */
  categorySlug: z.string().nullable(),
  /**
   * Sticky latch set by the (forthcoming) `PATCH /api/mono/transactions/:id/
   * category` endpoint and the data-migrations. Once `true`, subsequent
   * webhook deliveries (e.g. Monobank refunds with a different MCC) do not
   * silently undo the user's manual correction.
   */
  categoryOverridden: z.boolean(),
  source: MonoTransactionSourceSchema,
  receivedAt: z.string().min(1),
});
export type MonoTransactionDto = z.infer<typeof MonoTransactionDtoSchema>;

/**
 * Cursor-paginated response from `GET /api/mono/transactions`. Server
 * returns up to `limit` items (default 50, max 200) ordered by
 * `(time DESC, monoTxId DESC)`; `nextCursor` is non-null when more rows
 * are available and is consumed by `fetchAllMonoTransactions`.
 */
export const MonoTransactionsPageSchema = z.object({
  data: z.array(MonoTransactionDtoSchema),
  nextCursor: z.string().nullable(),
});
export type MonoTransactionsPage = z.infer<typeof MonoTransactionsPageSchema>;

/**
 * Response of `GET /api/mono/sync-state`. UI uses this to decide whether
 * to render the "Connect Monobank" form or the connected dashboard.
 * `webhookActive=true` means the row is `active` and Monobank has
 * confirmed registration (`webhook_registered_at != NULL`).
 */
export const MonoSyncStateSchema = z.object({
  status: MonoConnectionStatusSchema,
  webhookActive: z.boolean(),
  lastEventAt: z.string().nullable(),
  lastBackfillAt: z.string().nullable(),
  accountsCount: z.number().int().nonnegative(),
});
export type MonoSyncState = z.infer<typeof MonoSyncStateSchema>;

/**
 * Response of `POST /api/mono/connect`. After token validation +
 * webhook registration with Monobank succeeded, the connection is
 * persisted as `active` and the response carries the count of accounts
 * upserted from `client-info` (used by UI to confirm "X accounts
 * connected").
 */
export const MonoConnectResponseSchema = z.object({
  status: z.literal("active"),
  accountsCount: z.number().int().nonnegative(),
});
export type MonoConnectResponse = z.infer<typeof MonoConnectResponseSchema>;

/**
 * Response of `POST /api/mono/disconnect`. Server best-efforts deregister
 * the webhook with Monobank, then deletes `mono_connection`. The `ok:
 * true` envelope mirrors the rest of the boolean-result write endpoints
 * in this codebase.
 */
export const MonoDisconnectResponseSchema = z.object({
  ok: z.literal(true),
});
export type MonoDisconnectResponse = z.infer<
  typeof MonoDisconnectResponseSchema
>;

/**
 * Response of `POST /api/mono/backfill`. The handler returns `started`
 * synchronously and runs the per-account 31-day statement pull in the
 * background; clients poll `sync-state.lastBackfillAt` to detect
 * completion.
 */
export const MonoBackfillResponseSchema = z.object({
  status: z.literal("started"),
  accountsCount: z.number().int().nonnegative(),
});
export type MonoBackfillResponse = z.infer<typeof MonoBackfillResponseSchema>;

/**
 * Response of `GET /api/mono/backfill-progress`. Reports the current state
 * of the per-user backfill job started by `POST /api/mono/backfill`.
 *
 * - `idle`: no backfill ever started (or the in-memory record was cleared
 *   by a server restart). Counters are zero, `startedAt`/`completedAt` are null.
 * - `running`: backfill is in flight. UI should poll while in this state.
 * - `completed`: last backfill finished successfully. `completedAt` is set
 *   and `accountsProcessed === accountsTotal`. UI may show a toast then drop
 *   the polling.
 * - `failed`: last backfill threw. `lastError` carries a short message.
 *
 * Numbers are coerced from internal counters via `Number()` per Hard Rule #1
 * even though they originate as JS numbers, to keep the contract explicit.
 */
export const MonoBackfillProgressSchema = z.object({
  status: z.enum(["idle", "running", "completed", "failed"]),
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  accountsTotal: z.number().int().nonnegative(),
  accountsProcessed: z.number().int().nonnegative(),
  currentAccountId: z.string().nullable(),
  transactionsProcessed: z.number().int().nonnegative(),
  lastError: z.string().nullable(),
});
export type MonoBackfillProgress = z.infer<typeof MonoBackfillProgressSchema>;

// ────────────────────── Waitlist (Phase 0 monetization rails) ───────────────
// Простий sign-up для майбутнього Pro-тіру. Валідується тут, щоб і клієнт
// (через `@sergeant/api-client`) і сервер (через `validateBody`) мали одне
// джерело правди. Tier-и навмисно матчать `docs/launch/01-monetization-and-pricing.md`.

export const WaitlistTierSchema = z.enum(["free", "plus", "pro", "unsure"]);
export type WaitlistTier = z.infer<typeof WaitlistTierSchema>;

export const WaitlistSourceSchema = z.enum([
  "pricing_page",
  "paywall",
  "settings",
  "onboarding",
]);
export type WaitlistSource = z.infer<typeof WaitlistSourceSchema>;

export const WaitlistSubmitSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Некоректна email-адреса")
    .max(254),
  tier_interest: WaitlistTierSchema.default("unsure"),
  source: WaitlistSourceSchema.default("pricing_page"),
  // ISO-639-1, два символи: "uk", "en". Опційний — UI може не знати.
  locale: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z]{2}$/, "locale має бути 2-літерний ISO-639-1")
    .optional(),
});
export type WaitlistSubmitPayload = z.infer<typeof WaitlistSubmitSchema>;

export const WaitlistSubmitResponseSchema = z.object({
  ok: z.literal(true),
  // `created` — true якщо це новий запис; false якщо email уже був у списку.
  // Дозволяє UI показати «ми памʼятаємо твій інтерес» замість «дякуємо що
  // підписався» — без розкриття конкретики.
  created: z.boolean(),
});
export type WaitlistSubmitResponse = z.infer<
  typeof WaitlistSubmitResponseSchema
>;

// ────────────────────── Billing (Stripe checkout MVP) ──────────────────────
// SSOT for authenticated billing endpoints. The server validates request
// bodies with these schemas, and api-client parses responses from the same
// contract.

export const BillingPlanSchema = z.enum(["plus", "pro"]);
export type BillingPlan = z.infer<typeof BillingPlanSchema>;

export const BillingCheckoutRequestSchema = z.object({
  plan: BillingPlanSchema,
});
export type BillingCheckoutRequest = z.infer<
  typeof BillingCheckoutRequestSchema
>;

export const BillingCheckoutResponseSchema = z.object({
  ok: z.literal(true),
  mode: z.enum(["test", "live"]),
  sessionId: z.string().min(1),
  url: z.string().url(),
});
export type BillingCheckoutResponse = z.infer<
  typeof BillingCheckoutResponseSchema
>;

export const BillingSubscriptionSchema = z.object({
  id: z.number().int().positive().nullable(),
  provider: z.literal("stripe").nullable(),
  plan: BillingPlanSchema.nullable(),
  status: z.string().nullable(),
  active: z.boolean(),
  currentPeriodEnd: z.string().nullable(),
});
export type BillingSubscription = z.infer<typeof BillingSubscriptionSchema>;

export const BillingStatusResponseSchema = z.object({
  subscription: BillingSubscriptionSchema,
});
export type BillingStatusResponse = z.infer<typeof BillingStatusResponseSchema>;

// ────────────────────── Transcribe (Groq Whisper proxy) ─────────────────────
// `POST /api/transcribe` приймає сире audio-тіло (Content-Type: `audio/*`),
// query визначає мову/prompt. Schema тут — SSOT і для server-side
// `validateQuery`, і для `@sergeant/api-client` (типізує query + response).

const TRANSCRIBE_MAX_PROMPT_LENGTH = 1024;

export const TranscribeQuerySchema = z.object({
  language: z
    .string()
    .trim()
    .min(2)
    .max(8)
    .optional()
    .describe("ISO-код мови, напр. uk або en. Якщо порожньо — auto-detect."),
  prompt: z
    .string()
    .trim()
    .max(TRANSCRIBE_MAX_PROMPT_LENGTH)
    .optional()
    .describe("Доменна підказка (списки вправ, продуктів тощо)."),
});
export type TranscribeQuery = z.infer<typeof TranscribeQuerySchema>;

export const TranscribeResponseSchema = z.object({
  text: z.string(),
  durationSec: z.number().nonnegative(),
  model: z.string(),
});
export type TranscribeResponse = z.infer<typeof TranscribeResponseSchema>;

// ────────────────────── Web Vitals ingestion ────────────────────────────────
// `POST /api/metrics/web-vitals` — анонімний beacon-endpoint, приймає батч
// Core Web Vitals замірів. Server завжди відповідає 204 No Content.

export const WebVitalsMetricNameSchema = z.enum([
  "LCP",
  "INP",
  "FCP",
  "TTFB",
  "CLS",
]);
export type WebVitalsMetricName = z.infer<typeof WebVitalsMetricNameSchema>;

export const WebVitalsMetricRatingSchema = z.enum([
  "good",
  "needs-improvement",
  "poor",
]);
export type WebVitalsMetricRating = z.infer<typeof WebVitalsMetricRatingSchema>;

// CLS — безрозмірний (0..1+, 0.25 = "poor"). Таймінги (LCP/INP/FCP/TTFB) —
// мс, upper-bound 120_000 (2 хв — будь-що більше це зламаний клієнтський
// таймер). Окремий upper-bound для CLS не дає анонімному endpoint-у інфлейтити
// `web_vitals_cls_sum`, що зробило б `avg = _sum / _count` беззмістовним.
//
// Розбито на дискримінований union по `name` замість `.refine()` так, щоб межі
// `value` для CLS (≤10) і таймінгів (≤120_000) переживали серіалізацію в
// OpenAPI: кастомні `.refine()`-предикати у `docs/api/openapi.json` не
// потрапляють, і генерований контракт мовчки втрачав би верхні межі.
const WebVitalsClsMetricSchema = z.object({
  name: z.literal("CLS"),
  value: z.number().finite().min(0).max(10),
  rating: WebVitalsMetricRatingSchema,
});

const WebVitalsTimingMetricSchema = z.object({
  name: z.enum(["LCP", "INP", "FCP", "TTFB"]),
  value: z.number().finite().min(0).max(120_000),
  rating: WebVitalsMetricRatingSchema,
});

export const WebVitalsMetricSchema = z.discriminatedUnion("name", [
  WebVitalsClsMetricSchema,
  WebVitalsTimingMetricSchema,
]);
export type WebVitalsMetric = z.infer<typeof WebVitalsMetricSchema>;

export const WebVitalsPayloadSchema = z.object({
  metrics: z.array(WebVitalsMetricSchema).min(1).max(10),
});
export type WebVitalsPayload = z.infer<typeof WebVitalsPayloadSchema>;

export { z };
