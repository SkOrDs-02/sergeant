import { z } from "zod";
import type { ZodOpenApiPathsObject } from "zod-openapi";

import { namedSchemas } from "./registry";

/**
 * Каталог public-API endpoint-ів Sergeant.
 *
 * Single source of truth для `docs/api/openapi.json`. Mapping витягнуто
 * статично зі списку `validateBody(...)` викликів у
 * `apps/server/src/modules/**` + `routes/*.ts`-роутингу. Якщо додаєш новий
 * route — реєструй його тут і у server-route файлі одночасно. CI-freshness
 * gate (`.github/workflows/openapi-freshness.yml`) падає, якщо
 * `docs/api/openapi.json` не співпадає з результатом генератора.
 *
 * Auth-стратегії:
 *   - `cookieAuth` — better-auth session cookie (web).
 *   - `bearerAuth` — better-auth bearer token (mobile, Expo).
 */

const cookieOrBearer: Array<Record<string, string[]>> = [
  { cookieAuth: [] },
  { bearerAuth: [] },
];

/** Стандартна 400-відповідь для validateBody. */
const validationError = {
  description: "Bad request — payload не пройшов zod-валідацію.",
  content: {
    "application/json": { schema: namedSchemas.ApiError },
  },
} as const;

const unauthorized = {
  description: "Unauthorized — потрібна активна сесія.",
  content: {
    "application/json": { schema: namedSchemas.ApiError },
  },
} as const;

/**
 * Більшість endpoint-ів повертають довільний JSON (поки що response-схеми
 * є лише на частині — Phase 2). Документуємо як `200 OK` з `object` shape.
 */
const okEmpty = {
  description: "OK",
  content: {
    "application/json": {
      schema: z.object({}).loose(),
    },
  },
} as const;

