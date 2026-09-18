import { timingSafeEqual } from "node:crypto";
import type { Pool } from "pg";
import {
  resolveLandingPlacement,
  type LandingPlacement,
} from "@sergeant/shared";
import { SURVEYS, type SurveyDefinition } from "./betaTexts.js";

/**
 * Telegram-вейтліст: обробка апдейтів бота бети.
 * Спека: `docs/work/specs/telegram-waitlist.md`.
 *
 * Модуль свідомо не знає про Express — це чисті функції над `Pool` плюс
 * парсер апдейта. Роутер лишається тонким, а логіка тестується без HTTP.
 *
 * Тексти відповідей і визначення опитувань живуть у `betaTexts.ts`.
 */

/** Мінімальна форма Telegram-апдейта, яка нас цікавить. */
export interface TelegramUpdate {
  message?: {
    chat?: { id?: number; type?: string };
    from?: {
      id?: number;
      is_bot?: boolean;
      username?: string;
      first_name?: string;
      language_code?: string;
    };
    text?: string;
  };
  /**
   * Натискання inline-кнопки. Приходить ОКРЕМИМ типом апдейта, а не як
   * повідомлення, і чат тут лежить на рівень глибше — у `message`, до якого
   * кнопка причеплена. Саме тому роутер не може взяти `chat.id` в одному
   * місці для обох випадків.
   */
  callback_query?: {
    id?: string;
    from?: { id?: number; is_bot?: boolean };
    message?: {
      message_id?: number;
      chat?: { id?: number; type?: string };
    };
    data?: string;
  };
}

export type ParsedCommand =
  | { kind: "start"; payload: string | null }
  | { kind: "stop" }
  | { kind: "stats" }
  | { kind: "app" }
  | { kind: "install" }
  | { kind: "help" }
  /**
   * Відповідь на мікро-опитування. `callbackQueryId` обовʼязковий: без
   * `answerCallbackQuery` кнопка в клієнті крутить годинник близько 30
   * секунд, і людина встигає натиснути ще раз.
   */
  | {
      kind: "survey";
      survey: SurveyDefinition;
      answer: string;
      callbackQueryId: string;
      messageId: number | null;
    }
  /**
   * Довільний текст без команди. Раніше він одразу ставав `ignore`; тепер
   * доїжджає до роутера, бо може виявитись причиною відписки. Чи чекаємо ми
   * на неї — знає БАЗА, не парсер: інакше довелось би тягнути стан у чисту
   * функцію.
   */
  | { kind: "text"; text: string }
  | { kind: "ignore" };

/**
 * Telegram обмежує `start`-payload 64 символами й набором `[A-Za-z0-9_-]`.
 * Все, що поза цим, — не наш deep link, а ручний ввід; такий payload
 * відкидаємо, щоб у колонці атрибуції не осідало сміття.
 */
const PAYLOAD_RE = /^[A-Za-z0-9_-]{1,64}$/;

/** Префікс `callback_data` опитувань: `s:<survey_id>:<answer>`. */
export const SURVEY_CALLBACK_PREFIX = "s";

/**
 * Telegram ріже `callback_data` на 64 БАЙТАХ і мовчки відкидає кнопку, що
 * не влізла. Перевіряється в тесті на кожному оголошеному опитуванні —
 * ран-тайм-валідація тут нічого не врятує: до продакшена кнопка або є, або
 * її немає.
 */
export const CALLBACK_DATA_MAX_BYTES = 64;

export function encodeSurveyCallback(surveyId: string, answer: string): string {
  return `${SURVEY_CALLBACK_PREFIX}:${surveyId}:${answer}`;
}

export interface InlineKeyboardButton {
  text: string;
  callback_data: string;
}

export interface InlineKeyboardMarkup {
  inline_keyboard: InlineKeyboardButton[][];
}

