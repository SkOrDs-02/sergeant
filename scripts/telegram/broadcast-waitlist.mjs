#!/usr/bin/env node
/**
 * Розсилка інвайтів по Telegram-вейтлісту.
 * Спека: docs/90-work/planning/specs/telegram-waitlist.md
 *
 * Запускається вручну, коли відкривається чергова хвиля бети — не крон і не
 * ендпоінт: рішення «час запрошувати» ухвалює людина, а не розклад.
 *
 *   node scripts/telegram/broadcast-waitlist.mjs --dry-run
 *   node scripts/telegram/broadcast-waitlist.mjs --limit 25
 *
 * Прапорці:
 *   --dry-run       нічого не шле; друкує текст і кількість адресатів
 *   --limit N       не більше N адресатів за прогін (хвилями безпечніше)
 *   --text "..."    свій текст замість дефолтного інвайту
 *
 * Env: DATABASE_URL, TELEGRAM_WAITLIST_BOT_TOKEN, TELEGRAM_BETA_INVITE_LINK.
 */
import pg from "pg";

const args = process.argv.slice(2);
const has = (flag) => args.includes(flag);
const valueOf = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};

const DRY_RUN = has("--dry-run");
const LIMIT = Number(valueOf("--limit") ?? 0) || null;

const BOT_TOKEN = process.env.TELEGRAM_WAITLIST_BOT_TOKEN;
const INVITE_LINK = process.env.TELEGRAM_BETA_INVITE_LINK;
const DATABASE_URL = process.env.DATABASE_URL;

// Telegram ріже приблизно на 30 повідомлень/сек. Тримаємось нижче стелі:
// впертись у 429 дорожче, ніж розсилати на третину повільніше.
const SEND_INTERVAL_MS = 50;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function defaultText() {
  const invite = INVITE_LINK
    ? `\n\nГрупа бети: ${INVITE_LINK}`
    : // Порожній лінк — не привід слати лист «зайди нікуди».
      "";
  return (
    "Привіт! Відкриваємо доступ до бети Sergeant — ти в списку з самого початку.\n" +
    "Дякую, що чекав." +
    invite +
    "\n\nЯкщо передумав — надішли /stop."
  );
}

async function sendMessage(chatId, text) {
  const res = await fetch(
    `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    },
  );
  const body = await res.json().catch(() => null);
  return {
    ok: body?.ok === true,
    errorCode: body?.error_code,
    description: body?.description,
    retryAfter: body?.parameters?.retry_after,
  };
}

async function main() {
  if (!DATABASE_URL) {
    console.error("DATABASE_URL не задано");
    process.exit(1);
  }
  if (!DRY_RUN && !BOT_TOKEN) {
    console.error("TELEGRAM_WAITLIST_BOT_TOKEN не задано");
    process.exit(1);
  }
  if (!INVITE_LINK && !has("--text")) {
    console.warn(
      "⚠️  TELEGRAM_BETA_INVITE_LINK порожній — лист піде без лінка на групу.",
    );
  }

  const text = valueOf("--text") ?? defaultText();
  const pool = new pg.Pool({ connectionString: DATABASE_URL });

  const { rows } = await pool.query(
    `SELECT chat_id, telegram_username
       FROM telegram_waitlist
      WHERE notified_at IS NULL AND opted_out_at IS NULL
      ORDER BY created_at
      ${LIMIT ? "LIMIT $1" : ""}`,
    LIMIT ? [LIMIT] : [],
  );

  console.log(`Адресатів: ${rows.length}${LIMIT ? ` (ліміт ${LIMIT})` : ""}`);
  console.log("─".repeat(60));
  console.log(text);
  console.log("─".repeat(60));

  if (DRY_RUN) {
    console.log("--dry-run: нічого не надіслано.");
    await pool.end();
    return;
  }

  let sent = 0;
  let optedOut = 0;
  let failed = 0;

  for (const row of rows) {
    // pg віддає BIGINT рядком; Telegram приймає і рядок (Hard Rule #1 —
    // назовні це число, але тут значення нікуди далі не тече).
    const chatId = String(row.chat_id);
    let result = await sendMessage(chatId, text);

    // 429: чекаємо рівно стільки, скільки просить Telegram, і пробуємо раз.
    if (!result.ok && result.errorCode === 429 && result.retryAfter) {
      console.warn(`429 — чекаю ${result.retryAfter}s`);
      await sleep((result.retryAfter + 1) * 1000);
      result = await sendMessage(chatId, text);
    }

    if (result.ok) {
      // Стамп порядково, одразу після успіху: перерваний прогін можна
      // просто перезапустити, і вже запрошені не отримають другий лист.
      await pool.query(
        `UPDATE telegram_waitlist SET notified_at = NOW() WHERE chat_id = $1`,
        [chatId],
      );
      sent += 1;
    } else if (result.errorCode === 403) {
      // "bot was blocked by the user" — це відписка, а не збій.
      // Ретраїти безглуздо: писати цій людині ми більше не маємо права.
      await pool.query(
        `UPDATE telegram_waitlist SET opted_out_at = NOW() WHERE chat_id = $1`,
        [chatId],
      );
      optedOut += 1;
    } else {
      // Не стампуємо: наступний прогін спробує ще раз.
      failed += 1;
      console.warn(
        `chat ${chatId}: ${result.errorCode ?? "?"} ${result.description ?? ""}`,
      );
    }

    await sleep(SEND_INTERVAL_MS);
  }

  console.log(
    `Готово. Надіслано: ${sent}, заблокували бота: ${optedOut}, помилок: ${failed}.`,
  );
  if (failed > 0) {
    console.log("Помилкові лишились без notified_at — перезапусти скрипт.");
  }
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
