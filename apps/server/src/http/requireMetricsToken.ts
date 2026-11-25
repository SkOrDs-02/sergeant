import type { NextFunction, Request, Response } from "express";
import { env } from "../env/env.js";
import { safeStringEqual } from "./safeCompare.js";

/**
 * Bearer-гейт `METRICS_TOKEN` для ops-ендпоінтів: `/metrics`, `/healthz`,
 * `/health/workers` (sec-40, priv-30; рішення власника 2026-11-21).
 *
 * Чому `/healthz` і `/health/workers` теж за токеном. Обидва роути без
 * rate-limit, на кожен виклик ходять у БД (`/health/workers` робить
 * агрегати по чергах видалення, GDPR і mono) і віддають стан пулу,
 * redis, circuit breaker і `accountDeletion.pending`. Анонімно це і
 * бізнес-сигнал для сторонніх, і дешевий підсилювач навантаження на
 * пул, який ділить healthcheck Coolify. Анонімними лишаються лише
 * короткі проби (`/livez`, `/readyz`, `/health`, `/startupz` і nested
 * `/health/*` аліаси): їх читає Coolify, і вони не торкаються нічого,
 * крім `SELECT 1`.
 *
 * Семантика один в один з тією, що `/metrics` мав раніше:
 *   * токен задано → потрібен `Authorization: Bearer <token>`, інакше
 *     `401 unauthorized` (`text/plain`, без деталей);
 *   * токен не задано → пропускаємо (dev/локально). У проді без
 *     `METRICS_TOKEN` сервер не стартує (`assertStartupEnv`), тож
 *     fail-open тут недосяжний.
 *
 * Порівняння через `safeStringEqual` (поверх `crypto.timingSafeEqual`),
 * щоб не лікати позицію першої розбіжності через branch-timing.
 */
export function hasValidMetricsToken(req: Request): boolean {
  const expected = env.METRICS_TOKEN;
  if (!expected) return true;
  const auth = req.get("authorization") || "";
  const got = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  return safeStringEqual(got, expected);
}

export function requireMetricsToken(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!hasValidMetricsToken(req)) {
    res.status(401).type("text/plain").send("unauthorized");
    return;
  }
  next();
}