/**
 * Клавіатура опитування — один ряд.
 *
 * Один ряд, а не сітка: варіантів завжди небагато (шкала 1–5), і Telegram
 * сам стискає кнопки під ширину екрана. Розкладка по рядах знадобиться
 * тільки коли зʼявиться питання з довгими підписами — тоді й додамо.
 */
export function buildSurveyKeyboard(
  survey: SurveyDefinition,
): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      survey.options.map((o) => ({
        text: o.label,
        callback_data: encodeSurveyCallback(survey.id, o.value),
      })),
    ],
  };
}

/**
 * Розбір натискання inline-кнопки.
 *
 * `data` звіряється з каталогом `SURVEYS`, а не парситься довільно. Причина
 * прозаїчна: повідомлення з кнопками лишається в чаті назавжди, і через
 * місяць хтось натисне кнопку опитування, якого вже немає в коді. Без
 * звірки такий рядок поїхав би в БД і зіпсував агрегат — а FK його б не
 * спіймав, бо `survey_id` навмисно не має власної таблиці.
 */
function parseCallback(
  callback: NonNullable<TelegramUpdate["callback_query"]>,
): ParsedCommand {
  const id = callback.id;
  const data = callback.data;
  if (!id || !data) return { kind: "ignore" };

  const [prefix, surveyId, answer] = data.split(":");
  if (prefix !== SURVEY_CALLBACK_PREFIX || !surveyId || !answer) {
    return { kind: "ignore" };
  }

  const survey = SURVEYS[surveyId];
  if (!survey) return { kind: "ignore" };
  if (!survey.options.some((o) => o.value === answer))
    return { kind: "ignore" };

  return {
    kind: "survey",
    survey,
    answer,
    callbackQueryId: id,
    messageId: callback.message?.message_id ?? null,
  };
}

export interface UpdateOrigin {
  chatId: number | null;
  chatType: string | null;
  fromBot: boolean;
}

/**
 * Звідки приїхав апдейт — однаково для повідомлення й натискання кнопки.
 *
 * Існує рівно тому, що Telegram кладе чат у двох різних місцях:
 * `message.chat` для тексту і `callback_query.message.chat` для кнопки
 * (бо кнопка причеплена до повідомлення, а не до чату). Роутер, який
 * читав би `update.message.chat.id` напряму, мовчки ігнорував би всі
 * натискання — і це виглядало б як «кнопки не працюють».
 */
export function resolveUpdateOrigin(update: TelegramUpdate): UpdateOrigin {
  const callback = update.callback_query;
  if (callback) {
    return {
      chatId: callback.message?.chat?.id ?? null,
      chatType: callback.message?.chat?.type ?? null,
      fromBot: callback.from?.is_bot === true,
    };
  }

  return {
    chatId: update.message?.chat?.id ?? null,
    chatType: update.message?.chat?.type ?? null,
    fromBot: update.message?.from?.is_bot === true,
  };
}

export function parseCommand(update: TelegramUpdate): ParsedCommand {
  if (update.callback_query) return parseCallback(update.callback_query);

  const text = update.message?.text?.trim();
  if (!text) return { kind: "ignore" };

  // Telegram у групах додає суфікс: `/start@my_bot`.
  const [rawCommand, ...rest] = text.split(/\s+/);
  const command = rawCommand?.split("@")[0]?.toLowerCase();

  if (command === "/stop") return { kind: "stop" };
  // `/stats` парситься для всіх, але відповідає лише власнику — гейт за
  // chat_id живе в роутері. Незнайомець отримує ту саму тишу, що й на
  // будь-яку невідому команду, тож саме існування команди не видає себе.
  if (command === "/stats") return { kind: "stats" };
  if (command === "/app") return { kind: "app" };
  if (command === "/install") return { kind: "install" };
  if (command === "/help") return { kind: "help" };

  if (command === "/start") {
    const payload = rest[0];
    return {
      kind: "start",
      payload: payload && PAYLOAD_RE.test(payload) ? payload : null,
    };
  }

  // Невідома команда лишається тишею: людина явно намагалась звернутись до
  // бота, а не пояснити, чому йде. Причиною відписки вважаємо лише
  // звичайний текст.
  if (text.startsWith("/")) return { kind: "ignore" };

  return { kind: "text", text };
}

