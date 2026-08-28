import type { Request, Response } from "express";
import { Router } from "express";
import { env } from "../env/env.js";
import { query } from "../db.js";
import { logger } from "../obs/logger.js";
import { rateLimitExpress, requireSession, setModule } from "../http/index.js";
import { parseQuery } from "../http/validate.js";
import { getWebAppOrigin } from "../auth/verificationMail.js";
import {
  SilpoCartApplyRequestSchema,
  SilpoCartDtoSchema,
  SilpoCartPreviewRequestSchema,
  SilpoCartPreviewResponseSchema,
  SilpoDisconnectResponseSchema,
  SilpoReceiptDetailDtoSchema,
  SilpoReceiptsPageSchema,
  SilpoReceiptsQuerySchema,
  SilpoSyncResultSchema,
  SilpoSyncStateSchema,
  SilpoRelinkRequestSchema,
  SilpoRelinkResponseSchema,
  SilpoUnlinkResponseSchema,
  SilpoWipeResponseSchema,
} from "../http/schemas.js";
import {
  buildAuthorizationUrl,
  consumeAuthorizationState,
  exchangeCode,
} from "../modules/silpo/oauth.js";
import { persistTokens, silpoKeyRing } from "../modules/silpo/tokenStore.js";
import {
  getReceiptDetail,
  listReceipts,
  pullAndSyncReceipts,
  relinkReceiptToTransaction,
  unlinkReceiptFromTransaction,
} from "../modules/silpo/receipts.js";
import {
  applyCart,
  clearCart,
  getCart,
  previewCart,
} from "../modules/silpo/cart.js";
import { parseBody } from "../http/validate.js";

/**
 * `GET /api/silpo/connect|callback`, `POST /api/silpo/disconnect|wipe|sync`,
 * `GET /api/silpo/sync-state|receipts|receipts/:id`. Mirrors the Monobank
 * route shape (`routes/mono-webhook.js` + `modules/mono/connection.ts`)
 * where the flow allows — OAuth redirect handshake is new here (Monobank
 * uses a static personal token, no browser round-trip).
 *
 * Every handler is gated by `assertSilpoEnabled` (kill switch — spec § Рішення дизайну,
 * "`SILPO_ENABLED` як kill switch"). `SILPO_ENABLED=false` лишається
 * дефолтом: обидва продуктові гейти знято 2026-08-18 (оферта — як
 * операційний ризик, приватність — текст затверджено), але вмикання в
 * проді — окремий ops-крок із власним DCR-клієнтом
 * (`docs/00-start/playbooks/enable-silpo-integration.md`).
 *
 * Сесію вимагають УСІ роути, крім `GET /api/silpo/callback`: він
 * реєструється до router-level `requireSession()`, бо приземляється на
 * PUBLIC_API_BASE_URL, де куки сесії (домен BETTER_AUTH_URL) немає ні в
 * кого. Контекст користувача там приходить зі `state`.
 *
 * Every route also carries its own `rateLimitExpress` bucket (CodeQL
 * "missing rate limiting" finding, review round) — unlike `finyk`/
 * `nutrition`, this router has no single broad `r.use(...)` bucket covering
 * `/api/silpo/*`, so each `r.get`/`r.post` below needs an explicit limiter.
 */

interface AuthedRequest extends Request {
  user?: { id: string };
}

function assertSilpoEnabled(res: Response): boolean {
  if (!env.SILPO_ENABLED) {
    res.status(503).json({
      error: "Інтеграція із Сільпо вимкнена",
      code: "SILPO_DISABLED",
    });
    return false;
  }
  return true;
}

function getUserId(req: AuthedRequest, res: Response): string | null {
  const userId = req.user?.id;
  if (!userId) {
    res
      .status(401)
      .json({ error: "Потрібна автентифікація", code: "UNAUTHORIZED" });
    return null;
  }
  return userId;
}

function callbackRedirectUri(): string | null {
  return env.PUBLIC_API_BASE_URL
    ? `${env.PUBLIC_API_BASE_URL}/api/silpo/callback`
    : null;
}

