import { Router } from "express";
import {
  requireSession,
  requireVerifiedEmail,
  setModule,
} from "../http/index.js";
import {
  connectHandler,
  disconnectHandler,
  syncStateHandler,
} from "../modules/mono/connection.js";
import { accountsHandler, transactionsHandler } from "../modules/mono/read.js";
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
 * Решта endpoints — під `requireSession()`.
 */
export function createMonoWebhookRouter(): Router {
  const r = Router();

  r.use("/api/mono/connect", setModule("finyk"));
  r.use("/api/mono/disconnect", setModule("finyk"));
  r.use("/api/mono/sync-state", setModule("finyk"));
  r.use("/api/mono/accounts", setModule("finyk"));
  r.use("/api/mono/transactions", setModule("finyk"));
  r.use("/api/mono/backfill", setModule("finyk"));
  r.use("/api/mono/backfill-progress", setModule("finyk"));

  // Webhook — публічний, без auth.
  //
  // Header-only маршрут реєструється першим, щоб `POST /api/mono/webhook` без
  // path-secret (edge-rewrite кейс) потрапляв сюди, а не у 404. Monobank
  // реально б'є у path-варіант нижче.
  r.post("/api/mono/webhook", webhookHandler);
  r.post("/api/mono/webhook/:secret", webhookHandler);

  // Session-protected endpoints.
  //
  // H6 — `/api/mono/connect` додатково гейтиться на `email_verified=true`
  // через `requireVerifiedEmail()`. Без цього атакувальник, що зареєстрував
  // squat-акаунт на чужий email, міг би одразу під'єднати свій Mono-token
  // і дати жертві картину "хтось бачить мої транзакції" (плюс ми писали
  // б шифрований token у БД на чужому user_id). 403 з code
  // `EMAIL_VERIFICATION_REQUIRED` — фронт показує банер "Підтверди email,
  // щоб під'єднати банк".
  //
  // `/api/mono/disconnect`, accounts, transactions, backfill — навмисно НЕ
  // гейтнуті: вони не створюють нових прав, а лише дозволяють юзеру
  // подивитись/відключити те, що він уже встиг під'єднати (для legacy
  // акаунтів, що під'єднались до H6). Disconnect взагалі має лишатись
  // доступним без верифікації, бо це anti-lock-in primitive.
  r.post(
    "/api/mono/connect",
    requireSession(),
    requireVerifiedEmail(),
    connectHandler,
  );
  r.post("/api/mono/disconnect", requireSession(), disconnectHandler);
  r.get("/api/mono/sync-state", requireSession(), syncStateHandler);
  r.get("/api/mono/accounts", requireSession(), accountsHandler);
  r.get("/api/mono/transactions", requireSession(), transactionsHandler);
  r.post("/api/mono/backfill", requireSession(), backfillHandler);
  r.get(
    "/api/mono/backfill-progress",
    requireSession(),
    backfillProgressHandler,
  );

  return r;
}
