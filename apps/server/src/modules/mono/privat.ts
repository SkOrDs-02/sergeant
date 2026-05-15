import type { Request, Response } from "express";
import { bankProxyFetch } from "../../lib/bankProxy.js";
import { parseQuery } from "../../http/validate.js";
import { PrivatQuerySchema } from "../../http/schemas.js";

/**
 * `/api/privat` — проксі до PrivatBank merchant API. CORS/rate-limit/tag
 * зроблені middleware-ами роутера; тут — лише upstream credentials,
 * path-валідація, CRLF-фільтр заголовків і делегація transport-шару в
 * `bankProxy.js` (timeout/retry/breaker/TTL-cache).
 */
const ALLOWED_PATHS = ["/statements/balance/final", "/statements/transactions"];

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

  const { status, body, contentType } = await bankProxyFetch({
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
    const errorMessage =
      status === 429
        ? "Занадто багато запитів"
        : status === 401 || status === 403
          ? "Невірні credentials PrivatBank"
          : body || `Помилка ${status}`;
    res.status(status).json({ error: errorMessage });
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
