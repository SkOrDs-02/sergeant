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
  const result = await pool.query<{ created: boolean }>(
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
     RETURNING (xmax = 0) AS created`,
    [
      input.chatId,
      input.username,
      input.firstName,
      input.languageCode,
      input.startPayload,
    ],
  );

  return { created: result.rows[0]?.created ?? false };
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

export const START_REPLY_NEW =
  "Готово — ти в списку бети Sergeant. Напишу сюди, щойно відкриємо доступ.\n\n" +
  "Sergeant тримає гроші, тіло, звички та їжу в одному місці й показує звʼязки між ними.\n\n" +
  "Передумаєш — надішли /stop.";

export const START_REPLY_AGAIN =
  "Ти вже в списку — місце за тобою. Напишу, щойно відкриємо доступ.";

export const STOP_REPLY =
  "Прибрав тебе зі списку. Захочеш повернутись — просто надішли /start.";
