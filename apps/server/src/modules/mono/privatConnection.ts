import type { Request, Response } from "express";
import { bankProxyFetch } from "../../lib/bankProxy.js";
import { logger } from "../../obs/logger.js";
import {
  AppError,
  ExternalServiceError,
  UnauthorizedError,
  ValidationError,
} from "../../obs/errors.js";
import {
  savePrivatCredentials,
  deletePrivatCredentials,
  getPrivatStatus,
} from "./privatStore.js";

/**
 * POST /api/privat/connect    — validate + persist PrivatBank credentials.
 * POST /api/privat/disconnect — wipe them.
 * GET  /api/privat/status     — is a connection present, and for which id.
 *
 * All three require an authenticated session (enforced by the router).
 * Spec: `docs/work/specs/beta-security-readiness.md` (F1).
 *
 * The credentials are validated against the upstream balance endpoint before
 * being stored. This is not gold-plating: the previous client-side flow
 * validated on save too, so skipping it would turn an immediate "wrong token"
 * message into a connection that looks fine and fails later on first sync.
 */

/** Cheapest authenticated PrivatBank call — used purely as a credential probe. */
const VALIDATE_PATH = "/statements/balance/final";

function getUserId(req: Request): string {
  const userId = (req as Request & { user?: { id?: string } }).user?.id;
  if (!userId) {
    throw new UnauthorizedError("Потрібна автентифікація");
  }
  return userId;
}

export async function privatConnectHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const userId = getUserId(req);

  const body = (req.body ?? {}) as { merchantId?: unknown; token?: unknown };
  const merchantId =
    typeof body.merchantId === "string" ? body.merchantId.trim() : "";
  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (!merchantId || !token) {
    throw new ValidationError("Введи Merchant ID та токен");
  }
  // CRLF у значенні заголовка дозволив би дописати власні заголовки в
  // upstream-запит — відкидаємо на вході, а не перед кожним проксі-викликом.
  if (/[\r\n]/.test(merchantId) || /[\r\n]/.test(token)) {
    throw new ValidationError("Недозволені символи в credentials");
  }

  const probe = await bankProxyFetch({
    upstream: "privatbank",
    baseUrl: "https://acp.privatbank.ua/api",
    path: VALIDATE_PATH,
    query: { country: "UA", showRest: "true" },
    headers: {
      id: merchantId,
      token,
      "Content-Type": "application/json;charset=utf-8",
    },
    cacheKeySecret: `${merchantId}|${token}`,
  });

  if (probe.status === 401 || probe.status === 403) {
    throw new AppError("Неправильні дані входу PrivatBank", {
      status: probe.status,
      code: "PRIVAT_CREDENTIALS_INVALID",
    });
  }
  if (probe.status < 200 || probe.status >= 300) {
    // Тіло upstream-помилки клієнту не віддаємо (може містити внутрішні
    // деталі банку) — лише стабільний код.
    logger.warn({
      msg: "privat_connect_probe_failed",
      status: probe.status,
    });
    throw new ExternalServiceError("ПриватБанк недоступний", {
      code: "PRIVAT_UPSTREAM_ERROR",
    });
  }

  try {
    await savePrivatCredentials(userId, { merchantId, token });
  } catch (err) {
    logger.error({
      msg: "privat_connect_persist_failed",
      err: err instanceof Error ? err.message : String(err),
    });
    throw new AppError("Не вдалося зберегти підключення", {
      status: 500,
      cause: err,
    });
  }

  logger.info({ event: "privat.connected" });
  res.status(200).json({ connected: true, merchantId });
}

export async function privatDisconnectHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const userId = getUserId(req);
  await deletePrivatCredentials(userId);
  logger.info({ event: "privat.disconnected" });
  res.status(200).json({ connected: false });
}

export async function privatStatusHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const userId = getUserId(req);
  res.status(200).json(await getPrivatStatus(userId));
}
