import { Router } from "express";
import { toNodeHandler } from "better-auth/node";
import { auth } from "../auth.js";
import {
  authMetricsMiddleware,
  authSensitiveRateLimit,
} from "../http/index.js";

/**
 * `/api/auth/*` — Better Auth mount.
 *
 * Router навмисно мапить повний шлях (`/api/auth/*`) і мoнтується до app
 * через `app.use(router)` (без префіксу). Це зберігає `req.url` у вигляді
 * `/api/auth/sign-in`, як очікує Better Auth handler.
 *
 * `authMetricsMiddleware` МАЄ йти перед rate-limiter-ом: він тільки вішає
 * `res.on("finish")` і кличе `next()`, тож навіть якщо лімітер відстрілить
 * 429, finish-listener все одно спрацює і метрика інкрементнеться коректно.
 */
export function createAuthRouter(): Router {
  const r = Router();
  r.use("/api/auth", authMetricsMiddleware);
  r.use("/api/auth", authSensitiveRateLimit);
  // Express 5 / path-to-regexp v8: wildcards must be named. `{*splat}` is the
  // root-inclusive named wildcard — it matches `/api/auth` and every sub-path
  // (`/api/auth/sign-in`, `/api/auth/callback/*`, …), preserving the Express 4
  // `/api/auth/*` mount that Better Auth's `toNodeHandler` relies on.
  r.all("/api/auth/{*splat}", toNodeHandler(auth));
  return r;
}