/**
 * Звірка спільного секрету з `setWebhook`.
 *
 * Порівняння константне за часом. Це не паранойя заради галочки: ендпоінт
 * публічний, його URL знає Telegram, і єдине, що відділяє нас від чужих
 * записів у список — саме цей рядок.
 */
export function isValidWebhookSecret(
  received: string | undefined,
  expected: string,
): boolean {
  if (!expected || !received) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  // `timingSafeEqual` кидає на різній довжині — довжину звіряємо окремо.
  // Сама довжина секрету не таємниця.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export interface StartInput {
  chatId: number;
  username: string | null;
  firstName: string | null;
  languageCode: string | null;
  startPayload: string | null;
}

export interface StartResult {
  /** `true` — це перший `/start` цього чату. */
  created: boolean;
  /**
   * Місце в черзі на наступний раунд, рахуючи з 1: скільки людей попереду
   * ще НЕ отримали інвайт, включно з самим питальником.
   *
   * **До 2026-09-17 це був абсолютний номер рядка** (`count(*) WHERE id <=
   * свій id`), стабільний назавжди. Аргумент на його користь був такий:
   * номер, що стрибає вниз, коли хтось попереду натиснув `/stop`, людина
   * читає як помилку. Практика показала дорожчу ваду. На 37 рядках, де 30
   * уже запрошені й 1 відписався, новачок чув «ти 38-й у черзі» — хоча
   * попереду нього стояло **шестеро**. Число було стабільне і неправдиве,
   * і воно ж вирішувало, яку з відповідей він побачить.
   *
   * Тепер номер рухається — і рухається ВНИЗ, разом із чергою, яку він
   * описує. Це та сама властивість, що колись вважалась вадою, але в
   * тексті «черга рухається швидше, ніж здається» вона є підтвердженням,
   * а не помилкою. Повторний `/start` може показати менше число, ніж
   * попередній, і це правда про стан справ.
   *
   * Для вже запрошеного (`notified_at IS NOT NULL`) номер не має предмета:
   * він у черзі не стоїть, тож сам себе не рахує і отримує число менше за
   * розмір хвилі — тобто відповідь «ти вже в списку», як і раніше.
   */
  position: number;
}

/**
 * Ідемпотентний запис підписника.
 *
 * Telegram ретраїть апдейт, поки не отримає `200`, тож повторний виклик —
 * норма, а не помилка. `ON CONFLICT` оновлює лише знімок профілю й НЕ чіпає
 * `created_at` (інакше людина вічно виглядала б новою) та `notified_at`
 * (інакше повторний `/start` після інвайту повернув би її в чергу розсилки
 * і вона отримала б інвайт удруге).
 *
 * `/start` після `/stop` знімає відписку: явна дія користувача — це згода.
 */
