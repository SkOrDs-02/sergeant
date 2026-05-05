import { Router } from "express";
import type { Pool } from "pg";

import { asyncHandler } from "../http/index.js";
import { FTUX_DRIP_CAMPAIGN_FAMILY } from "../email/ftuxDripCopy.js";
import { verifyUnsubscribeToken } from "../email/ftuxUnsubscribeToken.js";
import { logger } from "../obs/logger.js";
import { ftuxDripUnsubscribesTotal } from "../obs/metrics.js";

/**
 * Public-side unsubscribe endpoint, який рендерять footer-и у FTUX-drip-листах.
 *
 *   GET /api/email/unsubscribe?u=<userId>.<hmac>
 *
 * Контракт:
 *   - 200 + HTML "Готово, листи більше не приходитимуть" — токен валідний
 *     (або вже відписаний, або тільки що відписався).
 *   - 200 + HTML "Bad token" + warn-лог — токен невалідний / просрочений
 *     версією.
 *   - 503 + plain text — `BETTER_AUTH_SECRET` не заданий (dev-без-env-ів).
 *
 * Чому 200 для bad-token замість 400/410: GMail / Apple Mail прокачують
 * лінки через свої preview-fetchers (RFC8058 List-Unsubscribe-Post).
 * 4xx у відповідь → preview-fetch ретраїться → юзер бачить broken-link.
 * Сторінка з нейтральним повідомленням працює стабільно.
 *
 * Чому НЕ під `/api/internal/`: це public route, без сесії та bearer-токенів.
 * Захист — HMAC у самому token-і.
 */
export function createEmailUnsubscribeRouter({ pool }: { pool: Pool }): Router {
  const r = Router();

  r.get(
    "/api/email/unsubscribe",
    asyncHandler(async (req, res) => {
      const raw = typeof req.query["u"] === "string" ? req.query["u"] : "";

      const verdict = verifyUnsubscribeToken(raw);
      if (!verdict.ok) {
        if (verdict.reason === "missing_secret") {
          ftuxDripUnsubscribesTotal.inc({ outcome: "missing_secret" });
          res
            .status(503)
            .type("text/plain")
            .send("Unsubscribe service not configured.");
          return;
        }
        ftuxDripUnsubscribesTotal.inc({ outcome: "invalid_token" });
        logger.warn({
          msg: "ftux_drip_unsubscribe_invalid_token",
          reason: verdict.reason,
        });
        res.status(200).type("text/html").send(renderInvalidPage());
        return;
      }

      // Атомарний INSERT з ON CONFLICT — повторний клік той самий лінк
      // повертає 200, але без duplicate-row-у.
      const insert = await pool.query<{ id: string }>(
        `INSERT INTO email_unsubscribes (user_id, campaign_family, source)
         VALUES ($1, $2, 'email_footer')
         ON CONFLICT (user_id, campaign_family) DO NOTHING
         RETURNING id`,
        [verdict.userId, verdict.family],
      );

      const wasNew = insert.rows.length > 0;
      ftuxDripUnsubscribesTotal.inc({
        outcome: wasNew ? "ok" : "already_unsubscribed",
      });
      logger.info({
        msg: wasNew
          ? "ftux_drip_unsubscribe_recorded"
          : "ftux_drip_unsubscribe_repeat_click",
        family: verdict.family,
        userId: verdict.userId,
      });

      res.status(200).type("text/html").send(renderSuccessPage());
    }),
  );

  return r;
}

/**
 * Простий self-contained HTML без інлайнових скриптів — щоб page рендерилась
 * однаково й у Gmail-в-таб, і у safari-mobile, і у CLI-fetch-провайдерах.
 * Без зовнішніх ресурсів — Gmail/Outlook агресивно блокують їх anyway.
 */
function renderSuccessPage(): string {
  return baseHtml(
    "Відписано",
    `<h1 style="margin:0 0 16px;font-size:22px">Готово.</h1>
     <p style="margin:0 0 12px;font-size:15px;color:#1f2937">
       Більше листів від ${escapeHtml(FTUX_DRIP_CAMPAIGN_FAMILY)} не приходитиме.
     </p>
     <p style="margin:0;font-size:14px;color:#475569">
       Якщо передумаєш — напиши нам відповіддю на будь-який попередній лист,
       і ми повернемо дрипи назад.
     </p>`,
  );
}

function renderInvalidPage(): string {
  return baseHtml(
    "Невалідне посилання",
    `<h1 style="margin:0 0 16px;font-size:22px">Це посилання вже не діє.</h1>
     <p style="margin:0;font-size:15px;color:#1f2937">
       Можливо, ти вже відписався раніше. Якщо листи продовжують приходити —
       відповідай на будь-який, і ми вручну вимкнемо розсилку.
     </p>`,
  );
}

function baseHtml(title: string, body: string): string {
  return `<!doctype html>
<html lang="uk">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${escapeHtml(title)} — Sergeant</title>
</head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;color:#0f172a">
<main style="max-width:520px;margin:48px auto;padding:32px;background:#fff;border-radius:12px;box-shadow:0 1px 3px rgba(15,23,42,0.06)">
${body}
</main>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