/** Redirects the browser back to the web Settings page with a `?silpo=` status flag. Falls back to a JSON body when the web origin cannot be resolved (misconfigured deploy — see `getWebAppOrigin`). */
function redirectToSettings(
  res: Response,
  status: "connected" | "error",
  reason?: string,
): void {
  const webOrigin = getWebAppOrigin();
  if (!webOrigin) {
    res.status(status === "connected" ? 200 : 400).json({ status, reason });
    return;
  }
  const url = new URL("/settings", webOrigin);
  url.searchParams.set("silpo", status);
  if (reason) url.searchParams.set("reason", reason);
  res.redirect(302, url.toString());
}

// ────────────────────────────── Connect / callback ───────────────────────────

export async function connectHandler(
  req: Request,
  res: Response,
): Promise<void> {
  if (!assertSilpoEnabled(res)) return;
  const userId = getUserId(req as AuthedRequest, res);
  if (!userId) return;

  const redirectUri = callbackRedirectUri();
  if (!redirectUri) {
    res.status(503).json({
      error: "Сільпо-інтеграція не налаштована на сервері",
      code: "SILPO_CONFIG_MISSING",
    });
    return;
  }

  try {
    const { url } = await buildAuthorizationUrl({ userId, redirectUri });
    res.redirect(302, url);
  } catch (err) {
    logger.warn({
      msg: "silpo_connect_failed",
      err: err instanceof Error ? err.message : String(err),
    });
    res.status(502).json({
      error: "Не вдалося розпочати підключення до Сільпо",
      code: "SILPO_UPSTREAM_ERROR",
    });
  }
}

export async function callbackHandler(
  req: Request,
  res: Response,
): Promise<void> {
  if (!assertSilpoEnabled(res)) return;

  const {
    code,
    state,
    error: oauthError,
  } = req.query as {
    code?: string;
    state?: string;
    error?: string;
  };

  if (oauthError) {
    redirectToSettings(res, "error", "denied");
    return;
  }
  if (
    !code ||
    typeof code !== "string" ||
    !state ||
    typeof state !== "string"
  ) {
    redirectToSettings(res, "error", "invalid_request");
    return;
  }

  const pending = await consumeAuthorizationState(state);
  if (!pending) {
    // Unknown, expired or already-consumed state — the only hard gate here.
    redirectToSettings(res, "error", "invalid_state");
    return;
  }

  // `state` — НОСІЙ контексту, не просто nonce: `user_id` лежить у
  // `silpo_oauth_state` (міграція 126), записаний на `/connect`, де сесія
  // ще була. Саме тому цей роут навмисно НЕ під `requireSession()`.
  //
  // Причина не в тому, що сесія «може протухнути за 10 хвилин». Колбек
  // приземляється на PUBLIC_API_BASE_URL (api.167-233-98-92.sslip.io), а
  // сесія Better Auth живе у контексті BETTER_AUTH_URL
  // (sergeant.vercel.app) — це РІЗНІ сайти, і Vercel не проксіює /api/*
  // на бекенд. Тобто на колбеку сесії немає НІКОЛИ й ні в кого: вимога
  // `requireSession()` тут робила фічу непрацездатною для всіх, віддаючи
  // 401-JSON у вкладку замість екрана налаштувань.
  //
  // Безпеку тримає сам `state`: 24 байти ентропії, TTL 10 хвилин,
  // згорає одним атомарним `DELETE ... RETURNING` (тобто replay
  // неможливий), і приходить він лише на наш redirect_uri по TLS.
  // Звірки з `req.user` тут свідомо НЕМАЄ — і не тому, що «лінь». Роут
  // стоїть до `requireSession()`, тож `req.user` не заповнюється ніколи, і
  // будь-яка така умова була б мертвим кодом, що вдає захист.
  //
  // Класична вимога «state має бути привʼязаний до сесії» захищає від
  // account-linking CSRF: зловмисник підсовує жертві СВІЙ `code`, щоб його
  // акаунт провайдера прилип до її профілю. Тут ця атака не працює за
  // побудовою: власника визначає `state`, а не браузер, який приніс запит.
  // Підсунутий чужий `state` привʼяже токени до акаунта того, хто цей
  // `state` замовив, — тобто до самого зловмисника, а не до жертви.
  const userId = pending.userId;

  const ring = silpoKeyRing();
  if (!ring) {
    redirectToSettings(res, "error", "config_missing");
    return;
  }

  try {
    const tokens = await exchangeCode({
      code,
      codeVerifier: pending.codeVerifier,
      redirectUri: pending.redirectUri,
    });
    if (!tokens.refresh_token) {
      // Migration 123 has NOT NULL refresh_token_* columns — a code
      // exchange without one is unusable and must not be persisted.
      logger.warn({ msg: "silpo_callback_missing_refresh_token" });
      redirectToSettings(res, "error", "missing_refresh_token");
      return;
    }
    await persistTokens(userId, ring, {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAtMs: tokens.expires_in
        ? Date.now() + tokens.expires_in * 1000
        : null,
    });
    logger.info({ msg: "silpo.connected" });
    redirectToSettings(res, "connected");
  } catch (err) {
    logger.warn({
      msg: "silpo_callback_exchange_failed",
      err: err instanceof Error ? err.message : String(err),
    });
    redirectToSettings(res, "error", "exchange_failed");
  }
}

