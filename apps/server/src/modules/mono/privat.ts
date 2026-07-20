import type { Request, Response } from "express";
import { bankProxyFetch } from "../../lib/bankProxy.js";
import { parseQuery } from "../../http/validate.js";
import { PrivatQuerySchema } from "../../http/schemas.js";
import { logger } from "../../obs/logger.js";

/**
 * `/api/privat` — проксі до PrivatBank merchant API. CORS/rate-limit/tag
 * зроблені middleware-ами роутера; тут — лише upstream credentials,
 * path-валідація, CRLF-фільтр заголовків і делегація transport-шару в
 * `bankProxy.js` (timeout/retry/breaker/TTL-cache).
 *
 * Upstream error bodies (HTML/JSON blobs) ніколи не ехояться клієнту —
 * лише стабільний `{ error, code?, requestId? }`. Truncated `upstreamBody`
 * лишається в server logs для дебагу.
 */
const ALLOWED_PATHS = ["/statements/balance/final", "/statements/transactions"];

const UPSTREAM_BODY_LOG_MAX = 200;

type ReqWithId = Request & { requestId?: string };

function clientErrorPayload(
  req: Request,
  error: string,
  code: string,
): { error: string; code: string; requestId?: string } {
  const requestId = (req as ReqWithId).requestId;
  return requestId ? { error, code, requestId } : { error, code };
}

export default async function handler(
  req: Request,
  res: Response,
): Promise<void> {
  const merchantId = req.headers["x-privat-id"];
  const merchantToken = req.headers["x-privat-token"];

  if (!merchantId || !merchantToken) {
    res.status(401).json({ error: "Credentials відсутні" });
    return;
  }

  const parsedQ = parseQuery(PrivatQuerySchema, req);
  const path = String(parsedQ.path || "/statements/balance/final");

  const pathAllowed = ALLOWED_PATHS.some(
    (p) => path === p || path.startsWith(p + "/"),
  );
  if (!pathAllowed) {
    res.status(400).json({ error: "Недозволений API шлях" });
    return;
  }

  // Відкидаємо небезпечні символи у значеннях заголовків (CRLF-injection захист).
  const safeHeader = (v: unknown): string | null => {
    const s = String(v);
    if (/[\r\n]/.test(s)) return null;
    return s;
  };
  const safeId = safeHeader(merchantId);
  const safeToken = safeHeader(merchantToken);
  if (!safeId || !safeToken) {
    res.status(400).json({ error: "Недозволений заголовок" });
    return;
  }

  const queryParams = new URLSearchParams(req.query as Record<string, string>);
  queryParams.delete("path");
  const query = Object.fromEntries(queryParams.entries());

  const { status, body, contentType, retryAfter } = await bankProxyFetch({
    upstream: "privatbank",
    baseUrl: "https://acp.privatbank.ua/api",
    path,
    query,
    headers: {
      id: safeId,
      token: safeToken,
      "Content-Type": "application/json;charset=utf-8",
    },
    cacheKeySecret: `${safeId}|${safeToken}`,
  });

  if (status < 200 || status >= 300) {
    // PrivatBank на 429 може віддати Retry-After — пропагуємо клієнту, як
    // раніше робив legacy `/api/mono` proxy.
    if (status === 429 && retryAfter) {
      res.setHeader("Retry-After", retryAfter);
    }

    logger.warn({
      msg: "privatbank_proxy_upstream_error",
      status,
      path,
      upstreamBody: body.slice(0, UPSTREAM_BODY_LOG_MAX),
    });

    if (status === 429) {
      res
        .status(429)
        .json(clientErrorPayload(req, "Занадто багато запитів", "RATE_LIMIT"));
      return;
    }
    if (status === 401 || status === 403) {
      res
        .status(status)
        .json(
          clientErrorPayload(
            req,
            "Невірні credentials PrivatBank",
            "PRIVAT_CREDENTIALS_INVALID",
          ),
        );
      return;
    }
    res
      .status(status)
      .json(
        clientErrorPayload(req, `Помилка ${status}`, "PRIVAT_UPSTREAM_ERROR"),
      );
    return;
  }

  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch {
    res.setHeader("Content-Type", contentType || "text/plain; charset=utf-8");
    res.status(status).send(body);
    return;
  }
  res.status(200).json(data);
}
