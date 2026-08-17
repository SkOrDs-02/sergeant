import type { Request, Response } from "express";
import { Router } from "express";
import { env } from "../env/env.js";
import { query } from "../db.js";
import { logger } from "../obs/logger.js";
import { rateLimitExpress, requireSession, setModule } from "../http/index.js";
import { parseQuery } from "../http/validate.js";
import { getWebAppOrigin } from "../auth/verificationMail.js";
import {
  SilpoDisconnectResponseSchema,
  SilpoReceiptDetailDtoSchema,
  SilpoReceiptsPageSchema,
  SilpoReceiptsQuerySchema,
  SilpoSyncResultSchema,
  SilpoSyncStateSchema,
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
} from "../modules/silpo/receipts.js";

/**
 * `GET /api/silpo/connect|callback`, `POST /api/silpo/disconnect|wipe|sync`,
 * `GET /api/silpo/sync-state|receipts|receipts/:id`. Mirrors the Monobank
 * route shape (`routes/mono-webhook.js` + `modules/mono/connection.ts`)
 * where the flow allows — OAuth redirect handshake is new here (Monobank
 * uses a static personal token, no browser round-trip).
 *
 * Every handler is gated by `requireSession()` (registered on the router
 * below) AND `assertSilpoEnabled` (kill switch — spec § Рішення дизайну,
 * "`SILPO_ENABLED` як kill switch"). `SILPO_ENABLED=false` is the default
 * for this walking-skeleton experiment (offer/ToS gate still open).
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
  const userId = getUserId(req as AuthedRequest, res);
  if (!userId) return;

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

  const pending = consumeAuthorizationState(state);
  if (!pending || pending.userId !== userId) {
    // Unknown/expired/replayed state, or a state issued for a different
    // session — never trust it, even though `state` itself is a
    // high-entropy nonce (defense in depth against a stolen callback URL).
    redirectToSettings(res, "error", "invalid_state");
    return;
  }

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
      // Migration 121 has NOT NULL refresh_token_* columns — a code
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

/** Full erasure: `silpo_receipts` cascades to items + `finyk_tx_receipt_links`. User-confirmed `finyk_tx_splits` / pantry-events are NEVER touched. */
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
};
type SyncStateCountRow = { count: string; last_sync_at: Date | string | null };

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
      "SELECT status, access_token_expires_at FROM silpo_connection WHERE user_id = $1",
      [userId],
      { op: "silpo_sync_state_connection" },
    ),
    query<SyncStateCountRow>(
      `SELECT COUNT(*)::text AS count, MAX(created_at) AS last_sync_at
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
      lastSyncAt: toIsoOrNull(counts?.last_sync_at ?? null),
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

  const { limit, cursor } = parseQuery(SilpoReceiptsQuerySchema, req);
  const page = await listReceipts(userId, { limit, cursor });
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

// ──────────────────────────────────── Router ────────────────────────────────

export function createSilpoRouter(): Router {
  const r = Router();
  r.use("/api/silpo", setModule("finyk"));
  r.use("/api/silpo", requireSession());

  r.get(
    "/api/silpo/connect",
    rateLimitExpress({ key: "api:silpo:connect", limit: 10, windowMs: 60_000 }),
    connectHandler,
  );
  r.get(
    "/api/silpo/callback",
    // Same bucket/limit as `connect` — this is the OTHER half of the same
    // authorization_code round-trip, so it should never be hit more often
    // than `connect` redirects the browser here. Reading `code`/`state`
    // from `req.query` inside `callbackHandler` is inherent to the OAuth
    // redirect flow (that's how every authorization_code callback receives
    // them) and is out of scope here — tracked separately.
    rateLimitExpress({
      key: "api:silpo:callback",
      limit: 10,
      windowMs: 60_000,
    }),
    callbackHandler,
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

  return r;
}
