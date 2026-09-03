import { Router } from "express";
import {
  requireFreshSession,
  requireSession,
  setModule,
} from "../http/index.js";
import {
  connectHandler,
  disconnectHandler,
  syncStateHandler,
} from "../modules/mono/connection.js";
import {
  accountsHandler,
  jarsHandler,
  transactionsHandler,
} from "../modules/mono/read.js";
import {
  backfillHandler,
  backfillProgressHandler,
} from "../modules/mono/backfill.js";
import { webhookHandler } from "../modules/mono/webhook.js";

/**
 * Роутер для webhook-based Monobank інтеграції (Track A).
 *
 * Webhook endpoint монтується БЕЗ session auth — це публічний endpoint, куди
 * Monobank надсилає delivery. Авторизація — через секрет у path-param
 * `:secret` (це єдиний транспорт, який вміє Monobank `/personal/webhook` —
 * лише `webHookUrl`, без custom-headers). Header-варіант
 * `X-Mono-Webhook-Secret` — defense-in-depth для майбутнього edge-proxy, що
 * перекладе secret з path у header до нашого лог-пайплайну. Деталі та
 * residual risk — C1 `docs/security/hardening/C1-mono-webhook-secret-in-url.md`.
 *
 * Обидва маршрути ведуть у один і той самий handler — `webhookHandler`
 * вибирає секрет з header-а (якщо є) або з path-param-у. Header виграє при
 * колізії, тож edge-rewrite зміг би перехопити транспорт без server-change.
 *
 * Решта endpoints — під `requireSession()`; `connect` / `disconnect` — під
 * `requireFreshSession()` (сесія перевіряється в БД, в обхід 5-хвилинного
 * cookie-кешу): підʼєднати чужий банк або відʼєднати свій зі вкраденої
 * сесії має перестати працювати в момент її відкликання, а не за 5 хв.
 */
export function createMonoWebhookRouter(): Router {
  const r = Router();

  r.use("/api/mono/connect", setModule("finyk"));
  r.use("/api/mono/disconnect", setModule("finyk"));
  r.use("/api/mono/sync-state", setModule("finyk"));
  r.use("/api/mono/accounts", setModule("finyk"));
  r.use("/api/mono/jars", setModule("finyk"));
  r.use("/api/mono/transactions", setModule("finyk"));
  r.use("/api/mono/backfill", setModule("finyk"));
  r.use("/api/mono/backfill-progress", setModule("finyk"));

  // Webhook — публічний, без auth.
  //
  // Header-only маршрут реєструється першим, щоб `POST /api/mono/webhook` без
  // path-secret (edge-rewrite кейс) потрапляв сюди, а не у 404. Monobank
  // реально бʼє у path-варіант нижче.
  r.post("/api/mono/webhook", webhookHandler);
  r.post("/api/mono/webhook/:secret", webhookHandler);

  // Session-protected endpoints.
  //
  // H6-контекст: `/api/mono/connect` МАЄ гейтитися на `email_verified=true`
  // через `requireVerifiedEmail()` — без цього атакувальник, що зареєстрував
  // squat-акаунт на чужий email, підʼєднав би свій Mono-token і дав жертві
  // картину "хтось бачить мої транзакції" (плюс шифрований token у БД на
  // чужому user_id). `/api/mono/disconnect`, accounts, transactions,
  // backfill навмисно НЕ гейтнуті: вони не створюють нових прав, лише
  // дають подивитись/відключити вже підʼєднане; disconnect — anti-lock-in.
  //
  // AI-LEGACY: expires 2026-11-07 — гейт знято, і це ЄДИНИЙ беточний виняток,
  // який пережив закриття бети. Причина зняття була не в самій беті, а в
  // доставці верифікаційних листів: поки RESEND_API_KEY / RESEND_FROM не
  // працюють (`email/authTransactionalMail.ts`), користувач не може
  // підтвердити пошту й узагалі не підʼєднає Mono, тобто гейт перетворює
  // фічу на глухий кут.
  //
  // ЩО ЗРОБИТИ: спершу перевірити на проді, що лист про верифікацію реально
  // доходить, і аж тоді повернути `requireVerifiedEmail()` між
  // `requireFreshSession()` і `connectHandler` (плюс import із `../http`).
  // Порядок обовʼязковий: гейт без робочих листів не закриває діру, а
  // блокує підключення банку всім новим. Регрес-тест чекає в `apiV1.test.ts`
  // під тим самим маркером.
  r.post("/api/mono/connect", requireFreshSession(), connectHandler);
  r.post("/api/mono/disconnect", requireFreshSession(), disconnectHandler);
  r.get("/api/mono/sync-state", requireSession(), syncStateHandler);
  r.get("/api/mono/accounts", requireSession(), accountsHandler);
  r.get("/api/mono/jars", requireSession(), jarsHandler);
  r.get("/api/mono/transactions", requireSession(), transactionsHandler);
  r.post("/api/mono/backfill", requireSession(), backfillHandler);
  r.get(
    "/api/mono/backfill-progress",
    requireSession(),
    backfillProgressHandler,
  );

  return r;
}