// ────────────────────────────── Disconnect / wipe ─────────────────────────────

/** Mono-pattern: deletes only `silpo_connection` — receipts/items/links survive. */
export async function disconnectHandler(
  req: Request,
  res: Response,
): Promise<void> {
  if (!assertSilpoEnabled(res)) return;
  const userId = getUserId(req as AuthedRequest, res);
  if (!userId) return;

  await query("DELETE FROM silpo_connection WHERE user_id = $1", [userId], {
    op: "silpo_connection_delete",
  });
  logger.info({ msg: "silpo.disconnected" });
  res.status(200).json(SilpoDisconnectResponseSchema.parse({ ok: true }));
}

/** Full erasure: `silpo_receipts` cascades to items + `silpo_tx_receipt_links`. User-confirmed `finyk_tx_splits` / pantry-events are NEVER touched. */
export async function wipeHandler(req: Request, res: Response): Promise<void> {
  if (!assertSilpoEnabled(res)) return;
  const userId = getUserId(req as AuthedRequest, res);
  if (!userId) return;

  const result = await query(
    "DELETE FROM silpo_receipts WHERE user_id = $1",
    [userId],
    { op: "silpo_receipts_wipe" },
  );
  const deletedReceipts = result.rowCount ?? 0;
  logger.info({ msg: "silpo.wiped", deletedReceipts });
  res
    .status(200)
    .json(SilpoWipeResponseSchema.parse({ ok: true, deletedReceipts }));
}

// ────────────────────────────────── Sync ───────────────────────────────────

type SyncStateConnRow = {
  status: "connected" | "reauth_required";
  access_token_expires_at: Date | string | null;
  last_sync_at: Date | string | null;
};
type SyncStateCountRow = { count: string };

function toIsoOrNull(v: Date | string | null): string | null {
  if (v == null) return null;
  return v instanceof Date ? v.toISOString() : v;
}

export async function syncStateHandler(
  req: Request,
  res: Response,
): Promise<void> {
  if (!assertSilpoEnabled(res)) return;
  const userId = getUserId(req as AuthedRequest, res);
  if (!userId) return;

  const [connResult, countResult] = await Promise.all([
    query<SyncStateConnRow>(
      // last_sync_at — персистований момент успішного pullAndSyncReceipts
      // (не MAX(created_at) по чеках: sync без нових чеків теж «оновлення»).
      "SELECT status, access_token_expires_at, last_sync_at FROM silpo_connection WHERE user_id = $1",
      [userId],
      { op: "silpo_sync_state_connection" },
    ),
    query<SyncStateCountRow>(
      `SELECT COUNT(*)::text AS count
         FROM silpo_receipts WHERE user_id = $1`,
      [userId],
      { op: "silpo_sync_state_receipts" },
    ),
  ]);

  const conn = connResult.rows[0];
  const counts = countResult.rows[0];

  res.status(200).json(
    SilpoSyncStateSchema.parse({
      status: conn?.status ?? "disconnected",
      accessTokenExpiresAt: toIsoOrNull(conn?.access_token_expires_at ?? null),
      lastSyncAt: toIsoOrNull(conn?.last_sync_at ?? null),
      receiptsCount: Number(counts?.count ?? 0),
    }),
  );
}