export async function recordStart(
  pool: Pool,
  input: StartInput,
): Promise<StartResult> {
  // `id` — BIGSERIAL, тож pg віддає його РЯДКОМ (Hard Rule #1). Тут він
  // нікуди далі не тече — лише назад у наступний запит як параметр, — тому
  // лишаємо рядком і не коерсимо: Number() на bigint був би втратою точності
  // без жодної потреби.
  const result = await pool.query<{ created: boolean; id: string }>(
    `INSERT INTO telegram_waitlist
       (chat_id, telegram_username, first_name, language_code, start_payload)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (chat_id) DO UPDATE SET
       telegram_username = EXCLUDED.telegram_username,
       first_name        = EXCLUDED.first_name,
       language_code     = EXCLUDED.language_code,
       -- Перший payload лишається: він і є каналом, що привів людину.
       start_payload     = COALESCE(telegram_waitlist.start_payload,
                                    EXCLUDED.start_payload),
       opted_out_at      = NULL,
       -- Повернення скасовує очікування причини виходу. Без цього рядка
       -- перше ж повідомлення того, хто передумав, осіло б у stop_reason.
       stop_reason_awaited_at = NULL
     -- xmax = 0 — канонічний спосіб відрізнити INSERT від UPDATE в
     -- RETURNING після ON CONFLICT. Читати тут старе значення колонки не
     -- можна: RETURNING віддає рядок УЖЕ після UPDATE.
     RETURNING (xmax = 0) AS created, id`,
    [
      input.chatId,
      input.username,
      input.firstName,
      input.languageCode,
      input.startPayload,
    ],
  );

  const row = result.rows[0];
  if (!row) return { created: false, position: 0 };

  // Рахуємо лише тих, хто ще В ЧЕРЗІ: запрошені й відписані місця попереду
  // не займають. Саме цей фільтр — уся суть правки 2026-09-17 (розбір у
  // docstring `StartResult.position`).
  //
  // Порядок усередині черги — за власним `id`, а не за `created_at`: `id`
  // монотонний і не має колізій.
  //
  // Той самий предикат «ще чекає» живе у `broadcast-waitlist.mjs` (кого
  // реально запрошувати) і в `countWaitlistStats` (рядок `Чекають` у
  // `/stats`). Міняєш визначення черги — міняй у всіх трьох, інакше номер
  // розійдеться з розсилкою.
  //
  // Hard Rule #1 — count(*) у pg це bigint, тобто РЯДОК; коерція тут,
  // інакше `position > limit` порівняє рядок із числом і дасть тихо
  // неправильну гілку відповіді.
  const rank = await pool.query<{ position: string }>(
    `SELECT count(*) AS position
       FROM telegram_waitlist
      WHERE id <= $1
        AND notified_at IS NULL
        AND opted_out_at IS NULL`,
    [row.id],
  );

  return {
    created: row.created,
    position: Number(rank.rows[0]?.position ?? 0),
  };
}

/**
 * `/stop`. Рядок не видаляємо: інакше людина, яка відписалась, отримала б
 * інвайт при наступній розсилці як «новий» контакт, якби натиснула Start
 * ще раз. `opted_out_at` — це памʼять про рішення.
 *
 * `COALESCE` тримає ПЕРШУ дату відписки: повторний `/stop` не має вдавати,
 * ніби людина щойно передумала. А от `stop_reason_awaited_at` ставиться
 * заново — бот щоразу питає «чому», і щоразу готовий почути відповідь.
 */
export async function recordStop(pool: Pool, chatId: number): Promise<void> {
  await pool.query(
    `UPDATE telegram_waitlist
        SET opted_out_at           = COALESCE(opted_out_at, NOW()),
            stop_reason_awaited_at = NOW()
      WHERE chat_id = $1`,
    [chatId],
  );
}

/**
 * Верхня межа тексту причини. 1000 символів — це вже не «одним рядком», а
 * вичерпний лист; усе, що довше, обрізаємо, щоб у колонці не осідали
 * випадкові простирадла.
 */
export const STOP_REASON_MAX_LEN = 1000;

/**
 * Записує причину відписки, якщо ми справді на неї чекаємо.
 *
 * Один `UPDATE` замість пари «прочитати стан → записати» — і це не
 * мікрооптимізація. Дві операції лишили б вікно, у якому два повідомлення
 * поспіль обидва пройшли б перевірку й друге перетерло б перше.
 *
 * Вікно `1 day` відсікає найгірший сценарій: людина натиснула `/stop`, за
 * два тижні написала боту щось стороннє — і без обмеження це осіло б як
 * «причина виходу», спотворивши єдину якісну метрику відвалу, яка в нас є.
 *
 * @returns `true`, якщо причину зараховано; `false` — якщо не чекали.
 */