export const paths: ZodOpenApiPathsObject = {
  // ────────────────────── /api/me ──────────────────────
  "/api/me": {
    get: {
      summary: "Поточний публічний профіль користувача",
      tags: ["auth"],
      security: cookieOrBearer,
      responses: {
        "200": {
          description: "User profile",
          content: {
            "application/json": { schema: namedSchemas.MeResponse },
          },
        },
        "401": unauthorized,
      },
    },
  },

  // ────────────────────── /api/me/profile ──────────────────────
  // Write-through сховище профілю/біометрії (migration 115) — НЕ oplog-sync.
  "/api/me/profile": {
    get: {
      summary: "Профіль/біометрія користувача (write-through блоб)",
      tags: ["auth"],
      security: cookieOrBearer,
      responses: {
        "200": {
          description:
            "Profile blob; { profile: {}, updatedAt: null } коли рядка ще немає.",
          content: {
            "application/json": { schema: namedSchemas.UserProfileResponse },
          },
        },
        "401": unauthorized,
      },
    },
    put: {
      summary: "Перезаписати профіль/біометрію (upsert по user_id)",
      tags: ["auth"],
      security: cookieOrBearer,
      requestBody: {
        // OpenAPI 3 defaults `requestBody.required` to `false` when omitted
        // — misleading here since `UserProfilePutBodySchema` requires a
        // `profile` field with no default; a client generated straight off
        // the spec could omit the body entirely and only find out it's
        // mandatory from the 400 (CodeRabbit PR #627 review).
        required: true,
        content: {
          "application/json": { schema: namedSchemas.UserProfilePutBody },
        },
      },
      responses: {
        "200": {
          description: "Оновлений profile blob.",
          content: {
            "application/json": { schema: namedSchemas.UserProfileResponse },
          },
        },
        "400": validationError,
        "401": unauthorized,
      },
    },
  },

  // ────────────────────── /api/chat ──────────────────────
  "/api/chat": {
    post: {
      summary: "Anthropic-чат: streaming SSE або JSON",
      tags: ["chat"],
      security: cookieOrBearer,
      requestBody: {
        content: {
          "application/json": { schema: namedSchemas.ChatRequest },
        },
      },
      responses: {
        "200": okEmpty,
        "400": validationError,
        "401": unauthorized,
      },
    },
  },
  "/api/chat/usage": {
    get: {
      summary: "Денний Free-tier ліміт AI-чату (PR-42 chat counter)",
      tags: ["chat"],
      security: cookieOrBearer,
      responses: {
        "200": {
          description:
            "Плюс/Pro → limit/remaining=null (unlimited); Free → поточний денний рахунок.",
          content: {
            "application/json": { schema: namedSchemas.ChatUsageResponse },
          },
        },
        "401": unauthorized,
      },
    },
  },

  // ────────────────────── /api/ai-memory/* ──────────────────────
  "/api/ai-memory": {
    delete: {
      summary: "Очистити серверну памʼять ШІ поточного користувача.",
      tags: ["ai-memory"],
      security: cookieOrBearer,
      responses: {
        "200": {
          description: "Памʼять очищено.",
          content: {
            "application/json": {
              schema: namedSchemas.AiMemoryClearResponse,
            },
          },
        },
        "401": unauthorized,
      },
    },
  },
  "/api/ai-memory/list": {
    get: {
      summary: "Список збережених фактів AI-памʼяті поточного користувача.",
      tags: ["ai-memory"],
      security: cookieOrBearer,
      parameters: [
        {
          name: "limit",
          in: "query",
          required: false,
          schema: { type: "integer", minimum: 1, maximum: 100, default: 20 },
          description: "Розмір сторінки.",
        },
        {
          name: "cursor",
          in: "query",
          required: false,
          schema: { type: "integer", minimum: 1 },
          description:
            "Keyset-курсор: `nextCursor` попередньої сторінки (повертає рядки з меншим id).",
        },
      ],
      responses: {
        "200": {
          description: "Сторінка фактів (масив може бути порожнім).",
          content: {
            "application/json": {
              schema: namedSchemas.AiMemoryListResponse,
            },
          },
        },
        "400": validationError,
        "401": unauthorized,
      },
    },
  },
  "/api/ai-memory/{id}": {
    delete: {
      summary: "Видалити один факт AI-памʼяті. Назавжди, без відновлення.",
      tags: ["ai-memory"],
      security: cookieOrBearer,
      parameters: [
        {
          name: "id",
          in: "path",
          required: true,
          schema: { type: "integer", minimum: 1 },
          description: "`ai_memories.id` з відповіді `/api/ai-memory/list`.",
        },
      ],
      responses: {
        "200": {
          description:
            "Ідемпотентний успіх. `deleted:false` — рядка вже не було.",
          content: {
            "application/json": {
              schema: namedSchemas.AiMemoryDeleteResponse,
            },
          },
        },
        "400": validationError,
        "401": unauthorized,
      },
    },
  },
  "/api/ai-memory/recall": {
    post: {
      summary:
        "Semantic-пошук у ai_memories за query (Voyage embed → pgvector ANN).",
      tags: ["ai-memory"],
      security: cookieOrBearer,
      requestBody: {
        content: {
          "application/json": {
            schema: namedSchemas.RecallMemoryRequest,
          },
        },
      },
      responses: {
        "200": {
          description: "Recall hits (масив може бути порожнім).",
          content: {
            "application/json": {
              schema: namedSchemas.RecallMemoryResponse,
            },
          },
        },
        "400": validationError,
        "401": unauthorized,
        "503": {
          description:
            "AI memory вимкнено (`AI_MEMORY_ENABLED=false`) або провайдер ембеддингів недоступний.",
          content: {
            "application/json": { schema: namedSchemas.ApiError },
          },
        },
      },
    },
  },

  // ────────────────────── /api/coach/* ──────────────────────
  "/api/coach/memory": {
    get: {
      summary: "Зчитати збережений coach memory blob",
      tags: ["coach"],
      security: cookieOrBearer,
      responses: { "200": okEmpty, "401": unauthorized },
    },
    post: {
      summary: "Записати coach memory (weekly digest snapshot)",
      tags: ["coach"],
      security: cookieOrBearer,
      requestBody: {
        content: {
          "application/json": { schema: namedSchemas.CoachMemoryPost },
        },
      },
      responses: {
        "200": okEmpty,
        "400": validationError,
        "401": unauthorized,
      },
    },
  },
  "/api/coach/insight": {
    post: {
      summary:
        "Згенерувати coach insight (Anthropic) на основі snapshot + memory",
      tags: ["coach"],
      security: cookieOrBearer,
      requestBody: {
        content: {
          "application/json": { schema: namedSchemas.CoachInsight },
        },
      },
      responses: {
        "200": okEmpty,
        "400": validationError,
        "401": unauthorized,
      },
    },
  },

  // ────────────────────── /api/weekly-digest ──────────────────────
  "/api/weekly-digest": {
    post: {
      summary: "Згенерувати тижневий digest по агрегатах модулів",
      tags: ["digest"],
      security: cookieOrBearer,
      requestBody: {
        content: {
          "application/json": { schema: namedSchemas.WeeklyDigest },
        },
      },
      responses: {
        "200": okEmpty,
        "400": validationError,
        "401": unauthorized,
      },
    },
  },

  // ────────────────────── /api/nutrition/* ──────────────────────
  "/api/nutrition/analyze-photo": {
    post: {
      summary: "Аналіз фото страви: КБЖВ + ingredient-список",
      tags: ["nutrition"],
      security: cookieOrBearer,
      requestBody: {
        content: {
          "application/json": { schema: namedSchemas.AnalyzePhoto },
        },
      },
      responses: {
        "200": okEmpty,
        "400": validationError,
        "401": unauthorized,
      },
    },
  },
  "/api/nutrition/refine-photo": {
    post: {
      summary: "Уточнити аналіз фото (Q&A + portion override)",
      tags: ["nutrition"],
      security: cookieOrBearer,
      requestBody: {
        content: {
          "application/json": { schema: namedSchemas.RefinePhoto },
        },
      },
      responses: {
        "200": okEmpty,
        "400": validationError,
        "401": unauthorized,
      },
    },
  },
  "/api/nutrition/parse-pantry": {
    post: {
      summary: "Розпарсити вільнорядковий список комори у структурний",
      tags: ["nutrition"],
      security: cookieOrBearer,
      requestBody: {
        content: {
          "application/json": { schema: namedSchemas.ParsePantry },
        },
      },
      responses: {
        "200": okEmpty,
        "400": validationError,
        "401": unauthorized,
      },
    },
  },
  "/api/nutrition/recommend-recipes": {
    post: {
      summary: "Рекомендувати рецепти за коморою + preferences",
      tags: ["nutrition"],
      security: cookieOrBearer,
      requestBody: {
        content: {
          "application/json": { schema: namedSchemas.RecommendRecipes },
        },
      },
      responses: {
        "200": okEmpty,
        "400": validationError,
        "401": unauthorized,
      },
    },
  },
  "/api/nutrition/day-plan": {
    post: {
      summary: "Згенерувати/перегенерувати план прийомів їжі на день",
      tags: ["nutrition"],
      security: cookieOrBearer,
      requestBody: {
        content: { "application/json": { schema: namedSchemas.DayPlan } },
      },
      responses: {
        "200": okEmpty,
        "400": validationError,
        "401": unauthorized,
      },
    },
  },
  "/api/nutrition/week-plan": {
    post: {
      summary: "Згенерувати тижневий план меню",
      tags: ["nutrition"],
      security: cookieOrBearer,
      requestBody: {
        content: { "application/json": { schema: namedSchemas.WeekPlan } },
      },
      responses: {
        "200": okEmpty,
        "400": validationError,
        "401": unauthorized,
      },
    },
  },
  "/api/nutrition/shopping-list": {
    post: {
      summary: "Зібрати shopping-list з рецептів + week-plan",
      tags: ["nutrition"],
      security: cookieOrBearer,
      requestBody: {
        content: {
          "application/json": { schema: namedSchemas.ShoppingList },
        },
      },
      responses: {
        "200": okEmpty,
        "400": validationError,
        "401": unauthorized,
      },
    },
  },
  "/api/nutrition/backup-upload": {
    post: {
      summary: "Завантажити зашифрований backup nutrition-blob",
      tags: ["nutrition"],
      security: cookieOrBearer,
      requestBody: {
        content: {
          "application/json": { schema: namedSchemas.BackupUpload },
        },
      },
      responses: {
        "200": okEmpty,
        "400": validationError,
        "401": unauthorized,
      },
    },
  },
  "/api/nutrition/backup-download": {
    post: {
      summary: "Отримати останній зашифрований backup nutrition-blob",
      description:
        "Роут під `requireSession()` — потрібна активна сесія або " +
        "Bearer-токен. Storage key bind-иться до `req.user.id` через " +
        "HMAC-SHA256(`NUTRITION_BACKUP_KEY_SECRET`, `userId|x-token`), " +
        "тому `x-token` лише namespace-ить кілька бекапів одного юзера " +
        "(наприклад, по пристроях) і НЕ використовується для авторизації. " +
        "Повертає 404, якщо для пари (userId, x-token) бекапів ще немає.",
      tags: ["nutrition"],
      security: cookieOrBearer,
      requestParams: {
        // `x-token` формує namespace для бекап-файлу в межах одного юзера
        // (див. `apps/server/src/lib/backupKey.ts:safeBackupKeyFromToken`).
        // Без цього хедера в контракті generated-клієнти і люди-читачі не можуть
        // виявити який вхід потрібен для отримання бекапу.
        header: z.object({
          "x-token": z
            .string()
            .min(1)
            .describe(
              "Опаковий namespace-токен для розрізнення кількох бекапів " +
                "одного юзера (наприклад, per device).",
            ),
        }),
      },
      responses: {
        "200": okEmpty,
        "401": unauthorized,
        "404": {
          description: "Backup для наданого x-token не знайдено.",
          content: {
            "application/json": { schema: namedSchemas.ApiError },
          },
        },
      },
    },
  },

  // ────────────────────── /api/sync/* (v1 sunset) ──────────────────────
  // Removed in PR #076 (storage-roadmap Stage 13). The legacy v1 endpoints
  // `/api/sync/{push,pull,pull-all,push-all}` return 410 Gone since
  // 2026-05-06 (T₀ in ADR-0047) — advertising them in the OpenAPI spec
  // misled api-client codegen + dashboards. Final route + middleware
  // removal is tracked in Initiative 0003 Phase 7.

  // ────────────────────── /api/push/* ──────────────────────
  "/api/push/vapid-public": {
    get: {
      summary: "Публічний VAPID-ключ для web-push subscribe",
      tags: ["push"],
      responses: { "200": okEmpty },
    },
  },
  "/api/push/register": {
    post: {
      summary: "Зареєструвати push-пристрій (web/ios/android)",
      tags: ["push"],
      security: cookieOrBearer,
      requestBody: {
        content: {
          "application/json": { schema: namedSchemas.PushRegister },
        },
      },
      responses: {
        "200": okEmpty,
        "400": validationError,
        "401": unauthorized,
      },
    },
  },
  "/api/push/unregister": {
    post: {
      summary: "Зняти push-пристрій",
      tags: ["push"],
      security: cookieOrBearer,
      requestBody: {
        content: {
          "application/json": { schema: namedSchemas.PushUnregister },
        },
      },
      responses: {
        "200": okEmpty,
        "400": validationError,
        "401": unauthorized,
      },
    },
  },
  "/api/push/subscribe": {
    post: {
      summary: "Web-push subscribe (legacy alias для /push/register web)",
      tags: ["push"],
      security: cookieOrBearer,
      requestBody: {
        content: {
          "application/json": { schema: namedSchemas.PushSubscribe },
        },
      },
      responses: {
        "200": okEmpty,
        "400": validationError,
        "401": unauthorized,
      },
    },
    delete: {
      summary: "Web-push unsubscribe (legacy alias для /push/unregister web)",
      tags: ["push"],
      security: cookieOrBearer,
      requestBody: {
        content: {
          "application/json": { schema: namedSchemas.PushUnsubscribe },
        },
      },
      responses: {
        "200": okEmpty,
        "400": validationError,
        "401": unauthorized,
      },
    },
  },
  "/api/push/send": {
    post: {
      summary: "Internal-only fan-out push (worker → cron job)",
      tags: ["push"],
      requestBody: {
        content: { "application/json": { schema: namedSchemas.PushSend } },
      },
      responses: {
        "200": {
          description: "Send summary",
          content: {
            "application/json": { schema: namedSchemas.PushSendSummary },
          },
        },
        "400": validationError,
      },
    },
  },
  "/api/push/test": {
    post: {
      summary: "Надіслати тестовий push поточному користувачеві",
      tags: ["push"],
      security: cookieOrBearer,
      requestBody: {
        content: {
          "application/json": { schema: namedSchemas.PushTestRequest },
        },
      },
      responses: {
        "200": {
          description: "Send summary",
          content: {
            "application/json": { schema: namedSchemas.PushTestResponse },
          },
        },
        "400": validationError,
        "401": unauthorized,
      },
    },
  },

  // ────────────────────── Bank proxies ──────────────────────
  // Monobank moved to a server-side webhook flow in roadmap-A —
  // `/api/mono/connect`, `/api/mono/transactions` etc. live in their own
  // OpenAPI section below. The legacy `/api/mono` token-passthrough proxy was
  // removed when the polling pipeline was retired.
  // Креденшели ПриватБанку живуть зашифрованими в `privat_connection` і
  // резолвляться за сесією. Раніше вони приходили в заголовках
  // `X-Privat-Id`/`X-Privat-Token`, через що клієнт мусив тримати
  // merchant-токен у браузері, а проксі був анонімним — спека
  // `docs/90-work/planning/specs/beta-security-readiness.md` (F1/F3).
  "/api/privat": {
    get: {
      summary: "PrivatBank API proxy (credentials resolved from session)",
      tags: ["banks"],
      security: cookieOrBearer,
      requestParams: { query: namedSchemas.PrivatQuery },
      responses: {
        "200": okEmpty,
        "400": validationError,
        "401": unauthorized,
      },
    },
  },
  "/api/privat/connect": {
    post: {
      summary: "Store PrivatBank merchant credentials (validated upstream)",
      tags: ["banks"],
      security: cookieOrBearer,
      requestBody: {
        content: {
          "application/json": {
            schema: z.object({
              merchantId: z.string().describe("Merchant ID з Приват24 Бізнес."),
              token: z
                .string()
                .describe(
                  "Merchant-токен. Передається рівно один раз; на сервері зберігається під AES-256-GCM і клієнту вже не повертається.",
                ),
            }),
          },
        },
      },
      responses: {
        "200": okEmpty,
        "400": validationError,
        "401": unauthorized,
      },
    },
  },
  "/api/privat/disconnect": {
    post: {
      summary: "Delete stored PrivatBank credentials",
      tags: ["banks"],
      security: cookieOrBearer,
      responses: { "200": okEmpty, "401": unauthorized },
    },
  },
  "/api/privat/status": {
    get: {
      summary: "PrivatBank connection status (never returns the token)",
      tags: ["banks"],
      security: cookieOrBearer,
      responses: { "200": okEmpty, "401": unauthorized },
    },
  },

  // ────────────────────── Mono webhook integration ──────────────────────
  // C1 — `docs/security/hardening/C1-mono-webhook-secret-in-url.md`.
  // Path-based маршрут — це транспорт, який реально вміє Monobank
  // (`/personal/webhook` приймає лише `webHookUrl`). Header-based маршрут —
  // defense-in-depth для майбутнього edge-proxy; Monobank його не шле.
  "/api/mono/webhook": {
    post: {
      summary: "Mono webhook (X-Mono-Webhook-Secret header — edge-proxy only)",
      tags: ["mono"],
      requestParams: {
        header: z.object({
          "x-mono-webhook-secret": z
            .string()
            .describe(
              "Per-user webhook secret у header-і. Використовується лише коли edge-proxy перекладає path-secret у header; Monobank сам шле через path-маршрут. Не потрапляє в access-логи.",
            ),
        }),
      },
      responses: { "200": okEmpty },
    },
  },
  "/api/mono/webhook/{secret}": {
    post: {
      summary:
        "Mono webhook (per-user secret у URL — транспорт Monobank; secret редагується в логах + ротується 90d, C1)",
      tags: ["mono"],
      requestParams: {
        path: z.object({ secret: z.string() }),
      },
      responses: { "200": okEmpty },
    },
  },
  "/api/mono/connect": {
    post: {
      summary: "Підключити Mono-token та зареєструвати webhook",
      tags: ["mono"],
      security: cookieOrBearer,
      responses: {
        "200": {
          description: "Mono integration активовано.",
          content: {
            "application/json": { schema: namedSchemas.MonoConnectResponse },
          },
        },
        "401": unauthorized,
      },
    },
  },
  "/api/mono/disconnect": {
    post: {
      summary: "Відключити Mono-token + забути webhook secret",
      tags: ["mono"],
      security: cookieOrBearer,
      responses: {
        "200": {
          description: "Mono integration вимкнено.",
          content: {
            "application/json": { schema: namedSchemas.MonoDisconnectResponse },
          },
        },
        "401": unauthorized,
      },
    },
  },
  "/api/mono/sync-state": {
    get: {
      summary: "Статус Mono-інтеграції + лічильники webhook events",
      tags: ["mono"],
      security: cookieOrBearer,
      responses: {
        "200": {
          description: "Поточний стан синхронізації.",
          content: {
            "application/json": { schema: namedSchemas.MonoSyncState },
          },
        },
        "401": unauthorized,
      },
    },
  },
  "/api/mono/accounts": {
    get: {
      summary: "Список Mono-рахунків поточного користувача",
      tags: ["mono"],
      security: cookieOrBearer,
      responses: {
        "200": {
          description: "Нормалізовані рядки `mono_accounts`.",
          content: {
            "application/json": { schema: namedSchemas.MonoAccountsResponse },
          },
        },
        "401": unauthorized,
      },
    },
  },
  "/api/mono/transactions": {
    get: {
      summary: "Cursor-paginated історія Mono-транзакцій",
      tags: ["mono"],
      security: cookieOrBearer,
      requestParams: { query: namedSchemas.MonoTransactionsQuery },
      responses: {
        "200": {
          description: "Сторінка транзакцій + nextCursor.",
          content: {
            "application/json": { schema: namedSchemas.MonoTransactionsPage },
          },
        },
        "400": validationError,
        "401": unauthorized,
      },
    },
  },
  "/api/mono/backfill": {
    post: {
      summary: "Бекфіл історії транзакцій у Mono integration",
      tags: ["mono"],
      security: cookieOrBearer,
      responses: {
        "200": {
          description:
            "Бекфіл запущено синхронно — виконується в фоновому режимі.",
          content: {
            "application/json": { schema: namedSchemas.MonoBackfillResponse },
          },
        },
        "401": unauthorized,
      },
    },
  },
  "/api/mono/backfill-progress": {
    get: {
      summary: "Поточний стан per-user backfill job-а (для UI індикатора)",
      tags: ["mono"],
      security: cookieOrBearer,
      responses: {
        "200": {
          description:
            "Snapshot поточного стану backfill-у (idle/running/completed/failed).",
          content: {
            "application/json": { schema: namedSchemas.MonoBackfillProgress },
          },
        },
        "401": unauthorized,
      },
    },
  },

  // ────────────────────── Чек-скан v1 (/api/finyk/receipts/*) ───────────────
  // Спека: `docs/90-work/planning/specs/receipt-scan.md` § API-контракт.
  // 413/415 на `/analyze` — НЕ канонічний `ApiError`-envelope (жодного
  // `error`/`message`/`requestId`) — сервер віддає
  // `{code, detail, declared_mime?, detected_mime?}` напряму з
  // `validateImageBase64()` (`apps/server/src/lib/imageMagic.ts`), без
  // `.parse()` проти shared-схеми. Документуємо як `ApiError` (той самий
  // placeholder, що вже прийнятий для `/api/transcribe` 413/415, теж
  // image/audio-magic-byte guard) — точна форма живе в
  // `@sergeant/api-client` (`ImageValidationErrorBody`, hand-written, не
  // з shared, саме тому що сервер тут нічого не `.parse()`-ить).
  "/api/finyk/receipts/lookup": {
    post: {
      summary: "QR/ДПС lookup чека — draft БЕЗ запису в БД",
      tags: ["finyk"],
      security: cookieOrBearer,
      requestBody: {
        required: true,
        content: {
          "application/json": { schema: namedSchemas.ReceiptLookupRequest },
        },
      },
      responses: {
        "200": {
          description: "Чернетка чека, розпізнана ДПС XML.",
          content: {
            "application/json": { schema: namedSchemas.ReceiptDraftResponse },
          },
        },
        "400": validationError,
        "401": unauthorized,
        "404": {
          description:
            "DPS_RECEIPT_NOT_FOUND — чек ще не зʼявився в реєстрі ДПС.",
          content: { "application/json": { schema: namedSchemas.ApiError } },
        },
        "502": {
          description: "DPS_UPSTREAM_ERROR | DPS_PARSE_ERROR.",
          content: { "application/json": { schema: namedSchemas.ApiError } },
        },
        "503": {
          description: "DPS_TOKEN_MISSING | DPS_AUTH_ERROR.",
          content: { "application/json": { schema: namedSchemas.ApiError } },
        },
      },
    },
  },
  "/api/finyk/receipts/analyze": {
    post: {
      summary: "Vision-fallback аналіз фото чека — draft БЕЗ запису в БД",
      tags: ["finyk"],
      security: cookieOrBearer,
      requestBody: {
        required: true,
        content: {
          "application/json": { schema: namedSchemas.ReceiptAnalyzeRequest },
        },
      },
      responses: {
        "200": {
          description:
            "Чернетка чека (source:'vision', fiscalNum:null, confidence 0..1).",
          content: {
            "application/json": { schema: namedSchemas.ReceiptDraftResponse },
          },
        },
        "400": validationError,
        "401": unauthorized,
        "413": {
          description:
            "TOO_LARGE — НЕ канонічний ApiError envelope, див. коментар вище.",
          content: { "application/json": { schema: namedSchemas.ApiError } },
        },
        "415": {
          description:
            "INVALID_BASE64 | TRUNCATED | MAGIC_MISMATCH — НЕ канонічний ApiError envelope, див. коментар вище.",
          content: { "application/json": { schema: namedSchemas.ApiError } },
        },
        "503": {
          description:
            "RECEIPT_VISION_UNAVAILABLE — жоден vision-провайдер не сконфігурований.",
          content: { "application/json": { schema: namedSchemas.ApiError } },
        },
      },
    },
  },
  "/api/finyk/receipts": {
    post: {
      summary: "Зберегти чек (draft + category)",
      description:
        "Ідемпотентний: `201` — новий чек, `200` + `alreadyExists:true` — " +
        "повторний скан (той самий fiscal_num, або той самий `clientScanId` " +
        "для vision-чеків без fiscal_num).",
      tags: ["finyk"],
      security: cookieOrBearer,
      requestBody: {
        required: true,
        content: {
          "application/json": { schema: namedSchemas.ReceiptSaveRequest },
        },
      },
      responses: {
        "200": {
          description: "alreadyExists:true — ідемпотентний повторний скан.",
          content: {
            "application/json": { schema: namedSchemas.ReceiptSaveResponse },
          },
        },
        "201": {
          description: "Новий чек створено.",
          content: {
            "application/json": { schema: namedSchemas.ReceiptSaveResponse },
          },
        },
        "400": validationError,
        "401": unauthorized,
      },
    },
  },
  "/api/finyk/receipts/{id}": {
    get: {
      summary: "Чек з позиціями для розгортки транзакції",
      tags: ["finyk"],
      security: cookieOrBearer,
      parameters: [
        {
          name: "id",
          in: "path",
          required: true,
          schema: { type: "integer", minimum: 1 },
          description: "`receipts.id`.",
        },
      ],
      responses: {
        "200": {
          description: "Чек з items[] + link (mono|manual|null).",
          content: {
            "application/json": { schema: namedSchemas.ReceiptGetResponse },
          },
        },
        "401": unauthorized,
        "404": {
          description: "Чужий чек АБО неіснуючий id (сервер не розрізняє).",
          content: { "application/json": { schema: namedSchemas.ApiError } },
        },
      },
    },
  },

  // ────────────────────── Масове ведення (/api/finyk/import/*) ──────────────
  // Спека: `docs/90-work/planning/specs/receipt-scan.md` § Фаза 2.
  "/api/finyk/import/screenshot/analyze": {
    post: {
      summary: "Vision-розпізнавання скріна банкінгу — draft БЕЗ запису в БД",
      tags: ["finyk"],
      security: cookieOrBearer,
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: namedSchemas.ImportScreenshotAnalyzeRequest,
          },
        },
      },
      responses: {
        "200": {
          description:
            "docType 'bank_screenshot'|'receipt'|'other' + rows[] (rows:[] для receipt/other).",
          content: {
            "application/json": {
              schema: namedSchemas.ImportScreenshotAnalyzeResponse,
            },
          },
        },
        "400": validationError,
        "401": unauthorized,
        "413": {
          description:
            "TOO_LARGE — НЕ канонічний ApiError envelope (той самий guard, що receipts/analyze).",
          content: { "application/json": { schema: namedSchemas.ApiError } },
        },
        "415": {
          description:
            "INVALID_BASE64 | TRUNCATED | MAGIC_MISMATCH — НЕ канонічний ApiError envelope.",
          content: { "application/json": { schema: namedSchemas.ApiError } },
        },
        "503": {
          description:
            "IMPORT_VISION_UNAVAILABLE — жоден vision-провайдер не сконфігурований.",
          content: { "application/json": { schema: namedSchemas.ApiError } },
        },
      },
    },
  },
  "/api/finyk/import/statement/preview": {
    post: {
      summary: "CSV-only парсинг банківської виписки — БЕЗ запису в БД",
      description:
        "Discriminated за `needsMapping`: `false` → `profile`+`rows`+`skipped`; " +
        "`true` → `headers`+`sampleRows` для ручного column-mapper.",
      tags: ["finyk"],
      security: cookieOrBearer,
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: namedSchemas.ImportStatementPreviewRequest,
          },
        },
      },
      responses: {
        "200": {
          description:
            "Автопрофіль (mono/privat24/custom) або needsMapping:true.",
          content: {
            "application/json": {
              schema: namedSchemas.ImportStatementPreviewResponse,
            },
          },
        },
        "400": validationError,
        "401": unauthorized,
      },
    },
  },
  "/api/finyk/import/commit": {
    post: {
      summary: "Commit вибраних rows → журнал import_batches + manual expenses",
      tags: ["finyk"],
      security: cookieOrBearer,
      requestBody: {
        required: true,
        content: {
          "application/json": { schema: namedSchemas.ImportCommitRequest },
        },
      },
      responses: {
        "201": {
          description:
            "batchId + created/linked + skipped{monoMatched,duplicate}.",
          content: {
            "application/json": { schema: namedSchemas.ImportCommitResponse },
          },
        },
        "400": validationError,
        "401": unauthorized,
      },
    },
  },
  "/api/finyk/import/batches/{id}": {
    get: {
      summary: "Статус/підсумок батчу імпорту",
      tags: ["finyk"],
      security: cookieOrBearer,
      parameters: [
        {
          name: "id",
          in: "path",
          required: true,
          schema: { type: "integer", minimum: 1 },
          description: "`import_batches.id`.",
        },
      ],
      responses: {
        "200": {
          description: "Batch зі статусом completed|undone + лічильники.",
          content: {
            "application/json": { schema: namedSchemas.ImportBatchGetResponse },
          },
        },
        "401": unauthorized,
        "404": {
          description: "Чужий батч АБО неіснуючий id (сервер не розрізняє).",
          content: { "application/json": { schema: namedSchemas.ApiError } },
        },
      },
    },
    delete: {
      summary: "Undo батчу — tombstone кожного created row",
      description:
        "Ідемпотентний: повторний виклик повертає `tombstoned:0`, той самий `200`.",
      tags: ["finyk"],
      security: cookieOrBearer,
      parameters: [
        {
          name: "id",
          in: "path",
          required: true,
          schema: { type: "integer", minimum: 1 },
          description: "`import_batches.id`.",
        },
      ],
      responses: {
        "200": {
          description:
            "Batch зі статусом 'undone' + tombstoned (0 на повторний виклик).",
          content: {
            "application/json": {
              schema: namedSchemas.ImportBatchUndoResponse,
            },
          },
        },
        "401": unauthorized,
        "404": {
          description: "Чужий батч АБО неіснуючий id (сервер не розрізняє).",
          content: { "application/json": { schema: namedSchemas.ApiError } },
        },
      },
    },
  },

  // ────────────────────── Waitlist (Phase 0 monetization) ───────────────────
  // Сервер монтує обидва префікси (`/api/waitlist` + `/api/v1/waitlist`), щоб
  // pricing-page CTA працював незалежно від стадії API-versioning shim-у.
  // Обидва шляхи документуємо однаково — щоб консюмери бачили спеку що б вони
  // не кликнули.
  "/api/waitlist": {
    post: {
      summary: "Sign-up на waitlist для майбутнього Pro-тіру (анонімний)",
      tags: ["monetization"],
      requestBody: {
        content: {
          "application/json": { schema: namedSchemas.WaitlistSubmit },
        },
      },
      responses: {
        "200": {
          description:
            "Submitted (created=true) або уже був у списку (created=false)",
          content: {
            "application/json": { schema: namedSchemas.WaitlistSubmitResponse },
          },
        },
        "400": validationError,
        "429": {
          description: "Too many requests — rate-limit перевищено.",
          content: {
            "application/json": { schema: namedSchemas.ApiError },
          },
        },
      },
    },
  },
  "/api/v1/waitlist": {
    post: {
      summary:
        "Sign-up на waitlist для майбутнього Pro-тіру (v1 alias для /api/waitlist)",
      tags: ["monetization"],
      requestBody: {
        content: {
          "application/json": { schema: namedSchemas.WaitlistSubmit },
        },
      },
      responses: {
        "200": {
          description:
            "Submitted (created=true) або уже був у списку (created=false)",
          content: {
            "application/json": { schema: namedSchemas.WaitlistSubmitResponse },
          },
        },
        "400": validationError,
        "429": {
          description: "Too many requests — rate-limit перевищено.",
          content: {
            "application/json": { schema: namedSchemas.ApiError },
          },
        },
      },
    },
  },

  // ────────────────────── In-app feedback ───────────────────────────────────
  // Головний багрепорт-канал закритої бети. Анонімний, як і waitlist: вимагати
  // акаунт саме від людини, яка прийшла поскаржитись, — найгірший момент для
  // барʼєра. Обидва префікси документуємо однаково (сервер монтує обидва).
  "/api/feedback": {
    post: {
      summary: "Надіслати in-app фідбек (анонімний)",
      tags: ["feedback"],
      requestBody: {
        content: {
          "application/json": { schema: namedSchemas.FeedbackSubmit },
        },
      },
      responses: {
        "200": {
          description: "Збережено — `id` рядка у `feedback_entries`.",
          content: {
            "application/json": { schema: namedSchemas.FeedbackSubmitResponse },
          },
        },
        "400": validationError,
        "429": {
          description: "Too many requests — rate-limit перевищено.",
          content: {
            "application/json": { schema: namedSchemas.ApiError },
          },
        },
      },
    },
  },
  "/api/v1/feedback": {
    post: {
      summary: "Надіслати in-app фідбек (v1 alias для /api/feedback)",
      tags: ["feedback"],
      requestBody: {
        content: {
          "application/json": { schema: namedSchemas.FeedbackSubmit },
        },
      },
      responses: {
        "200": {
          description: "Збережено — `id` рядка у `feedback_entries`.",
          content: {
            "application/json": { schema: namedSchemas.FeedbackSubmitResponse },
          },
        },
        "400": validationError,
        "429": {
          description: "Too many requests — rate-limit перевищено.",
          content: {
            "application/json": { schema: namedSchemas.ApiError },
          },
        },
      },
    },
  },

  // ────────────────────── Billing (Stripe checkout MVP) ─────────────────────
  "/api/billing/checkout": {
    post: {
      summary: "Створити Stripe Checkout session для Plus/Pro",
      tags: ["monetization"],
      security: cookieOrBearer,
      requestBody: {
        content: {
          "application/json": { schema: namedSchemas.BillingCheckoutRequest },
        },
      },
      responses: {
        "200": {
          description: "Checkout session ready; client redirects to `url`.",
          content: {
            "application/json": {
              schema: namedSchemas.BillingCheckoutResponse,
            },
          },
        },
        "400": validationError,
        "401": unauthorized,
        "503": {
          description: "Stripe billing env is not configured.",
          content: {
            "application/json": { schema: namedSchemas.ApiError },
          },
        },
      },
    },
  },
  "/api/billing/status": {
    get: {
      summary: "Поточний Stripe subscription state користувача",
      tags: ["monetization"],
      security: cookieOrBearer,
      responses: {
        "200": {
          description: "Current subscription snapshot.",
          content: {
            "application/json": { schema: namedSchemas.BillingStatusResponse },
          },
        },
        "401": unauthorized,
      },
    },
  },
  "/api/billing/portal": {
    post: {
      summary: "Стартує Stripe Customer Portal session (self-serve billing)",
      description:
        "Створює short-lived redirect URL у Stripe Customer Portal, де користувач " +
        "може скасувати підписку, оновити платіжний метод або змінити план. " +
        "Потребує `provider_customer_id` у `subscriptions` (готується " +
        "checkout-flow-ом + webhook-ом).",
      tags: ["monetization"],
      security: cookieOrBearer,
      responses: {
        "200": {
          description: "Portal session готова; клієнт редіректить на `url`.",
          content: {
            "application/json": {
              schema: namedSchemas.BillingPortalResponse,
            },
          },
        },
        "401": unauthorized,
        "409": {
          description:
            "Користувач не має billing customer record-у (ще не платив).",
          content: {
            "application/json": { schema: namedSchemas.ApiError },
          },
        },
        "503": {
          description: "Stripe billing env is not configured.",
          content: {
            "application/json": { schema: namedSchemas.ApiError },
          },
        },
      },
    },
  },
  "/api/billing/providers": {
    get: {
      summary: "Payment-провайдери, доступні юзеру (кнопки на /pricing)",
      tags: ["monetization"],
      security: cookieOrBearer,
      responses: {
        "200": {
          description: "UA → увімкнені liqpay/plata; інші країни → stripe.",
          content: {
            "application/json": {
              schema: namedSchemas.BillingProvidersResponse,
            },
          },
        },
        "401": unauthorized,
      },
    },
  },
  "/api/billing/cancel": {
    post: {
      summary:
        "Скасувати Pro (власна кнопка; LiqPay/Plata без Customer Portal)",
      description:
        "Скасовує активну підписку через provider.cancelSubscription " +
        "(LiqPay unsubscribe / Plata stop-scheduler). Доступ лишається до " +
        "кінця оплаченого періоду (cancel_at_period_end).",
      tags: ["monetization"],
      security: cookieOrBearer,
      responses: {
        "200": {
          description: "Скасування прийнято.",
          content: {
            "application/json": { schema: namedSchemas.BillingCancelResponse },
          },
        },
        "401": unauthorized,
        "503": {
          description: "Billing env is not configured.",
          content: {
            "application/json": { schema: namedSchemas.ApiError },
          },
        },
      },
    },
  },
  "/api/billing/stripe-webhook": {
    post: {
      summary: "Stripe webhook delivery endpoint",
      tags: ["monetization"],
      requestParams: {
        header: z.object({
          "stripe-signature": z
            .string()
            .describe("Stripe webhook signature header (`v1` HMAC)."),
        }),
      },
      responses: {
        "200": okEmpty,
        "400": validationError,
      },
    },
  },
  "/api/billing/liqpay-callback": {
    post: {
      summary: "LiqPay server callback (form data+signature, sha1)",
      tags: ["monetization"],
      responses: {
        "200": okEmpty,
        "400": validationError,
      },
    },
  },
  "/api/billing/plata-webhook": {
    post: {
      summary: "Plata/monopay webhook (JSON, X-Sign ECDSA)",
      tags: ["monetization"],
      requestParams: {
        header: z.object({
          "x-sign": z
            .string()
            .describe("monopay ECDSA signature over the raw request body."),
        }),
      },
      responses: {
        "200": okEmpty,
        "400": validationError,
      },
    },
  },

  // ────────────────────── Transcribe / Observability ────────────────────────
  "/api/transcribe": {
    post: {
      summary: "Голосова транскрипція через Groq Whisper (audio/* → текст)",
      description:
        "Body — сирий аудіо-блоб (`Content-Type: audio/webm | audio/ogg | audio/mp4 | …`), " +
        "ліміт 10 MB. Query визначає мову (auto-detect якщо порожньо) та prompt для " +
        "доменних термінів. Потребує активну сесію + сконфігурований GROQ_API_KEY (503 інакше).",
      tags: ["transcribe"],
      security: cookieOrBearer,
      requestParams: { query: namedSchemas.TranscribeQuery },
      // Медіа-типи синхронізовані зі списком `SUPPORTED_AUDIO_MIME` у
      // `apps/server/src/modules/transcribe/transcribe.ts`. Будь-який inconsistency
      // означає, що опублікований контракт бреше клієнтам про те, які формати
      // приймаються — обїїхавши в 415 намість успіху.
      requestBody: {
        content: {
          "audio/webm": { schema: { type: "string", format: "binary" } },
          "audio/ogg": { schema: { type: "string", format: "binary" } },
          "audio/mp4": { schema: { type: "string", format: "binary" } },
          "audio/m4a": { schema: { type: "string", format: "binary" } },
          "audio/mpeg": { schema: { type: "string", format: "binary" } },
          "audio/mp3": { schema: { type: "string", format: "binary" } },
          "audio/wav": { schema: { type: "string", format: "binary" } },
          "audio/x-wav": { schema: { type: "string", format: "binary" } },
          "audio/wave": { schema: { type: "string", format: "binary" } },
          "audio/flac": { schema: { type: "string", format: "binary" } },
        },
      },
      responses: {
        "200": {
          description: "Транскрипція успішна.",
          content: {
            "application/json": { schema: namedSchemas.TranscribeResponse },
          },
        },
        "400": validationError,
        "401": unauthorized,
        "413": {
          description: "Payload завеликий (>10 MB).",
          content: {
            "application/json": { schema: namedSchemas.ApiError },
          },
        },
        "415": {
          description: "Непідтримуваний Content-Type (очікуємо audio/*).",
          content: {
            "application/json": { schema: namedSchemas.ApiError },
          },
        },
        "503": {
          description: "GROQ_API_KEY не сконфігурований на сервері.",
          content: {
            "application/json": { schema: namedSchemas.ApiError },
          },
        },
      },
    },
  },
  "/api/metrics/web-vitals": {
    post: {
      summary: "Ingest Core Web Vitals (LCP / INP / FCP / TTFB / CLS)",
      description:
        "Анонімний beacon-endpoint для `navigator.sendBeacon` при pagehide / " +
        "visibilitychange=hidden. Завжди відповідає 204 No Content — навіть на " +
        "malformed payload (sendBeacon ігнорує відповідь, не даємо feedback-у зондам).",
      tags: ["observability"],
      requestBody: {
        content: {
          "application/json": { schema: namedSchemas.WebVitalsPayload },
        },
      },
      responses: {
        "204": {
          description:
            "Accepted (завжди 204, незалежно від валідності payload).",
        },
      },
    },
  },

  // ────────────────────── Food search / barcode ──────────────────────
  "/api/food-search": {
    get: {
      summary: "OpenFoodFacts search proxy",
      tags: ["nutrition"],
      requestParams: { query: namedSchemas.FoodSearchQuery },
      responses: { "200": okEmpty, "400": validationError },
    },
  },
  "/api/barcode": {
    get: {
      summary: "OpenFoodFacts barcode lookup",
      tags: ["nutrition"],
      requestParams: { query: namedSchemas.BarcodeQuery },
      responses: { "200": okEmpty, "400": validationError },
    },
  },

  // ────────────────────── Health / metrics ──────────────────────
  "/livez": {
    get: {
      summary: "Liveness probe",
      tags: ["ops"],
      responses: { "200": okEmpty },
    },
  },
  "/readyz": {
    get: {
      summary: "Readiness probe (DB connectivity)",
      tags: ["ops"],
      responses: { "200": okEmpty, "503": okEmpty },
    },
  },
  "/metrics": {
    get: {
      summary: "Prometheus metrics (text/plain)",
      tags: ["ops"],
      responses: {
        "200": {
          description: "Prometheus exposition format",
          content: {
            "text/plain": {
              schema: { type: "string" },
            },
          },
        },
      },
    },
  },
  // ────────────────────── Silpo MCP integration (walking-skeleton) ──────────
  // Spec: `docs/90-work/planning/specs/silpo-mcp-integration.md`. All routes
  // gated by `requireSession()` + `SILPO_ENABLED` kill switch (503
  // `SILPO_DISABLED` when off — shared across every path below).
  "/api/silpo/connect": {
    get: {
      summary: "Розпочати OAuth-підключення до Silpo (302 redirect)",
      description:
        "NAVIGATION-ONLY — браузер редіректиться на Silpo consent screen. " +
        "Не для fetch/XHR-виклику; `@sergeant/api-client` дає " +
        "`silpoConnectUrl()` для `window.location.href`.",
      tags: ["silpo"],
      security: cookieOrBearer,
      responses: {
        "302": { description: "Redirect до Silpo OAuth authorization URL." },
        "401": unauthorized,
        "429": {
          description: "Rate-limit перевищено (rateLimitExpress).",
          content: {
            "application/json": { schema: namedSchemas.ApiError },
          },
        },
        "502": {
          description:
            "SILPO_UPSTREAM_ERROR — не вдалося побудувати authorization URL (metadata discovery впав).",
          content: {
            "application/json": { schema: namedSchemas.ApiError },
          },
        },
        "503": {
          description:
            "SILPO_DISABLED (kill switch) або SILPO_CONFIG_MISSING (redirect URI не сконфігуровано).",
          content: {
            "application/json": { schema: namedSchemas.ApiError },
          },
        },
      },
    },
  },
  "/api/silpo/callback": {
    get: {
      summary: "OAuth callback від Silpo (302 redirect на /settings)",
      description:
        "Server-only — браузер потрапляє сюди після Silpo consent screen, " +
        "жоден клієнт не викликає цей шлях напряму.",
      tags: ["silpo"],
      security: cookieOrBearer,
      responses: {
        "302": {
          description:
            "Redirect на `/settings?silpo=connected|error` (+ `reason` при помилці).",
        },
        "401": unauthorized,
        "503": {
          description: "SILPO_DISABLED (kill switch).",
          content: {
            "application/json": { schema: namedSchemas.ApiError },
          },
        },
      },
    },
  },
  "/api/silpo/disconnect": {
    post: {
      summary: "Відключити Silpo (mono-патерн — чеки/items survive)",
      tags: ["silpo"],
      security: cookieOrBearer,
      responses: {
        "200": {
          description: "`silpo_connection` видалено.",
          content: {
            "application/json": {
              schema: namedSchemas.SilpoDisconnectResponse,
            },
          },
        },
        "401": unauthorized,
        "503": {
          description: "SILPO_DISABLED (kill switch).",
          content: {
            "application/json": { schema: namedSchemas.ApiError },
          },
        },
      },
    },
  },
  "/api/silpo/wipe": {
    post: {
      summary:
        "Повне видалення Silpo-даних (чеки → items → finyk_tx_receipt_links)",
      description:
        "Підтверджені `finyk_tx_splits` та pantry-events НІКОЛИ не чіпаються.",
      tags: ["silpo"],
      security: cookieOrBearer,
      responses: {
        "200": {
          description: "Видалено; `deletedReceipts` — лічильник.",
          content: {
            "application/json": { schema: namedSchemas.SilpoWipeResponse },
          },
        },
        "401": unauthorized,
        "503": {
          description: "SILPO_DISABLED (kill switch).",
          content: {
            "application/json": { schema: namedSchemas.ApiError },
          },
        },
      },
    },
  },
  "/api/silpo/sync-state": {
    get: {
      summary: "Статус Silpo-інтеграції + лічильники (Settings-картка)",
      tags: ["silpo"],
      security: cookieOrBearer,
      responses: {
        "200": {
          description:
            "`status: 'disconnected'` — синтетичний стан (немає рядка `silpo_connection`).",
          content: {
            "application/json": { schema: namedSchemas.SilpoSyncState },
          },
        },
        "401": unauthorized,
        "503": {
          description: "SILPO_DISABLED (kill switch).",
          content: {
            "application/json": { schema: namedSchemas.ApiError },
          },
        },
      },
    },
  },
  "/api/silpo/sync": {
    post: {
      summary: "«Оновити чеки» — pull + normalize + match до транзакцій",
      description:
        "`status` у відповіді — стан ПІСЛЯ спроби синку (може стати " +
        "`reauth_required`, якщо lazy-refresh відвалився посеред синку).",
      tags: ["silpo"],
      security: cookieOrBearer,
      responses: {
        "200": {
          description: "Діагностичні лічильники pull/insert/match.",
          content: {
            "application/json": { schema: namedSchemas.SilpoSyncResult },
          },
        },
        "401": unauthorized,
        "409": {
          description: "SILPO_NOT_CONNECTED або SILPO_REAUTH_REQUIRED.",
          content: {
            "application/json": { schema: namedSchemas.ApiError },
          },
        },
        "429": {
          description: "SILPO_RATE_LIMITED — забагато синків поспіль.",
          content: {
            "application/json": { schema: namedSchemas.ApiError },
          },
        },
        "502": {
          description: "SILPO_UPSTREAM_ERROR або SILPO_SCHEMA_DRIFT.",
          content: {
            "application/json": { schema: namedSchemas.ApiError },
          },
        },
        "503": {
          description: "SILPO_DISABLED (kill switch).",
          content: {
            "application/json": { schema: namedSchemas.ApiError },
          },
        },
      },
    },
  },
  "/api/silpo/receipts": {
    get: {
      summary: "Cursor-paginated список чеків Silpo",
      tags: ["silpo"],
      security: cookieOrBearer,
      requestParams: { query: namedSchemas.SilpoReceiptsQuery },
      responses: {
        "200": {
          description: "Сторінка `SilpoReceiptSummaryDto[]` + nextCursor.",
          content: {
            "application/json": { schema: namedSchemas.SilpoReceiptsPage },
          },
        },
        "400": validationError,
        "401": unauthorized,
        "503": {
          description: "SILPO_DISABLED (kill switch).",
          content: {
            "application/json": { schema: namedSchemas.ApiError },
          },
        },
      },
    },
  },
  "/api/silpo/receipts/{id}": {
    get: {
      summary: "Один чек Silpo — summary + line items",
      tags: ["silpo"],
      security: cookieOrBearer,
      requestParams: {
        path: z.object({
          id: z.string().describe("`silpo_receipts.receipt_id`."),
        }),
      },
      responses: {
        "200": {
          description: "Summary + масив items.",
          content: {
            "application/json": { schema: namedSchemas.SilpoReceiptDetailDto },
          },
        },
        "401": unauthorized,
        "404": {
          description: "Чек не знайдено (не існує або належить іншому юзеру).",
          content: {
            "application/json": { schema: namedSchemas.ApiError },
          },
        },
        "503": {
          description: "SILPO_DISABLED (kill switch).",
          content: {
            "application/json": { schema: namedSchemas.ApiError },
          },
        },
      },
    },
  },
  "/api/silpo/cart/preview": {
    post: {
      summary: "Пошук товарів для кошика (search-only, не пише в кошик)",
      description:
        "Один result на кожен request-item, у порядку запиту (matched " +
        "back по точному тексту `query`, не по індексу). `matches` — top " +
        "candidate + до 2 альтернатив; `unmatched: true` — нуль придатних " +
        "кандидатів. `lagerId` — опаковий токен, клієнт лише зберігає й " +
        "повертає його в `/cart/apply`, ніколи не парсить.",
      tags: ["silpo"],
      security: cookieOrBearer,
      requestBody: {
        required: true,
        content: {
          "application/json": { schema: namedSchemas.SilpoCartPreviewRequest },
        },
      },
      responses: {
        "200": {
          description: "`results[]` — по одному на request-item.",
          content: {
            "application/json": {
              schema: namedSchemas.SilpoCartPreviewResponse,
            },
          },
        },
        "400": validationError,
        "401": unauthorized,
        "409": {
          description: "SILPO_NOT_CONNECTED або SILPO_REAUTH_REQUIRED.",
          content: {
            "application/json": { schema: namedSchemas.ApiError },
          },
        },
        "429": {
          description: "SILPO_RATE_LIMITED — забагато preview-запитів поспіль.",
          content: {
            "application/json": { schema: namedSchemas.ApiError },
          },
        },
        "502": {
          description: "SILPO_UPSTREAM_ERROR або SILPO_SCHEMA_DRIFT.",
          content: {
            "application/json": { schema: namedSchemas.ApiError },
          },
        },
        "503": {
          description: "SILPO_DISABLED (kill switch) або SILPO_CONFIG_MISSING.",
          content: {
            "application/json": { schema: namedSchemas.ApiError },
          },
        },
      },
    },
  },
  "/api/silpo/cart/apply": {
    post: {
      summary: "Додати вибрані товари в кошик Сільпо (confirm-before-write)",
      description:
        "Кожен `lagerId` декодується ДО будь-якого мережевого виклику — " +
        "зіпсований токен дає 400 VALIDATION, ніколи не 502/503. Пише " +
        "EXACTLY передані позиції (`addQuantity: false` — replace, не " +
        "accumulate), відповідь = пост-write стан кошика (форма GET " +
        "/api/silpo/cart).",
      tags: ["silpo"],
      security: cookieOrBearer,
      requestBody: {
        required: true,
        content: {
          "application/json": { schema: namedSchemas.SilpoCartApplyRequest },
        },
      },
      responses: {
        "200": {
          description: "Пост-write стан кошика.",
          content: {
            "application/json": { schema: namedSchemas.SilpoCartDto },
          },
        },
        "400": validationError,
        "401": unauthorized,
        "409": {
          description: "SILPO_NOT_CONNECTED або SILPO_REAUTH_REQUIRED.",
          content: {
            "application/json": { schema: namedSchemas.ApiError },
          },
        },
        "429": {
          description: "SILPO_RATE_LIMITED — забагато apply-запитів поспіль.",
          content: {
            "application/json": { schema: namedSchemas.ApiError },
          },
        },
        "502": {
          description: "SILPO_UPSTREAM_ERROR або SILPO_SCHEMA_DRIFT.",
          content: {
            "application/json": { schema: namedSchemas.ApiError },
          },
        },
        "503": {
          description: "SILPO_DISABLED (kill switch) або SILPO_CONFIG_MISSING.",
          content: {
            "application/json": { schema: namedSchemas.ApiError },
          },
        },
      },
    },
  },
  "/api/silpo/cart": {
    get: {
      summary: "Поточний стан кошика Сільпо",
      description:
        "Порожній кошик (немає попереднього пошуку/замовлення) деградує до " +
        "`{items: [], totalKop: 0, cartUrl: null}`, не помилки.",
      tags: ["silpo"],
      security: cookieOrBearer,
      responses: {
        "200": {
          description: "Поточний кошик.",
          content: {
            "application/json": { schema: namedSchemas.SilpoCartDto },
          },
        },
        "401": unauthorized,
        "409": {
          description: "SILPO_NOT_CONNECTED або SILPO_REAUTH_REQUIRED.",
          content: {
            "application/json": { schema: namedSchemas.ApiError },
          },
        },
        "429": {
          description: "SILPO_RATE_LIMITED.",
          content: {
            "application/json": { schema: namedSchemas.ApiError },
          },
        },
        "502": {
          description: "SILPO_UPSTREAM_ERROR або SILPO_SCHEMA_DRIFT.",
          content: {
            "application/json": { schema: namedSchemas.ApiError },
          },
        },
        "503": {
          description: "SILPO_DISABLED (kill switch) або SILPO_CONFIG_MISSING.",
          content: {
            "application/json": { schema: namedSchemas.ApiError },
          },
        },
      },
    },
  },
};
