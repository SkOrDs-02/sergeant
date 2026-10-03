import { Router, type Request, type Response } from "express";
import {
  requireFreshSession,
  requireSession,
  requireVerifiedEmail,
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
/**
 * Валідаційний пінг Monobank для `webHookUrl`.
 *
 * Документація `POST /personal/webhook`: на вказану адресу Monobank спершу
 * надсилає GET, і сервер має відповісти СТРОГО HTTP 200 — інакше реєстрація
 * вебхука не активується. Без цього обробника GET давав Express-404
 * (прод `servesFrontend=false`, SPA-fallback не рятує) — аудит rel-24.
 *
 * Свідомо БЕЗ перевірки секрету й БЕЗ побічних ефектів (жодного звернення
 * до БД, метрик чи логування): у момент реєстрації (`connection.ts`) хеш
 * секрету ще не збережено — `INSERT mono_connection` іде вже після
 * успішної реєстрації, тож lookup тут завжди давав би «секрет невідомий».
 * Секрет із шляху не читається взагалі (`req.params` не торкаємось), тому
 * в лог він потрапити не може; access-лог (`requestLog.ts`) пише
 * `route.path` (`/api/mono/webhook/:secret`), а не сирий URL (Hard Rule #21).
 * Нічого не розкриваємо: однакове `200` для будь-якого значення.
 *
 * HEAD Express віддає цьому ж обробнику сам (немає окремого `r.head`).
 */
function webhookUrlValidationHandler(_req: Request, res: Response): void {
  res.set("Cache-Control", "no-store");
  res.status(200).type("text/plain").send("ok");
}

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

  // GET (і HEAD) — валідація URL самим Monobank, див. обробник вище.
  r.get("/api/mono/webhook", webhookUrlValidationHandler);
  r.get("/api/mono/webhook/:secret", webhookUrlValidationHandler);

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
  // Гейт повернуто 2026-09-16. Беточний виняток тримався на тому, що
  // доставка верифікаційних листів не працювала — тоді гейт не закривав би
  // діру, а перетворював підключення банку на глухий кут для всіх нових.
  // Передумова відпала з двох боків: `betterAuthEnv.ts` тепер ВІДМОВЛЯЄТЬСЯ
  // стартувати прод без `RESEND_API_KEY` (знахідка 17 глобального QA
  // 2026-08-04), а `RESEND_FROM` і верифікований домен налаштовані —
  // підтверджено власником. Тобто «поки листи не працюють» більше не
  // описує реальність.
  //
  // Порядок ланцюга важливий: `requireFreshSession()` → `requireVerifiedEmail()`
  // → handler. Перевірка email стоїть ДО `connectHandler`, щоб відсіяти
  // запит раніше за його побічні ефекти (fetch client-info у Mono,
  // шифрування токена) — саме заради цього H6 і зроблено middleware, а не
  // inline-перевіркою.
  r.post(
    "/api/mono/connect",
    requireFreshSession(),
    requireVerifiedEmail(),
    connectHandler,
  );
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