export async function recordStopReason(
  pool: Pool,
  chatId: number,
  reason: string,
): Promise<boolean> {
  const trimmed = reason.trim().slice(0, STOP_REASON_MAX_LEN);
  if (!trimmed) return false;

  const result = await pool.query(
    `UPDATE telegram_waitlist
        SET stop_reason            = $2,
            -- Знімаємо очікування: причина потрібна одна, а не стрічка.
            stop_reason_awaited_at = NULL
      WHERE chat_id = $1
        AND stop_reason_awaited_at IS NOT NULL
        AND stop_reason_awaited_at > NOW() - INTERVAL '1 day'`,
    [chatId, trimmed],
  );

  return (result.rowCount ?? 0) > 0;
}

export interface SurveyAnswerInput {
  chatId: number;
  surveyId: string;
  answer: string;
}

/**
 * Записує відповідь на опитування. Другий раз на те саме питання не
 * проходить — і це вирішує БАЗА через `UNIQUE (chat_id, survey_id)`.
 *
 * `ON CONFLICT DO NOTHING RETURNING id` дає атомарну відповідь «зарахували
 * чи ні» одним запитом. Варіант «SELECT, чи вже голосував, потім INSERT»
 * виглядає читабельніше, але має вікно гонки рівно там, де воно найбільш
 * імовірне: Telegram ретраїть callback-апдейт, поки не побачить `200`, тож
 * два однакові апдейти в польоті — штатна ситуація, а не край.
 *
 * @returns `accepted: false` — людина вже відповідала; це не помилка.
 */
export async function recordSurveyAnswer(
  pool: Pool,
  input: SurveyAnswerInput,
): Promise<{ accepted: boolean }> {
  const result = await pool.query(
    `INSERT INTO telegram_beta_survey_responses (chat_id, survey_id, answer)
     VALUES ($1, $2, $3)
     ON CONFLICT (chat_id, survey_id) DO NOTHING
     RETURNING id`,
    [input.chatId, input.surveyId, input.answer],
  );

  return { accepted: (result.rowCount ?? 0) > 0 };
}

export interface WaitlistStats {
  pending: number;
  notified: number;
  optedOut: number;
  total: number;
  lastSignupAt: Date | null;
  /**
   * Розбивка за каналом. `channel` — уже готовий до показу підпис, не код:
   * зведення робить `countWaitlistStats`, а `formatStatsReply` лише друкує.
   */
  byChannel: Array<{ channel: string; count: number }>;
}

/**
 * Людські підписи каналів.
 *
 * Лежать поруч із зведенням, а не в `betaTexts.ts`, бо це не текст, який
 * читає підписник, — це підпис у службовому звіті для власника, і живе він
 * рівно там, де рахуються числа.
 */
const CHANNEL_LABELS: Record<LandingPlacement, string> = {
  hero: "Лендінг, головний екран",
  footer: "Лендінг, підвал",
  beta: "Лендінг, блок бети",
};

/** Прямий старт: людина відкрила бота без deep link-а з лендінга. */
const CHANNEL_DIRECT = "Прямий перехід";

/**
 * Payload є, але не наш: ручний ввід, чужа кампанія, старий формат, якого
 * ми більше не знаємо. Зникати такі старти не мають права — інакше сума по
 * каналах тихо розійдеться з `total`.
 */
const CHANNEL_OTHER = "Інше";

/**
 * Зведення для власника. Замінює похід у psql: єдине, що досі відповідало на
 * питання «чи видно, що людина подалась».
 *
 * `chat_id` і хендли НЕ повертаються навмисно — це персональні дані, а для
 * рішення «пора запрошувати» достатньо чисел.
 */
