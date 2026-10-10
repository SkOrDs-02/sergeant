import { createHmac, timingSafeEqual } from "node:crypto";
import net from "node:net";
import type { NextFunction, Request, Response } from "express";
import { env } from "../env.js";

/**
 * Підписаний IP клієнта від Vercel Edge Middleware (rel-03, SECURITY-20260804-1-1).
 *
 * Проблема: веб ходить на API через `apps/web/middleware.ts` (Vercel Edge).
 * Express бачить лише egress-адресу Vercel (`req.ip` при `trust proxy=1`),
 * тож усі per-IP бакети (auth 5/60 с, анонімна AI-квота) спільні для всіх
 * веб-користувачів вузла.
 *
 * Рішення (рішення власника 2026-10): middleware бере IP клієнта з першого
 * значення `x-forwarded-for` (Vercel його перезаписує), кладе в
 * `x-sergeant-client-ip` і додає `x-sergeant-client-ip-sig` =
 * base64url(HMAC-SHA256(SERGEANT_CLIENT_IP_SECRET, ip)). Сам секрет у
 * заголовок не потрапляє. Сервер довіряє IP з заголовка ЛИШЕ за timing-safe
 * збігу підпису; інакше (немає секрету, немає/хибний підпис) — рівно
 * попередня поведінка (`req.ip`).
 *
 * AI-CONTEXT: підпис прив'язаний лише до IP, без часової мітки. Реплей
 * безпечний: підпис для IP X дає право заявити лише IP X, а підробити
 * підпис для чужого IP без секрету неможливо.
 */

export const CLIENT_IP_HEADER = "x-sergeant-client-ip";
export const CLIENT_IP_SIG_HEADER = "x-sergeant-client-ip-sig";
/**
 * Внутрішній заголовок для Better Auth (`advanced.ipAddress.ipAddressHeaders`).
 * Клієнтське значення стирається `clientIpMiddleware` ще до роутів, а ставимо
 * його лише після перевірки підпису — тож підробити його неможливо.
 */
export const RESOLVED_CLIENT_IP_HEADER = "x-sergeant-resolved-client-ip";

/**
 * Порядок заголовків для Better Auth `advanced.ipAddress.ipAddressHeaders`:
 * перевірений IP першим, далі стара поведінка. Без секрету першого заголовка
 * немає (middleware його лише стирає), тож лишається `x-forwarded-for`.
 */
export const AUTH_IP_ADDRESS_HEADERS: string[] = [
  RESOLVED_CLIENT_IP_HEADER,
  "x-forwarded-for",
];

function firstHeader(
  headers: Request["headers"],
  name: string,
): string | undefined {
  const raw = headers[name];
  const v = Array.isArray(raw) ? raw[0] : raw;
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

/**
 * Повертає IP із заголовка, якщо підпис збігається; інакше `undefined`.
 * Без `secret` завжди `undefined` (фіча вимкнена).
 */
export function verifySignedClientIp(
  headers: Request["headers"],
  secret: string | undefined,
): string | undefined {
  if (!secret) return undefined;
  const ip = firstHeader(headers, CLIENT_IP_HEADER);
  const sig = firstHeader(headers, CLIENT_IP_SIG_HEADER);
  if (!ip || !sig || net.isIP(ip) === 0) return undefined;
  const expected = createHmac("sha256", secret).update(ip).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return undefined;
  return timingSafeEqual(a, b) ? ip : undefined;
}

/**
 * Єдиний резолвер IP клієнта: підписаний заголовок (якщо секрет заданий і
 * підпис валідний), інакше `req.ip`. Його використовують rate-limit, aiQuota,
 * access-log, session-drift; Better Auth бачить той самий IP через
 * `RESOLVED_CLIENT_IP_HEADER`.
 */
export function getClientIp(req: Request): string | undefined {
  const signed = verifySignedClientIp(
    req?.headers ?? {},
    env.SERGEANT_CLIENT_IP_SECRET,
  );
  if (signed) return signed;
  const fromExpress = req?.ip;
  return typeof fromExpress === "string" && fromExpress.trim()
    ? fromExpress.trim()
    : undefined;
}

/**
 * Стирає клієнтські копії службових заголовків і, якщо підпис валідний,
 * виставляє `x-sergeant-resolved-client-ip`. Мусить стояти ДО Better Auth.
 * Без секрету заголовок не ставиться, Better Auth працює як раніше
 * (`x-forwarded-for`).
 */
export function clientIpMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  delete req.headers[RESOLVED_CLIENT_IP_HEADER];
  const signed = verifySignedClientIp(
    req.headers,
    env.SERGEANT_CLIENT_IP_SECRET,
  );
  if (signed) req.headers[RESOLVED_CLIENT_IP_HEADER] = signed;
  next();
}
