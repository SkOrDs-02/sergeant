import type { RequestHandler } from "express";
import { safeStringEqual } from "./safeCompare.js";

/**
 * Guard для ендпоінтів, які викликаються лише внутрішніми cron/worker-ами:
 * очікується `X-Api-Secret` що збігається зі значенням `envVarName`. Якщо
 * секрет в env не заданий — ендпоінт недоступний (503), це свідомий вибір,
 * щоб випадково не експонувати адмінські операції у dev без секрету.
 *
 * Порівняння через constant-time `safeStringEqual` — `===` / `!==` на
 * 32+ байтах секрета leak-ить позицію першого розбіжного байта через
 * CPU branch timing і дозволяє remote-атакеру статистично відновити
 * секрет байт за байтом.
 */
export function requireApiSecret(envVarName: string): RequestHandler {
  return (req, res, next) => {
    const expected = process.env[envVarName];
    if (!expected) {
      res
        .status(503)
        .json({ error: "Ендпоінт не сконфігурований", code: "NOT_CONFIGURED" });
      return;
    }
    const got = req.headers["x-api-secret"];
    const gotStr =
      typeof got === "string" ? got : Array.isArray(got) ? got[0] : undefined;
    if (!safeStringEqual(gotStr, expected)) {
      res.status(401).json({ error: "Невірний секрет", code: "UNAUTHORIZED" });
      return;
    }
    next();
  };
}
