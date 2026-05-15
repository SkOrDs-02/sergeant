import type { Request, RequestHandler } from "express";
import { env } from "../env.js";

type WithGroqKey = Request & { groqKey?: string };

/**
 * Guard для ендпоінтів, що викликають Groq (Whisper). Читає `GROQ_API_KEY`,
 * кладе у `req.groqKey`, або віддає 503 якщо ключ не сконфігурований.
 *
 * Аналог `requireAnthropicKey()`. 503 точніше 500: це не внутрішня помилка,
 * а проблема конфігурації деплою. Фронт використовує цей сигнал як
 * маркер: при 503 переключитися на Web Speech API fallback.
 *
 * Env-single-source: читає Zod-validated `env.GROQ_API_KEY`, не raw
 * `process.env`. E2E tests, що бутстрапять реальний `createApp()` через
 * `await import("../app.js")` після `process.env["GROQ_API_KEY"] = "…"`,
 * продовжують працювати — `env.ts` парсить `process.env` при першому
 * eval-і модуля, який триггериться dynamic-import-ом *після* test setup-у.
 */
export function requireGroqKey(): RequestHandler {
  return (req, res, next) => {
    const key = env.GROQ_API_KEY;
    if (!key) {
      // Не світимо назву env-змінної клієнту: вона потрапляє у formatApiError
      // і показується юзеру дослівно. Дискримінатор для frontend — `code`.
      res.status(503).json({
        error: "Голосове введення тимчасово недоступне. Спробуй пізніше.",
        code: "GROQ_KEY_MISSING",
      });
      return;
    }
    (req as WithGroqKey).groqKey = key;
    next();
  };
}
