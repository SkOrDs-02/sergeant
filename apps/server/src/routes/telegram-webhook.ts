import { Router } from "express";
import type { Request, Response } from "express";
import type { Pool } from "pg";
import {
  ANALYTICS_EVENTS,
  newLandingRef,
  parseLandingStartPayload,
} from "@sergeant/shared";
import { rateLimitExpress, setModule } from "../http/index.js";
import { env } from "../env/env.js";
import { logger } from "../obs/logger.js";
import { capturePostHogEvent } from "../lib/posthogCapture.js";
import {
  createTelegramApiClient,
  type TelegramApiClient,
} from "../modules/alerts/telegramShipper.js";
import {
  countWaitlistStats,
  formatStatsReply,
  isValidWebhookSecret,
  parseCommand,
  recordStart,
  recordStop,
  recordStopReason,
  recordSurveyAnswer,
  resolveUpdateOrigin,
  type ParsedCommand,
  type TelegramUpdate,
} from "../modules/telegram/waitlistBot.js";
import {
  appReply,
  helpReply,
  installReply,
  startReplyQueued,
  surveyAnsweredText,
  START_REPLY_AGAIN,
  START_REPLY_NEW,
  STOP_REASON_ACK,
  STOP_REPLY,
  SURVEY_ACCEPTED_TOAST,
  SURVEY_ALREADY_ANSWERED_TOAST,
  type BetaLinks,
} from "../modules/telegram/betaTexts.js";

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
    const origin = resolveUpdateOrigin(update);

    // Інші боти — завжди тиша, у будь-якому типі чату.
    if (typeof origin.chatId !== "number" || origin.fromBot) {
      res.json({ ok: true });
      return;
    }
    const chatId = origin.chatId;

    const command = parseCommand(update);
    if (command.kind === "ignore") {
      res.json({ ok: true });
      return;
    }

    // Поза приватним діалогом дозволені лише довідкові команди.
    //
    // Раніше тут стояв суцільний `chatType !== "private"` — апдейт із групи
    // відсікався до парсингу, тож бот мовчав на все. Це помітили, коли його
    // додали в чат: людина бачить бота в списку учасників і природно очікує
    // бодай `/help`.
    //
    // Але пустити ВСЕ не можна, і причина не в обережності, а в моделі
    // даних: `chat_id` — це ключ підписника. У групі він належить групі, не
    // людині. `/start` завів би підписником саму групу, `/stop` відписав би
    // її за одним учасником, а `/stats` звіряється з
    // `TELEGRAM_WAITLIST_ADMIN_CHAT_ID` — ід власника, якого в груповому
    // апдейті просто нема. Кнопки опитування редагують конкретне надіслане
    // повідомлення й теж мають сенс лише віч-на-віч.
    //
    // `app` / `install` / `help` вільні від цього цілком: це статичний
    // текст із `betaTexts.ts`, вони не читають і не пишуть БД і не залежать
    // від того, чий це `chat_id`. Тому allowlist, а не blocklist — нова
    // команда за замовчуванням лишається приватною, і забути про це
    // неможливо.
    //
    // Privacy mode тут ні до чого: Telegram доставляє боту повідомлення, що
    // починаються зі слеша, і в групах теж. Єдиним гейтом був цей код.
    const GROUP_SAFE_COMMANDS = ["app", "install", "help"] as const;
    const inGroup = origin.chatType !== "private";
    if (inGroup) {
      const groupSafe = (GROUP_SAFE_COMMANDS as readonly string[]).includes(
        command.kind,
      );
      if (!groupSafe) {
        res.json({ ok: true });
        return;
      }
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

    const client = createTelegramApiClient(token);

    // Натискання кнопки живе за окремим протоколом: там не `sendMessage`, а
    // квитанція на callback плюс редагування вже надісланого повідомлення.
    if (command.kind === "survey") {
      await handleSurvey(pool, client, chatId, command, res);
      return;
    }

    let reply: string | null;
    try {
      reply = await composeReply(pool, chatId, command, update, inGroup);
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
    if (reply !== null) {
      try {
        await client.sendMessage({ chatId: String(chatId), text: reply });
      } catch (err) {
        logger.warn({
          msg: "telegram_waitlist_reply_failed",
          err: { message: err instanceof Error ? err.message : String(err) },
        });
      }
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

/**
 * Посилання бети з оточення. Порожні значення — легальні: тексти вміють
 * пропускати ненастроєний канал замість того, щоб лишати діру в інструкції.
 */
function betaLinks(): BetaLinks {
  return {
    appUrl: env.TELEGRAM_BETA_APP_URL,
    groupLink: env.TELEGRAM_BETA_INVITE_LINK,
    founderUsername: env.TELEGRAM_BETA_FOUNDER_USERNAME,
  };
}

/**
 * Текст відповіді на текстову команду. `null` — свідома тиша.
 *
 * Кидає далі будь-яку помилку БД: рішення «ретраїти чи ні» ухвалює handler,
 * бо тільки він володіє відповіддю Express.
 */
async function composeReply(
  pool: Pool,
  chatId: number,
  command: Exclude<ParsedCommand, { kind: "ignore" } | { kind: "survey" }>,
  update: TelegramUpdate,
  inGroup: boolean,
): Promise<string | null> {
  const links = betaLinks();

  switch (command.kind) {
    case "stats":
      return formatStatsReply(await countWaitlistStats(pool));

    case "app":
      return appReply(links);

    case "install":
      return installReply(links);

    case "help":
      return helpReply(links, inGroup);

    case "stop":
      await recordStop(pool, chatId);
      return STOP_REPLY;

    case "text": {
      // Довільний текст має сенс рівно в одному стані — коли після `/stop`
      // ми питали «чому». В усіх інших випадках бот мовчить, як мовчав
      // завжди: він не співрозмовник, а канал розсилки.
      const recorded = await recordStopReason(pool, chatId, command.text);
      return recorded ? STOP_REASON_ACK : null;
    }

    case "start": {
      const { created, position } = await recordStart(pool, {
        chatId,
        username: update.message?.from?.username ?? null,
        firstName: update.message?.from?.first_name ?? null,
        languageCode: update.message?.from?.language_code ?? null,
        startPayload: command.payload,
      });
      reportLandingStart(command.payload, created);
      // Позиція стабільна, тож повторний /start за межами хвилі покаже той
      // самий номер — гілка навмисно перевіряється ДО `created`.
      if (position > env.TELEGRAM_BETA_WAVE_SIZE)
        return startReplyQueued(position);
      return created ? START_REPLY_NEW : START_REPLY_AGAIN;
    }
  }
}

/**
 * Друга половина воронки лендінга.
 *
 * До 2026-08-16 вона не існувала в PostHog взагалі: клієнт бачив
 * `landing_telegram_clicked` і на цьому слід обривався, а `/start`-и рахувались
 * окремо як `COUNT(telegram_waitlist)` у БД. Дві системи, ручне зведення — і
 * через це воронка «лендінг → бот» показувала нуль, хоча CTR по кнопці був 28%
 * (39 кліків із 136 переглядів за 30 днів).
 *
 * Fire-and-forget свідомо. Telegram ретраїть апдейт, поки не отримає `200`, а
 * `capturePostHogEvent` ходить у мережу з 5-секундним таймаутом — чекати на
 * нього означало б плодити дублі `/start` на кожному тормозі аналітики.
 * Телеметрія не має права впливати на відповідь боту.
 */
function reportLandingStart(payload: string | null, created: boolean): void {
  const attribution = parseLandingStartPayload(payload);

  void capturePostHogEvent({
    event: ANALYTICS_EVENTS.LANDING_TELEGRAM_STARTED,
    // Join-ключ — саме `ref`, і він же `distinct_id`, щоб зшивання було видно
    // в UI PostHog без SQL. Коли атрибуції немає (пряме посилання, переслане
    // другом, навігаційний лінк у футері) — разовий випадковий токен: старт
    // усе одно рахується, але окремою анонімною персоною, а не зливається з
    // рештою неатрибутованих у одну фейкову людину.
    //
    // `chat_id` сюди свідомо НЕ їде: це ідентифікатор конкретної людини в
    // сторонньому сервісі, і в аналітиці йому робити нічого.
    distinctId: attribution?.ref ?? newLandingRef(),
    properties: {
      placement: attribution?.placement ?? null,
      ref: attribution?.ref ?? null,
      attributed: attribution !== null,
      first_start: created,
    },
  }).catch((err: unknown) => {
    logger.warn({
      msg: "landing_start_capture_failed",
      err: { message: err instanceof Error ? err.message : String(err) },
    });
  });
}

/**
 * Обробка натискання кнопки опитування.
 *
 * Порядок кроків не довільний. Спершу запис у БД — єдине, що не можна
 * втратити. Далі квитанція на callback: без неї клієнт крутить годинник
 * близько 30 секунд, і людина тисне ще раз. І лише потім редагування
 * повідомлення — воно косметичне, і його провал нікого не блокує.
 *
 * Редагуємо тільки на ПЕРШУ зараховану відповідь. Повторне натискання
 * лишає текст як є і показує спливашку: перемальовувати повідомлення тим
 * самим змістом Telegram усе одно відкине з `message is not modified`.
 */
async function handleSurvey(
  pool: Pool,
  client: TelegramApiClient,
  chatId: number,
  command: Extract<ParsedCommand, { kind: "survey" }>,
  res: Response,
): Promise<void> {
  let accepted: boolean;
  try {
    const result = await recordSurveyAnswer(pool, {
      chatId,
      surveyId: command.survey.id,
      answer: command.answer,
    });
    accepted = result.accepted;
  } catch (err) {
    logger.error({
      msg: "telegram_waitlist_survey_persist_failed",
      surveyId: command.survey.id,
      err: { message: err instanceof Error ? err.message : String(err) },
    });
    res.status(500).json({ ok: false });
    return;
  }

  try {
    await client.answerCallbackQuery({
      callbackQueryId: command.callbackQueryId,
      text: accepted ? SURVEY_ACCEPTED_TOAST : SURVEY_ALREADY_ANSWERED_TOAST,
    });

    if (accepted && command.messageId !== null) {
      const label =
        command.survey.options.find((o) => o.value === command.answer)?.label ??
        command.answer;
      await client.editMessageText({
        chatId: String(chatId),
        messageId: command.messageId,
        text: surveyAnsweredText(command.survey, label),
      });
    }
  } catch (err) {
    // Відповідь уже в базі — це головне. Мережеві дрібниці лише логуємо,
    // інакше ретрай Telegram спробував би записати голос удруге.
    logger.warn({
      msg: "telegram_waitlist_survey_ack_failed",
      err: { message: err instanceof Error ? err.message : String(err) },
    });
  }

  res.json({ ok: true });
}
