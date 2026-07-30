import { timingSafeEqual } from "node:crypto";
import type { Pool } from "pg";

/**
 * Telegram-вейтліст: обробка апдейтів бота бети.
 * Спека: `docs/90-work/planning/specs/telegram-waitlist.md`.
 *
 * Модуль свідомо не знає про Express — це чисті функції над `Pool` плюс
 * парсер апдейта. Роутер лишається тонким, а логіка тестується без HTTP.
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
}

export type ParsedCommand =
  | { kind: "start"; payload: string | null }
  | { kind: "stop" }
  | { kind: "stats" }
  | { kind: "ignore" };

/**
 * Telegram обмежує `start`-payload 64 символами й набором `[A-Za-z0-9_-]`.
 * Все, що поза цим, — не наш deep link, а ручний ввід; такий payload
 * відкидаємо, щоб у колонці атрибуції не осідало сміття.
 */
const PAYLOAD_RE = /^[A-Za-z0-9_-]{1,64}$/;

export function parseCommand(update: TelegramUpdate): ParsedCommand {
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
  if (command !== "/start") return { kind: "ignore" };

  const payload = rest[0];
  return {
    kind: "start",
    payload: payload && PAYLOAD_RE.test(payload) ? payload : null,
  };
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
   * Порядковий номер у списку, рахуючи з 1.
   *
   * Стабільний назавжди: рахується від власного `id` рядка (`BIGSERIAL`,
   * монотонний, рядки ніколи не видаляються — `/stop` лише ставить
   * `opted_out_at`). Тому повторний `/start` покаже те саме число.
   *
   * Свідомо НЕ перераховується з урахуванням відписок: інакше номер стрибав
   * би вниз щоразу, коли хтось попереду натиснув `/stop`, і людина читала б
   * це як помилку. Черга на розсилку все одно рухається правильно — вибірку
   * робить `broadcast-waitlist.mjs`, і вона відписаних пропускає.
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
       opted_out_at      = NULL
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

  // Позиція від власного id, а не від created_at: id монотонний і не має
  // колізій, тож ранг стабільний між викликами. Hard Rule #1 — count(*) у pg
  // це bigint, тобто РЯДОК; коерція тут, інакше `position > limit` порівняє
  // рядок із числом і дасть тихо неправильну гілку відповіді.
  const rank = await pool.query<{ position: string }>(
    `SELECT count(*) AS position FROM telegram_waitlist WHERE id <= $1`,
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
 */
export async function recordStop(pool: Pool, chatId: number): Promise<void> {
  await pool.query(
    `UPDATE telegram_waitlist
        SET opted_out_at = NOW()
      WHERE chat_id = $1 AND opted_out_at IS NULL`,
    [chatId],
  );
}

export interface WaitlistStats {
  pending: number;
  notified: number;
  optedOut: number;
  total: number;
  lastSignupAt: Date | null;
  byChannel: Array<{ channel: string; count: number }>;
}

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

  const channels = await pool.query<{ channel: string; count: string }>(
    `SELECT coalesce(start_payload, 'без каналу') AS channel, count(*) AS count
       FROM telegram_waitlist
      GROUP BY 1
      ORDER BY count(*) DESC, 1
      LIMIT 10`,
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
    byChannel: channels.rows.map((r) => ({
      channel: r.channel,
      count: Number(r.count),
    })),
  };
}

export function formatStatsReply(s: WaitlistStats): string {
  if (s.total === 0) {
    return "Вейтліст порожній — ще ніхто не натиснув Start.";
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

export const START_REPLY_NEW =
  "Готово — ти в списку бети Sergeant. Напишу сюди, щойно відкриємо доступ.\n\n" +
  "Sergeant тримає гроші, тіло, звички та їжу в одному місці й показує звʼязки між ними.\n\n" +
  "Передумаєш — надішли /stop.";

export const START_REPLY_AGAIN =
  "Ти вже в списку — місце за тобою. Напишу, щойно відкриємо доступ.";

/**
 * Відповідь тим, хто прийшов після заповнення хвилі.
 *
 * Свідомо НЕ «ти не встиг». Відмова відсіює людину назавжди, а черга нам
 * потрібна: натиснути Start і реально зареєструватись у застосунку — різні
 * дії, і між ними відвал. Із запрошеної хвилі доходить помітно менше, ніж
 * запрошено, тож добирати доводиться саме з черги.
 *
 * Тому називаємо номер і причину, чому він рухається — це утримує.
 */
export function startReplyQueued(position: number): string {
  return (
    `Перша хвиля вже заповнена — ти ${position}-й у черзі.\n\n` +
    "Напишу, щойно звільниться місце: частина запрошених не доходить, " +
    "і черга рухається швидше, ніж здається.\n\n" +
    "Не актуально — надішли /stop."
  );
}

export const STOP_REPLY =
  "Прибрав тебе зі списку. Захочеш повернутись — просто надішли /start.";