export async function countWaitlistStats(pool: Pool): Promise<WaitlistStats> {
  const totals = await pool.query<{
    pending: string;
    notified: string;
    opted_out: string;
    total: string;
    last_signup: Date | null;
  }>(
    `SELECT
       count(*) FILTER (WHERE notified_at IS NULL AND opted_out_at IS NULL) AS pending,
       count(*) FILTER (WHERE notified_at IS NOT NULL)                      AS notified,
       count(*) FILTER (WHERE opted_out_at IS NOT NULL)                     AS opted_out,
       count(*)                                                             AS total,
       max(created_at)                                                      AS last_signup
     FROM telegram_waitlist`,
  );

  const channels = await pool.query<{ payload: string | null; count: string }>(
    `SELECT start_payload AS payload, count(*) AS count
       FROM telegram_waitlist
      GROUP BY 1`,
  );

  // Hard Rule #1: `count(*)` у pg — bigint, тобто рядок. Коерція тут, а не
  // в шаблоні відповіді, інакше "5" + 1 дало б "51".
  const row = totals.rows[0];
  return {
    pending: Number(row?.pending ?? 0),
    notified: Number(row?.notified ?? 0),
    optedOut: Number(row?.opted_out ?? 0),
    total: Number(row?.total ?? 0),
    lastSignupAt: row?.last_signup ?? null,
    byChannel: summariseChannels(channels.rows),
  };
}

/**
 * Зводить сирі payload-и в канали.
 *
 * **Чому це не `GROUP BY start_payload` у SQL, як було до 2026-09-17.**
 * Payload має форму `<placement>_<ref>`, де `ref` — одноразовий токен, що
 * генерується на КОЖНЕ завантаження лендінга
 * (`packages/shared/src/lib/landingAttribution.ts`). Тобто кожен відвідувач
 * лишає в базі власний унікальний рядок, і групування по ньому давало не
 * розбивку, а список окремих людей: `LIMIT 10` друкував десять випадкових
 * токенів по одиниці, а питання «скільки прийшло з героя проти підвалу»
 * лишалось без відповіді взагалі. Виглядало це як косметична проблема
 * («сира назва»), хоча зламаною була сама агрегація.
 *
 * Зведення живе в JS, а не в SQL, свідомо: знання формату payload-а лежить
 * в одному місці — `landingAttribution.ts`, — і дублювати його регуляркою в
 * запиті означало б завести друге джерело істини, яке розійдеться при
 * першій же зміні формату. Ціна — рядків із бази приходить стільки, скільки
 * унікальних payload-ів; на вейтлісті в сотні-тисячі записів це один
 * дешевий запит, який робить власник вручну.
 *
 * Порядок — за спаданням кількості, далі за назвою: однакові числа не мають
 * стрибати місцями між викликами.
 */
function summariseChannels(
  rows: ReadonlyArray<{ payload: string | null; count: string }>,
): Array<{ channel: string; count: number }> {
  const totals = new Map<string, number>();

  for (const r of rows) {
    const placement = resolveLandingPlacement(r.payload);
    const label = placement
      ? CHANNEL_LABELS[placement]
      : r.payload
        ? CHANNEL_OTHER
        : CHANNEL_DIRECT;
    // Hard Rule #1: count(*) приїжджає рядком; без Number() «+» склеїв би.
    totals.set(label, (totals.get(label) ?? 0) + Number(r.count));
  }

  return [...totals]
    .map(([channel, count]) => ({ channel, count }))
    .sort((a, b) => b.count - a.count || a.channel.localeCompare(b.channel));
}

export function formatStatsReply(s: WaitlistStats): string {
  if (s.total === 0) {
    return "Вейтліст порожній, ще ніхто не натиснув Start.";
  }

  const lines = [
    `Вейтліст: ${s.total}`,
    "",
    `Чекають:      ${s.pending}`,
    `Запрошені:    ${s.notified}`,
    `Відписались:  ${s.optedOut}`,
  ];

  if (s.byChannel.length > 0) {
    lines.push("", "Канали:");
    for (const c of s.byChannel) lines.push(`  ${c.channel} — ${c.count}`);
  }

  if (s.lastSignupAt) {
    // Europe/Kyiv — доменний інваріант проєкту; сервер живе в UTC, і без
    // явної зони власник читав би час на 2-3 години назад.
    lines.push(
      "",
      `Останній: ${s.lastSignupAt.toLocaleString("uk-UA", {
        timeZone: "Europe/Kyiv",
      })}`,
    );
  }

  return lines.join("\n");
}
