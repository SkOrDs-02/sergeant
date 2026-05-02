import type { Request, RequestHandler } from "express";

type WithGroqKey = Request & { groqKey?: string };

/**
 * Guard для ендпоінтів, що викликають Groq (Whisper). Читає `GROQ_API_KEY`,
 * кладе у `req.groqKey`, або віддає 503 якщо ключ не сконфігурований.
 *
 * Аналог `requireAnthropicKey()`. 503 точніше 500: це не внутрішня помилка,
 * а проблема конфігурації деплою. Фронт використовує цей сигнал як
 * маркер: при 503 переключитися на Web Speech API fallback.
 */
export function requireGroqKey(): RequestHandler {
  return (req, res, next) => {
    const key = process.env.GROQ_API_KEY;
    if (!key) {
      res.status(503).json({
        error: "GROQ_API_KEY не сконфігурований",
        code: "GROQ_KEY_MISSING",
      });
      return;
    }
    (req as WithGroqKey).groqKey = key;
    next();
  };
}
