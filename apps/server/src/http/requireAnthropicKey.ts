import type { Request, RequestHandler } from "express";

type WithAnthropicKey = Request & { anthropicKey?: string };

/**
 * Guard для ендпоінтів, що викликають Anthropic. Читає `ANTHROPIC_API_KEY`,
 * кладе у `req.anthropicKey`, або віддає 503 якщо ключ не сконфігурований.
 *
 * Заміняє повторення `if (!process.env.ANTHROPIC_API_KEY) return 500…` у
 * 11 handler-ах. 503 точніше 500: це не внутрішня помилка, а проблема
 * конфігурації деплою.
 */
export function requireAnthropicKey(): RequestHandler {
  return (req, res, next) => {
    const key = process.env["ANTHROPIC_API_KEY"];
    if (!key) {
      res.status(503).json({ error: "ANTHROPIC_API_KEY не сконфігурований" });
      return;
    }
    (req as WithAnthropicKey).anthropicKey = key;
    next();
  };
}
