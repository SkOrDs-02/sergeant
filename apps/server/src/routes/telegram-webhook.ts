import { Router } from "express";
import type { Request, Response } from "express";
import type { Pool } from "pg";
import { rateLimitExpress, setModule } from "../http/index.js";
import { env } from "../env/env.js";
import { logger } from "../obs/logger.js";
import { createTelegramApiClient } from "../modules/alerts/telegramShipper.js";
import {
  countWaitlistStats,
  formatStatsReply,
  isValidWebhookSecret,
  parseCommand,
  recordStart,
  recordStop,
  START_REPLY_AGAIN,
  START_REPLY_NEW,
  STOP_REPLY,
  type TelegramUpdate,
} from "../modules/telegram/waitlistBot.js";

/**
 * `POST /api/telegram/webhook` — апдейти бота вейтліста бети.
 * Спека: `docs/90-work/planning/specs/telegram-waitlist.md`.
 *
 * **Шлях реєструється БЕЗ `/v1`, хоч зовні викликається як
 * `/api/v1/telegram/webhook`.** `apiVersionRewrite` в `app.ts` переписує
 * `req.url` з `/api/v1/*` на канонічний `/api/*` ДО маршрутизації, тож
 * роутер, зареєстрований на `/api/v1/...`, недосяжний у принципі. Так само
 * влаштовані всі інші роути репо — сюди дивиться перший, хто спробує
 * «явно проставити версію» і зламає ендпоінт удруге.
 *
 * Ендпоінт публічний і анонімний за конструкцією: його викликає Telegram,
 * а не браузер із сесією. Автентифікація — спільний секрет із `setWebhook`
 * у заголовку `X-Telegram-Bot-Api-Secret-Token`.
 *
 * **Головне правило контракту з Telegram: майже все віддає `200`.** Будь-який
 * не-2xx змушує Telegram ретраїти апдейт із наростаючою затримкою, а потім
 * і зовсім призупинити доставку. Тому помилка відправки відповіді, невідома
 * команда чи апдейт без повідомлення — це `200 OK` без дій. Не-`200` лишається
 * рівно там, де ретрай справді потрібен (збій запису в БД) або де приймати
 * запит не можна взагалі (невірний секрет).
 *
 * У OpenAPI не реєструється свідомо: це machine-to-machine webhook, а не
 * public API, який споживає `@sergeant/api-client` — так само, як
 * `/api/csp-report`.
 */
export function createTelegramWebhookRouter({ pool }: { pool: Pool }): Router {
  const r = Router();
  r.use("/api/telegram/webhook", setModule("telegram-waitlist"));

  const handler = async (req: Request, res: Response): Promise<void> => {
    const secret = env.TELEGRAM_WAITLIST_WEBHOOK_SECRET;
    const token = env.TELEGRAM_WAITLIST_BOT_TOKEN;

    // Без конфігу ендпоінт вимкнений. 503, а не 200: якщо Telegram уже шле
    // апдейти, ми хочемо ретраї, а не тихо загублених підписників.
    if (!secret || !token) {
      logger.warn({ msg: "telegram_waitlist_webhook_unconfigured" });
      res.status(503).json({ ok: false });
      return;
    }

    const received = req.headers["x-telegram-bot-api-secret-token"];
    if (
      !isValidWebhookSecret(
        typeof received === "string" ? received : undefined,
        secret,
      )
    ) {
      // Нічого з тіла в лог: там імʼя й хендл (Hard Rule #21).
      logger.warn({ msg: "telegram_waitlist_webhook_bad_secret" });
      res.status(401).json({ ok: false });
      return;
    }

    const update = req.body as TelegramUpdate;
    const message = update?.message;
    const chatId = message?.chat?.id;

    // Приватний діалог від живої людини — єдине, що обробляємо. Апдейти з
    // груп і від інших ботів ігноруємо: підписник вейтліста це той, з ким
    // ми можемо говорити віч-на-віч.
    if (
      typeof chatId !== "number" ||
      message?.chat?.type !== "private" ||
      message?.from?.is_bot === true
    ) {
      res.json({ ok: true });
      return;
    }

    const command = parseCommand(update);
    if (command.kind === "ignore") {
      res.json({ ok: true });
      return;
    }

    // `/stats` — тільки власнику. Чужому не відмовляємо повідомленням, а
    // мовчимо так само, як на будь-яку невідому команду: інакше сама відмова
    // підтверджувала б, що команда існує.
    const adminChatId = env.TELEGRAM_WAITLIST_ADMIN_CHAT_ID;
    if (command.kind === "stats") {
      if (!adminChatId || String(chatId) !== adminChatId) {
        res.json({ ok: true });
        return;
      }
    }

    let reply: string;
    try {
      if (command.kind === "stats") {
        reply = formatStatsReply(await countWaitlistStats(pool));
      } else if (command.kind === "stop") {
        await recordStop(pool, chatId);
        reply = STOP_REPLY;
      } else {
        const { created } = await recordStart(pool, {
          chatId,
          username: message.from?.username ?? null,
          firstName: message.from?.first_name ?? null,
          languageCode: message.from?.language_code ?? null,
          startPayload: command.payload,
        });
        reply = created ? START_REPLY_NEW : START_REPLY_AGAIN;
      }
    } catch (err) {
      // Єдиний випадок, де ретрай справді потрібен: апдейт не втрачається.
      logger.error({
        msg: "telegram_waitlist_persist_failed",
        err: { message: err instanceof Error ? err.message : String(err) },
      });
      res.status(500).json({ ok: false });
      return;
    }

    // Відповідь боту — поза транзакцією успіху. Людина вже в списку; якщо
    // Telegram не прийме повідомлення, повторний ретрай апдейта лише
    // задублював би відповідь, а запис і так ідемпотентний.
    try {
      await createTelegramApiClient(token).sendMessage({
        chatId: String(chatId),
        text: reply,
      });
    } catch (err) {
      logger.warn({
        msg: "telegram_waitlist_reply_failed",
        err: { message: err instanceof Error ? err.message : String(err) },
      });
    }

    res.json({ ok: true });
  };

  r.post(
    "/api/telegram/webhook",
    // Telegram шле апдейти з обмеженого пулу IP; ліміт тут — захист від
    // флуду на випадок, якщо секрет колись витече, а не від самого Telegram.
    rateLimitExpress({
      key: "api:telegram-waitlist",
      limit: 600,
      windowMs: 60_000,
    }),
    handler,
  );

  return r;
}