/** "Оновити чеки" button. Errors are thrown as `AppError` subclasses (Express 5 forwards async rejections to `errorHandler` automatically) — this is an explicit user action, a clean 4xx/5xx is the correct response, not a swallowed staleness banner. */
export async function syncHandler(req: Request, res: Response): Promise<void> {
  if (!assertSilpoEnabled(res)) return;
  const userId = getUserId(req as AuthedRequest, res);
  if (!userId) return;

  const result = await pullAndSyncReceipts(userId);
  res.status(200).json(SilpoSyncResultSchema.parse(result));
}

// ──────────────────────────────── Receipts read ────────────────────────────

export async function receiptsListHandler(
  req: Request,
  res: Response,
): Promise<void> {
  if (!assertSilpoEnabled(res)) return;
  const userId = getUserId(req as AuthedRequest, res);
  if (!userId) return;

  const { limit, cursor, transactionId } = parseQuery(
    SilpoReceiptsQuerySchema,
    req,
  );
  const page = await listReceipts(userId, { limit, cursor, transactionId });
  res.status(200).json(SilpoReceiptsPageSchema.parse(page));
}

export async function receiptDetailHandler(
  req: Request,
  res: Response,
): Promise<void> {
  if (!assertSilpoEnabled(res)) return;
  const userId = getUserId(req as AuthedRequest, res);
  if (!userId) return;

  const receiptIdParam = req.params["id"];
  const receiptId =
    typeof receiptIdParam === "string" ? receiptIdParam : undefined;
  if (!receiptId) {
    res.status(400).json({ error: "Missing receipt id", code: "VALIDATION" });
    return;
  }
  const detail = await getReceiptDetail(userId, receiptId);
  if (!detail) {
    res.status(404).json({ error: "Чек не знайдено", code: "NOT_FOUND" });
    return;
  }
  res.status(200).json(SilpoReceiptDetailDtoSchema.parse(detail));
}

/**
 * `DELETE /api/silpo/receipts/link/:transactionId` — знімає хибну пару
 * «транзакція ↔ чек». Matcher детермінований (збіг суми в межах ±1 доба),
 * тож чужа покупка на ту саму суму дає хибний лінк, і до цього ендпоїнта
 * єдиним способом його прибрати був `POST /api/silpo/wipe` — знесення ВСІХ
 * чеків заради однієї помилки.
 *
 * `404`, коли лінка не було: мовчазний успіх зробив би кнопку «відвʼязати»
 * брехливою (рапортувала б перемогу над уже знятим чи чужим звʼязком).
 */
export async function receiptUnlinkHandler(
  req: Request,
  res: Response,
): Promise<void> {
  if (!assertSilpoEnabled(res)) return;
  const userId = getUserId(req as AuthedRequest, res);
  if (!userId) return;

  const transactionIdParam = req.params["transactionId"];
  const transactionId =
    typeof transactionIdParam === "string" ? transactionIdParam : undefined;
  if (!transactionId) {
    res
      .status(400)
      .json({ error: "Missing transaction id", code: "VALIDATION" });
    return;
  }

  const receiptId = await unlinkReceiptFromTransaction(userId, transactionId);
  if (!receiptId) {
    res.status(404).json({ error: "Звʼязок не знайдено", code: "NOT_FOUND" });
    return;
  }
  logger.info({ msg: "silpo.receipt.unlinked" });
  res
    .status(200)
    .json(SilpoUnlinkResponseSchema.parse({ ok: true, receiptId }));
}

