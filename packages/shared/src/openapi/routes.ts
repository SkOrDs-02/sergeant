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

  // ────────────────────── /api/ai-memory/* ──────────────────────
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
  "/api/nutrition/day-hint": {
    post: {
      summary: "Згенерувати hint наступного прийому їжі на день",
      tags: ["nutrition"],
      security: cookieOrBearer,
      requestBody: {
        content: { "application/json": { schema: namedSchemas.DayHint } },
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

  // ────────────────────── /api/sync/* ──────────────────────
  "/api/sync/push": {
    post: {
      summary: "Push module-data (LWW; per-module)",
      tags: ["sync"],
      security: cookieOrBearer,
      requestBody: {
        content: { "application/json": { schema: namedSchemas.SyncPush } },
      },
      responses: {
        "200": okEmpty,
        "400": validationError,
        "401": unauthorized,
      },
    },
  },
  "/api/sync/pull": {
    post: {
      summary: "Pull module-data (LWW; per-module)",
      tags: ["sync"],
      security: cookieOrBearer,
      requestBody: {
        content: { "application/json": { schema: namedSchemas.SyncPull } },
      },
      responses: {
        "200": okEmpty,
        "400": validationError,
        "401": unauthorized,
      },
    },
  },
  "/api/sync/pull-all": {
    get: {
      summary: "Pull всіх модулів одразу (LWW resolved snapshot)",
      tags: ["sync"],
      security: cookieOrBearer,
      responses: { "200": okEmpty, "401": unauthorized },
    },
    post: {
      summary: "Pull всіх модулів (POST варіант для клієнтів без GET-body)",
      tags: ["sync"],
      security: cookieOrBearer,
      responses: { "200": okEmpty, "401": unauthorized },
    },
  },
  "/api/sync/push-all": {
    post: {
      summary: "Bulk push модулів за один request",
      tags: ["sync"],
      security: cookieOrBearer,
      requestBody: {
        content: {
          "application/json": { schema: namedSchemas.SyncPushAll },
        },
      },
      responses: {
        "200": okEmpty,
        "400": validationError,
        "401": unauthorized,
      },
    },
  },

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
  "/api/privat": {
    get: {
      summary: "PrivatBank API proxy",
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

  // ────────────────────── Mono webhook integration ──────────────────────
  // C1 — `docs/security/hardening/C1-mono-webhook-secret-in-url.md`.
  // Header-based маршрут — preferred. Path-based маршрут лишається для
  // backward-compat поки Monobank не мігрує на header-доставку.
  "/api/mono/webhook": {
    post: {
      summary: "Mono webhook (X-Mono-Webhook-Secret header — preferred)",
      tags: ["mono"],
      requestParams: {
        header: z.object({
          "x-mono-webhook-secret": z
            .string()
            .describe(
              "Per-user webhook secret. Header-варіант — preferred з C1-rollout-у; не потрапляє в access-логи.",
            ),
        }),
      },
      responses: { "200": okEmpty },
    },
  },
  "/api/mono/webhook/{secret}": {
    post: {
      summary:
        "Mono webhook (per-user secret у URL — legacy, deprecated по C1)",
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
};