/**
 * `POST /api/silpo/receipts/link/:transactionId` — «Повернути» після
 * «Це не той чек».
 *
 * Без цього ендпоїнта відчеплення було безповоротним: відхилення лягало в
 * `silpo_tx_receipt_link_rejections` назавжди, і навіть повторний sync пару
 * вже не відновлював. Промах по кнопці коштував чека (репорт founder-а,
 * 2026-08-25).
 *
 * `404`, коли чек не належить користувачу, — з тієї ж причини, що й в
 * unlink: мовчазний успіх зробив би кнопку брехливою.
 */
export async function receiptRelinkHandler(
  req: Request,
  res: Response,
): Promise<void> {
  if (!assertSilpoEnabled(res)) return;
  const userId = getUserId(req as AuthedRequest, res);
  if (!userId) return;

  const transactionIdParam = req.params["transactionId"];
  const transactionId =
    typeof transactionIdParam === "string" ? transactionIdParam : undefined;
  if (!transactionId) {
    res
      .status(400)
      .json({ error: "Missing transaction id", code: "VALIDATION" });
    return;
  }

  // Кидає `ValidationError` — errorHandler віддає 400; окремої гілки тут
  // не треба (той самий патерн, що й `cartApplyHandler` нижче).
  const body = parseBody(SilpoRelinkRequestSchema, req);

  const linked = await relinkReceiptToTransaction(
    userId,
    transactionId,
    body.receiptId,
  );
  if (!linked) {
    res.status(404).json({ error: "Чек не знайдено", code: "NOT_FOUND" });
    return;
  }
  logger.info({ msg: "silpo.receipt.relinked" });
  res.status(200).json(SilpoRelinkResponseSchema.parse({ ok: true }));
}

// ──────────────────────────────────── Cart (Track G) ────────────────────────

/**
 * `POST /api/silpo/cart/preview` — search-only, never writes. Body:
 * `{items: [{name, quantity?}]}` (1..100, names trimmed/non-empty — Zod
 * rejects a whitespace-only name with 400 before the handler runs).
 */
export async function cartPreviewHandler(
  req: Request,
  res: Response,
): Promise<void> {
  if (!assertSilpoEnabled(res)) return;
  const userId = getUserId(req as AuthedRequest, res);
  if (!userId) return;

  const { items } = parseBody(SilpoCartPreviewRequestSchema, req);
  const results = await previewCart(userId, items);
  res.status(200).json(SilpoCartPreviewResponseSchema.parse({ results }));
}

/**
 * `POST /api/silpo/cart/apply` — confirm-before-write. Body:
 * `{selections: [{lagerId, quantity}]}` (1..100). Adds EXACTLY the passed
 * positions (`applyCart` uses `addQuantity: false`), then returns the
 * post-write cart state.
 */
export async function cartApplyHandler(
  req: Request,
  res: Response,
): Promise<void> {
  if (!assertSilpoEnabled(res)) return;
  const userId = getUserId(req as AuthedRequest, res);
  if (!userId) return;

  const { selections } = parseBody(SilpoCartApplyRequestSchema, req);
  const cart = await applyCart(userId, selections);
  res.status(200).json(SilpoCartDtoSchema.parse(cart));
}

/**
 * `POST /api/silpo/cart/clear` — empty the external cart, then return the
 * post-write (empty) state. Body-less: there is exactly one cart per user.
 */
export async function cartClearHandler(
  req: Request,
  res: Response,
): Promise<void> {
  if (!assertSilpoEnabled(res)) return;
  const userId = getUserId(req as AuthedRequest, res);
  if (!userId) return;

  const cart = await clearCart(userId);
  res.status(200).json(SilpoCartDtoSchema.parse(cart));
}

/** `GET /api/silpo/cart` — current cart state. */
export async function cartGetHandler(
  req: Request,
  res: Response,
): Promise<void> {
  if (!assertSilpoEnabled(res)) return;
  const userId = getUserId(req as AuthedRequest, res);
  if (!userId) return;

  const cart = await getCart(userId);
  res.status(200).json(SilpoCartDtoSchema.parse(cart));
}

// ──────────────────────────────────── Router ────────────────────────────────

export function createSilpoRouter(): Router {
  const r = Router();
  r.use("/api/silpo", setModule("finyk"));
  // `/callback` реєструється ДО router-level `requireSession()` — порядок
  // тут і є механізмом: Express виконує middleware у порядку реєстрації,
  // тож усе нижче `r.use(requireSession())` вимагає сесію, а цей роут — ні
  // (чому саме — розписано в `callbackHandler`).
  //
  // Той самий bucket/limit, що й у `connect`: це ДРУГА половина одного
  // authorization_code round-trip, частіше за `connect` він не викликається.
  r.get(
    "/api/silpo/callback",
    rateLimitExpress({
      key: "api:silpo:callback",
      limit: 10,
      windowMs: 60_000,
    }),
    callbackHandler,
  );

  r.use("/api/silpo", requireSession());

  r.get(
    "/api/silpo/connect",
    rateLimitExpress({ key: "api:silpo:connect", limit: 10, windowMs: 60_000 }),
    connectHandler,
  );
  r.post(
    "/api/silpo/disconnect",
    rateLimitExpress({
      key: "api:silpo:disconnect",
      limit: 10,
      windowMs: 60_000,
    }),
    disconnectHandler,
  );
  r.post(
    "/api/silpo/wipe",
    // Destructive (cascades to receipts/items/links) — throttled as tightly
    // as `sync`, not the lighter `disconnect` bucket.
    rateLimitExpress({ key: "api:silpo:wipe", limit: 5, windowMs: 60_000 }),
    wipeHandler,
  );
  r.get(
    "/api/silpo/sync-state",
    rateLimitExpress({
      key: "api:silpo:sync-state",
      limit: 60,
      windowMs: 60_000,
    }),
    syncStateHandler,
  );
  r.post(
    "/api/silpo/sync",
    rateLimitExpress({ key: "api:silpo:sync", limit: 5, windowMs: 60_000 }),
    syncHandler,
  );
  r.get(
    "/api/silpo/receipts",
    rateLimitExpress({
      key: "api:silpo:receipts",
      limit: 60,
      windowMs: 60_000,
    }),
    receiptsListHandler,
  );
  r.get(
    "/api/silpo/receipts/:id",
    rateLimitExpress({
      key: "api:silpo:receipt-detail",
      limit: 60,
      windowMs: 60_000,
    }),
    receiptDetailHandler,
  );
  r.delete(
    "/api/silpo/receipts/link/:transactionId",
    // Пише два рядки (відхилення + зняття лінка) і впливає на майбутні
    // синки — відро як у `disconnect`, не як у читальних роутів.
    rateLimitExpress({
      key: "api:silpo:receipt-unlink",
      limit: 10,
      windowMs: 60_000,
    }),
    receiptUnlinkHandler,
  );
  r.post(
    "/api/silpo/receipts/link/:transactionId",
    // Те саме відро за формою, що й unlink: пара кнопок «відчепити ↔
    // повернути» має однакову ціну, інакше швидкий undo впирався б у
    // ліміт, якого сама дія не мала.
    rateLimitExpress({
      key: "api:silpo:receipt-relink",
      limit: 10,
      windowMs: 60_000,
    }),
    receiptRelinkHandler,
  );
  r.post(
    "/api/silpo/cart/preview",
    rateLimitExpress({
      key: "api:silpo:cart-preview",
      limit: 10,
      windowMs: 60_000,
    }),
    cartPreviewHandler,
  );
  r.post(
    "/api/silpo/cart/apply",
    // Writes to an external system (Track G confirm-before-write) — tightest
    // bucket in this router, same order of magnitude as `sync`/`wipe`.
    rateLimitExpress({
      key: "api:silpo:cart-apply",
      limit: 5,
      windowMs: 60_000,
    }),
    cartApplyHandler,
  );
  r.post(
    "/api/silpo/cart/clear",
    // Те саме відро, що й `apply`: обидві дії пишуть у зовнішній кошик.
    rateLimitExpress({
      key: "api:silpo:cart-clear",
      limit: 5,
      windowMs: 60_000,
    }),
    cartClearHandler,
  );
  r.get(
    "/api/silpo/cart",
    rateLimitExpress({
      key: "api:silpo:cart-get",
      limit: 30,
      windowMs: 60_000,
    }),
    cartGetHandler,
  );

  return r;
}
